import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createRealtimeServer } from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

test("realtime rejects invalid tickets before websocket upgrade", async () => {
  const harness = await createRealtimeHarness()
  try {
    const socket = new WebSocket(`${harness.url}/ws`, ["ticket-missing"])
    await expectUpgradeRejected(socket)
  } finally {
    await harness.close()
  }
})

test("realtime rejects the upgrade when ticket authentication throws", async () => {
  const harness = await createRealtimeHarness({ rejectTicketConsumption: true })
  try {
    const socket = new WebSocket(`${harness.url}/ws`, ["ticket-repository-error"])
    await expectUpgradeRejected(socket, 503)
  } finally {
    await harness.close()
  }
})

test("realtime ignores session tokens exposed in the URL query", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110000", "Query Token")
    const socket = new WebSocket(
      `${harness.url}/ws?sessionToken=${encodeURIComponent(session.sessionToken)}`
    )
    await expectUpgradeRejected(socket)
  } finally {
    await harness.close()
  }
})

test("realtime consumes each opaque ticket once and never accepts a session protocol", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110096", "Single Use")
    const leakedSessionSocket = new WebSocket(
      `${harness.url}/ws`,
      [`session-${session.sessionToken}`]
    )
    await expectUpgradeRejected(leakedSessionSocket)

    const issued = await harness.issueTicket(session.sessionToken)
    const firstSocket = await connectSocket(harness.url, issued)
    firstSocket.close()
    const replaySocket = new WebSocket(`${harness.url}/ws`, [`ticket-${issued}`])
    await expectUpgradeRejected(replaySocket)
  } finally {
    await harness.close()
  }
})

test("realtime does not complete the websocket upgrade before ticket authentication", async () => {
  const harness = await createRealtimeHarness({ pauseTicketConsumption: true })
  try {
    const session = await harness.createSession("+905551110095", "Delayed Auth")
    const ticket = await harness.issueTicket(session.sessionToken)
    const socket = new WebSocket(`${harness.url}/ws`, [`ticket-${ticket}`])

    await harness.ticketConsumptionStarted
    assert.equal(socket.readyState, WebSocket.CONNECTING)

    harness.releaseTicketConsumption()
    await waitForOpen(socket)
    assert.equal(socket.readyState, WebSocket.OPEN)
  } finally {
    harness.releaseTicketConsumption()
    await harness.close()
  }
})

test("realtime closes oversized client messages before parsing them", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110099", "Payload Test")
    const socket = await harness.connect(session.sessionToken)
    socket.send("x".repeat(70 * 1024))
    const closeCode = await waitForClose(socket, 1000)
    assert.equal(closeCode, 1009)
  } finally {
    await harness.close()
  }
})

test("realtime closes a connection that floods client events", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110098", "Flood Test")
    const socket = await harness.connect(session.sessionToken)
    for (let index = 0; index < 61; index += 1) {
      socket.send(JSON.stringify({ type: "unknown", payload: { index } }))
    }
    assert.equal(await waitForClose(socket, 1000), 4429)
  } finally {
    await harness.close()
  }
})

test("slow authorization admits at most eight concurrent events before closing a flood", async () => {
  const harness = await createRealtimeHarness()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  harness.authService.isRealtimeUserAllowed = async () => { calls += 1; await gate; return true }
  // The family-aware authorization boundary must have the same admission protection.
  Object.assign(harness.authService, {
    isRealtimeSessionAllowed: async () => { calls += 1; await gate; return true }
  })
  try {
    const session = await harness.createSession("+905551110088", "Slow Auth")
    const socket = await harness.connect(session.sessionToken)
    for (let index = 0; index < 150; index += 1) {
      socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    }
    const closeCode = await waitForClose(socket, 300).catch(() => 0)
    assert.ok(calls <= 8, `authorization admitted ${calls} concurrent events`)
    assert.equal(closeCode, 4429)
  } finally {
    release()
    await harness.close()
  }
})

test("revoked socket cannot read private threads or receive private deliveries", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110087", "Revoked")
    const inbound = await harness.connect(session.sessionToken)
    const outbound = await harness.connect(session.sessionToken)
    const received: unknown[] = []
    outbound.on("message", (data) => received.push(JSON.parse(data.toString())))
    await harness.authService.revokeSession(session.sessionToken)
    const inboundClose = waitForClose(inbound, 500).catch(() => 0)
    const outboundClose = waitForClose(outbound, 500).catch(() => 0)
    inbound.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    harness.connectionManager.sendToUser(session.userId, {
      type: "chat.thread_listed", payload: { userId: session.userId, threads: [] }
    })
    assert.deepEqual(await Promise.all([inboundClose, outboundClose]), [4403, 4403])
    assert.deepEqual(received, [])
  } finally {
    await harness.close()
  }
})

test("token rotation preserves a socket until its session family is revoked", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110086", "Rotated")
    const socket = await harness.connect(session.sessionToken)
    const rotated = await harness.authService.refreshSession(session.sessionToken)
    assert.ok(rotated)
    const events = collectEvents(socket)
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await events.waitFor("chat.thread_listed")
    await harness.authService.revokeSession(rotated.sessionToken)
    const closed = waitForClose(socket, 500).catch(() => 0)
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    assert.equal(await closed, 4403)
  } finally {
    await harness.close()
  }
})

test("an expired session family cannot receive a private event", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110085", "Expired")
    const socket = await harness.connect(session.sessionToken)
    const resolved = await harness.authService.getSession(session.sessionToken)
    assert.ok(resolved)
    const check = harness.authService.isRealtimeSessionAllowed.bind(harness.authService)
    harness.authService.isRealtimeSessionAllowed = (identity) => check(identity, new Date(resolved.session.expiresAt))
    const received: unknown[] = []
    socket.on("message", (data) => received.push(data))
    const closed = waitForClose(socket, 500)
    harness.connectionManager.sendToUser(session.userId, { type: "chat.thread_listed", payload: { userId: session.userId, threads: [] } })
    assert.equal(await closed, 4403)
    assert.deepEqual(received, [])
  } finally {
    await harness.close()
  }
})

test("revocation leaves another session family for the same user authorized", async () => {
  const harness = await createRealtimeHarness()
  try {
    const first = await harness.createSession("+905551110084", "Two Sessions")
    const second = await harness.createSession("+905551110084", "Two Sessions", new Date(Date.now() + 61_000))
    const firstSocket = await harness.connect(first.sessionToken)
    const secondSocket = await harness.connect(second.sessionToken)
    await harness.authService.revokeSession(first.sessionToken)
    const closed = waitForClose(firstSocket, 500)
    const events = collectEvents(secondSocket)
    harness.connectionManager.sendToUser(first.userId, { type: "chat.thread_listed", payload: { userId: first.userId, threads: [] } })
    assert.equal(await closed, 4403)
    await events.waitFor("chat.thread_listed")
    assert.equal(secondSocket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("realtime closes the socket when authorization becomes unavailable", async () => {
  const harness = await createRealtimeHarness({ rejectRealtimeAuthorization: true })
  try {
    const session = await harness.createSession("+905551110091", "Auth Failure")
    const socket = await harness.connect(session.sessionToken)
    socket.send(JSON.stringify({ type: "unknown", payload: {} }))

    assert.equal(await waitForClose(socket, 1000), 1011)
  } finally {
    await harness.close()
  }
})

test("realtime rate limiting is shared across a user's connections", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110097", "User Flood")
    const firstSocket = await harness.connect(session.sessionToken)
    const secondSocket = await harness.connect(session.sessionToken)
    const firstClose = waitForClose(firstSocket, 1000).catch(() => 0)
    const secondClose = waitForClose(secondSocket, 1000).catch(() => 0)
    for (let index = 0; index < 50; index += 1) {
      firstSocket.send(JSON.stringify({ type: "unknown", payload: { index } }))
      secondSocket.send(JSON.stringify({ type: "unknown", payload: { index } }))
    }
    secondSocket.send(JSON.stringify({ type: "unknown", payload: { index: 100 } }))

    const closeCodes = await Promise.race([
      Promise.all([firstClose, secondClose]),
      new Promise<number[]>((resolve) => setTimeout(() => resolve([0, 0]), 1200))
    ])
    assert.ok(closeCodes.includes(4429))
  } finally {
    await harness.close()
  }
})

test("room join emits joined snapshot and nearby presence", async () => {
  const harness = await createRealtimeHarness()
  try {
    const first = await harness.createSession("+905551110001", "Aylin")
    const second = await harness.createSession("+905551110002", "Defne")
    const firstSocket = await harness.connect(first.sessionToken)
    const secondSocket = await harness.connect(second.sessionToken)

    const firstEvents = collectEvents(firstSocket)
    const secondEvents = collectEvents(secondSocket)

    firstSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: "public-lobby", sessionToken: first.sessionToken }
    }))
    secondSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: "public-lobby", sessionToken: second.sessionToken }
    }))

    const joined = await firstEvents.waitFor("room.joined")
    assert.equal(joined.payload.currentUserId, first.userId)
    assert.equal(joined.payload.roomId, "public-lobby")

    const nearby = await firstEvents.waitForMatching(
      "presence.nearby",
      (event) => event.payload.nearbyUsers.some((user) => user.userId === second.userId)
    )
    assert.equal(nearby.payload.userId, first.userId)
    assert.equal(nearby.payload.nearbyUsers[0]?.userId, second.userId)

    assert.equal((await secondEvents.waitFor("room.joined")).payload.currentUserId, second.userId)
  } finally {
    await harness.close()
  }
})

test("invite accept opens a mini room and mutual save creates a connection match", async () => {
  const harness = await createRealtimeHarness()
  try {
    const sender = await harness.createSession("+905551110011", "Mira")
    const recipient = await harness.createSession("+905551110012", "Yasmin")
    const senderSocket = await harness.connect(sender.sessionToken)
    const recipientSocket = await harness.connect(recipient.sessionToken)
    const senderEvents = collectEvents(senderSocket)
    const recipientEvents = collectEvents(recipientSocket)

    senderSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: "public-lobby", sessionToken: sender.sessionToken }
    }))
    recipientSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: "public-lobby", sessionToken: recipient.sessionToken }
    }))
    await senderEvents.waitFor("presence.nearby")

    senderSocket.send(JSON.stringify({
      type: "mini_room.invite",
      payload: { roomId: "public-lobby", recipientUserId: recipient.userId }
    }))
    const invite = await recipientEvents.waitFor("mini_room.invite_received")

    recipientSocket.send(JSON.stringify({
      type: "mini_room.invite_decision",
      payload: { inviteId: invite.payload.inviteId, status: "accepted" }
    }))

    const senderReady = await senderEvents.waitFor("mini_room.ready")
    const recipientReady = await recipientEvents.waitFor("mini_room.ready")
    assert.equal(senderReady.payload.miniRoom.miniRoomId, recipientReady.payload.miniRoom.miniRoomId)
    assert.match(senderReady.payload.mediaSession.token, /^demo-token-/)
    assert.deepEqual(
      senderReady.payload.participants.map((participant) => ({
        userId: participant.userId,
        presetId: participant.avatar.presetId
      })),
      [
        { userId: sender.userId, presetId: "avatar_v2_body_default" },
        { userId: recipient.userId, presetId: "avatar_v2_body_default" }
      ]
    )

    senderSocket.send(JSON.stringify({
      type: "connection.decide",
      payload: {
        miniRoomId: senderReady.payload.miniRoom.miniRoomId,
        partnerUserId: recipient.userId,
        status: "saved"
      }
    }))
    recipientSocket.send(JSON.stringify({
      type: "connection.decide",
      payload: {
        miniRoomId: senderReady.payload.miniRoom.miniRoomId,
        partnerUserId: sender.userId,
        status: "saved"
      }
    }))

    const match = await senderEvents.waitFor("connection.matched")
    assert.deepEqual(new Set(match.payload.participantUserIds), new Set([sender.userId, recipient.userId]))
  } finally {
    await harness.close()
  }
})

async function createRealtimeHarness(options: {
  pauseTicketConsumption?: boolean
  rejectTicketConsumption?: boolean
  rejectRealtimeAuthorization?: boolean
} = {}) {
  const authService = createAuthService({ codeFactory: () => "123456" })
  if (options.rejectRealtimeAuthorization) {
    authService.isRealtimeSessionAllowed = async () => {
      throw new Error("authorization store unavailable")
    }
  }
  const baseRealtimeTicketService = createRealtimeTicketService({ authService })
  let signalTicketConsumptionStarted: (() => void) | undefined
  let releaseTicketConsumption: (() => void) | undefined
  const ticketConsumptionStarted = new Promise<void>((resolve) => {
    signalTicketConsumptionStarted = resolve
  })
  const ticketConsumptionGate = new Promise<void>((resolve) => {
    releaseTicketConsumption = resolve
  })
  const realtimeTicketService = options.rejectTicketConsumption
    ? {
        issue: baseRealtimeTicketService.issue,
        async consume() {
          throw new Error("ticket repository unavailable")
        }
      }
    : options.pauseTicketConsumption
    ? {
        issue: baseRealtimeTicketService.issue,
        async consume(ticket: string, now?: Date) {
          signalTicketConsumptionStarted?.()
          await ticketConsumptionGate
          return baseRealtimeTicketService.consume(ticket, now)
        }
      }
    : baseRealtimeTicketService
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const roomService = createRoomService()
  const presenceService = createPresenceService({ roomService })
  const livekitTokenService = createLivekitTokenService()
  const miniRoomService = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService
  })
  const connectionService = createConnectionService({ miniRoomService })
  const reactionService = createReactionService()
  const realtimeServer = createRealtimeServer({
    authService,
    chatService,
    safetyService,
    presenceService,
    miniRoomService,
    connectionService,
    reactionService,
    realtimeTicketService
  })
  await realtimeServer.listen({ port: 0, host: "127.0.0.1" })
  const address = realtimeServer.address() as AddressInfo

  return {
    authService,
    connectionManager: realtimeServer.connectionManager,
    url: `ws://127.0.0.1:${address.port}`,
    ticketConsumptionStarted,
    releaseTicketConsumption() {
      releaseTicketConsumption?.()
    },
    async issueTicket(sessionToken: string) {
      const issued = await realtimeTicketService.issue(sessionToken)
      assert.ok(issued)
      return issued.ticket
    },
    async connect(sessionToken: string) {
      const issued = await realtimeTicketService.issue(sessionToken)
      assert.ok(issued)
      return connectSocket(`ws://127.0.0.1:${address.port}`, issued.ticket)
    },
    async createSession(phoneNumber: string, displayName: string, now = new Date()) {
      await authService.sendCode(phoneNumber, now)
      const verified = await authService.verifyCode(phoneNumber, "123456", now)
      await authService.updateProfile(verified.sessionToken, {
        displayName,
        age: 24,
        gender: "woman",
        avatarPresetId: "avatar_v2_body_default"
      })
      for (const step of ["profile", "avatar", "room"] as const) {
        await authService.completeOnboardingStep(verified.sessionToken, step)
      }
      return {
        userId: verified.account.userId,
        sessionToken: verified.sessionToken
      }
    },
    async close() {
      await realtimeServer.close()
    }
  }
}

function collectEvents(socket: WebSocket) {
  const events: ServerEvent[] = []
  const waiters = new Set<{
    type: ServerEvent["type"]
    accepts: (event: ServerEvent) => boolean
    resolve: (event: ServerEvent) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  socket.on("message", (data) => {
    const event = JSON.parse(data.toString()) as ServerEvent
    events.push(event)
    for (const waiter of waiters) {
      if (waiter.type === event.type && waiter.accepts(event)) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.resolve(event)
      }
    }
  })
  return {
    waitFor<T extends ServerEvent["type"]>(
      type: T
    ): Promise<Extract<ServerEvent, { type: T }>> {
      const existing = events.find((event) => event.type === type)
      if (existing) {
        return Promise.resolve(existing as Extract<ServerEvent, { type: T }>)
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          type,
          accepts: () => true,
          resolve: (event: ServerEvent) =>
            resolve(event as Extract<ServerEvent, { type: T }>),
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out waiting for ${type}`))
          }, 1000)
        }
        waiters.add(waiter)
      })
    },
    waitForMatching<T extends ServerEvent["type"]>(
      type: T,
      predicate: (event: Extract<ServerEvent, { type: T }>) => boolean
    ): Promise<Extract<ServerEvent, { type: T }>> {
      const existing = events.find(
        (event) =>
          event.type === type &&
          predicate(event as Extract<ServerEvent, { type: T }>)
      )
      if (existing) {
        return Promise.resolve(existing as Extract<ServerEvent, { type: T }>)
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          type,
          accepts: (event: ServerEvent) =>
            predicate(event as Extract<ServerEvent, { type: T }>),
          resolve: (event: ServerEvent) => {
            resolve(event as Extract<ServerEvent, { type: T }>)
          },
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out waiting for ${type}`))
          }, 1000)
        }
        waiters.add(waiter)
      })
    }
  }
}

async function connectSocket(baseUrl: string, ticket: string): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl}/ws`, [`ticket-${ticket}`])
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve())
    socket.once("error", reject)
  })
  return socket
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve)
    socket.once("error", reject)
  })
}

async function waitForClose(socket: WebSocket, timeoutMs = 1000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket close"))
    }, timeoutMs)
    socket.once("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

async function expectUpgradeRejected(
  socket: WebSocket,
  expectedStatus = 401
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for upgrade rejection")), 1000)
    socket.once("error", (error) => {
      clearTimeout(timer)
      assert.match(error.message, new RegExp(`Unexpected server response: ${expectedStatus}`))
      resolve()
    })
  })
}
