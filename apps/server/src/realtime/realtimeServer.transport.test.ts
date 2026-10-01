// Transport robustness (2026-10-01): liveness heartbeats, per-class budgets,
// CGNAT-safe upgrade limits and cross-instance revocation. Every socket and
// server is local (127.0.0.1) and closed in `finally`.
import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import type { ChatThread, ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createConnectionManager } from "./connectionManager"
import { createConnectionSetupGate, type ConnectionSetupGate } from "./connectionSetupGate"
import { REALTIME_EVENT_LIMITS } from "./realtimeEventBudget"
import type { RealtimeFanout } from "./realtimeFanout"
import type { RealtimeFanoutControl } from "./realtimeFanoutControl"
import { createRealtimeServer, REALTIME_HEARTBEAT_INTERVAL_MS } from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

type Session = { userId: string; sessionToken: string; displayName: string }

test("each heartbeat tick sends a beacon and a socket silent for a whole tick is terminated", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905554440001", "Liveness")
    const responsive = await harness.connect(session.sessionToken)
    // A peer that answers no ping and sends nothing: a dead or half-open phone.
    const silent = await harness.connect(session.sessionToken, { autoPong: false })
    const beacons: ServerEvent[] = []
    responsive.on("message", (data) => {
      const event = JSON.parse(data.toString()) as ServerEvent
      if (event.type === "realtime.heartbeat") beacons.push(event)
    })
    const silentClosed = new Promise<number>((resolve) => silent.once("close", resolve))
    harness.tickHeartbeat()
    await waitUntil(() => beacons.length === 1)
    assert.deepEqual(beacons[0], { type: "realtime.heartbeat", payload: { intervalMs: REALTIME_HEARTBEAT_INTERVAL_MS } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    harness.tickHeartbeat()
    assert.equal(await silentClosed, 1006, "terminated after one missed pong")
    assert.equal(responsive.readyState, WebSocket.OPEN, "a socket that answered stays")
  } finally {
    await harness.close()
  }
})

test("any inbound frame keeps a socket alive even if it never answers pings", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905554440002", "Chatty")
    const socket = await harness.connect(session.sessionToken, { autoPong: false })
    for (let tick = 0; tick < 3; tick += 1) {
      harness.tickHeartbeat()
      socket.send(JSON.stringify({ type: "unknown", payload: {} }))
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    assert.equal(socket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("chat over its budget is refused for a retry while the socket and other traffic carry on", async () => {
  const harness = await createHarness()
  try {
    const sender = await harness.createSession("+905554440003", "Fast Typer")
    const partner = await harness.createSession("+905554440004", "Partner")
    const thread = await harness.saveThread(sender, partner, "thread_budget")
    const socket = await harness.connect(sender.sessionToken)
    const events = collect(socket)
    const total = REALTIME_EVENT_LIMITS.chat.userWindow + 5
    for (let index = 0; index < total; index += 1) {
      socket.send(JSON.stringify({
        type: "chat.send_message",
        payload: { threadId: thread.threadId, body: `message ${index}`, clientMessageId: `client-${index}` }
      }))
      if (index % 3 === 2) await new Promise((resolve) => setTimeout(resolve, 15))
    }
    // Each send is answered once on this socket: an acknowledgement carrying
    // its retry id, or a refusal (the fanout copy carries no id).
    const acknowledged = () => events.ofType("chat.message_received")
      .filter((event) => event.type === "chat.message_received" && event.payload.clientMessageId).length
    await waitUntil(() => acknowledged() + events.ofType("realtime.error").length >= total, 3_000)
    const refused = events.ofType("realtime.error")
    assert.ok(refused.length >= 5, `refused ${refused.length}`)
    assert.ok(acknowledged() <= REALTIME_EVENT_LIMITS.chat.userWindow)
    for (const event of refused) {
      if (event.type !== "realtime.error") continue
      assert.equal(event.payload.code, "CHAT_MESSAGE_NOT_SENT")
      assert.match(event.payload.clientMessageId ?? "", /^client-\d+$/)
    }
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await waitUntil(() => events.ofType("chat.thread_listed").length === 1)
    assert.equal(socket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("an old client's chat over budget, without a retry id, is still closed with 4429", async () => {
  const harness = await createHarness()
  try {
    const sender = await harness.createSession("+905554440005", "Old Client")
    const partner = await harness.createSession("+905554440006", "Partner")
    const thread = await harness.saveThread(sender, partner, "thread_old_client")
    const socket = await harness.connect(sender.sessionToken)
    const closed = new Promise<number>((resolve) => socket.once("close", resolve))
    for (let index = 0; index < REALTIME_EVENT_LIMITS.chat.userWindow + 1; index += 1) {
      socket.send(JSON.stringify({ type: "chat.send_message", payload: { threadId: thread.threadId, body: `m ${index}` } }))
      if (index % 3 === 2) await new Promise((resolve) => setTimeout(resolve, 15))
    }
    assert.equal(await closed, 4429)
  } finally {
    await harness.close()
  }
})

test("a reaction flood is dropped without closing the socket", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905554440007", "Reactions")
    const socket = await harness.connect(session.sessionToken)
    const events = collect(socket)
    for (let index = 0; index < 80; index += 1) {
      socket.send(JSON.stringify({ type: "reaction.send", payload: { roomId: "room_none", reaction: "wave" } }))
    }
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await waitUntil(() => events.ofType("chat.thread_listed").length === 1, 2_000)
    assert.equal(socket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("phones behind one carrier address are not capped at 40 upgrades, but each account is capped", async () => {
  const harness = await createHarness({ trustedProxyAddresses: ["127.0.0.1"], upgradesPerUserWindow: 3 })
  try {
    const carrier = { "x-forwarded-for": "203.0.113.77" }
    const sockets: WebSocket[] = []
    for (let phone = 0; phone < 45; phone += 1) {
      const session = await harness.createSession(`+90555445${String(phone).padStart(4, "0")}`, `Carrier ${phone}`)
      sockets.push(await harness.connect(session.sessionToken, { headers: carrier }))
    }
    assert.equal(sockets.every((socket) => socket.readyState === WebSocket.OPEN), true)

    const churn = await harness.createSession("+905554469999", "Socket Churn")
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const socket = await harness.connect(churn.sessionToken, { headers: carrier })
      socket.close()
    }
    const ticket = await harness.issueTicket(churn.sessionToken)
    assert.equal(await upgradeStatus(harness.url, ticket, carrier), 429)
  } finally {
    await harness.close()
  }
})

test("upgrades are shed with 503 while connection setup is saturated, before the ticket is consumed", async () => {
  const setupGate = createConnectionSetupGate(1)
  const harness = await createHarness({ setupGate })
  try {
    const session = await harness.createSession("+905554440010", "Storm")
    const ticket = await harness.issueTicket(session.sessionToken)
    const release = setupGate.tryAcquire()
    assert.ok(release)
    assert.equal(await upgradeStatus(harness.url, ticket, {}), 503)
    release()
    // The refused attempt did not consume the single-use ticket.
    assert.equal(await upgradeStatus(harness.url, ticket, {}), "open")
    assert.equal(setupGate.inFlight(), 0)
  } finally {
    await harness.close()
  }
})

test("revocations travel between instances and close the user's socket within a second", async () => {
  const fanout = createControlFanout()
  const harness = await createHarness({ fanout })
  try {
    const session = await harness.createSession("+905554440008", "Revoked Elsewhere")
    const other = await harness.createSession("+905554440009", "Unaffected")
    const socket = await harness.connect(session.sessionToken)
    const otherSocket = await harness.connect(other.sessionToken)
    // Another instance signed this user out: the database already says no.
    const check = harness.authService.isRealtimeSessionAllowed.bind(harness.authService)
    harness.authService.isRealtimeSessionAllowed = async (identity) =>
      identity.userId === session.userId ? false : check(identity)
    const startedAt = performance.now()
    const closed = new Promise<number>((resolve) => socket.once("close", resolve))
    fanout.deliverRevocation({ kind: "user", userId: session.userId })
    assert.equal(await closed, 4403)
    assert.ok(performance.now() - startedAt < 1_000, "closed within a second")
    assert.equal(otherSocket.readyState, WebSocket.OPEN)

    // A local sign-out is forwarded to every other instance.
    await harness.authService.revokeSession(other.sessionToken)
    await waitUntil(() => fanout.published.length === 1)
    assert.deepEqual(fanout.published, [{ kind: "user", userId: other.userId }])
  } finally {
    await harness.close()
  }
})

function createControlFanout(): RealtimeFanout & RealtimeFanoutControl & {
  published: RealtimeAccessRevocation[]
  deliverRevocation(revocation: RealtimeAccessRevocation): void
} {
  const listeners = new Set<(revocation: RealtimeAccessRevocation) => void>()
  const published: RealtimeAccessRevocation[] = []
  return {
    published,
    isHealthy: () => true,
    hasRemotePeers: () => true,
    async publish() {},
    async subscribe() { return async () => {} },
    async publishAccessRevocation(revocation) { published.push(revocation) },
    subscribeAccessRevocations(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    deliverRevocation(revocation) {
      for (const listener of listeners) listener(revocation)
    }
  }
}

async function createHarness(options: {
  trustedProxyAddresses?: string[]
  upgradesPerUserWindow?: number
  fanout?: RealtimeFanout & Partial<RealtimeFanoutControl>
  setupGate?: ConnectionSetupGate
} = {}) {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const ticketService = createRealtimeTicketService({
    authService,
    ...(options.setupGate ? { setupGate: options.setupGate } : {})
  })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const roomService = createRoomService()
  const presenceService = createPresenceService({ roomService })
  const miniRoomService = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const intervals: { callback: () => void; ms: number }[] = []
  const originalSetInterval = globalThis.setInterval
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    intervals.push({ callback: args[0] as () => void, ms: Number(args[1]) })
    return originalSetInterval(...args)
  }) as typeof globalThis.setInterval
  let server: ReturnType<typeof createRealtimeServer>
  try {
    server = createRealtimeServer({
      authService,
      chatService,
      safetyService,
      presenceService,
      miniRoomService,
      connectionService: createConnectionService({ miniRoomService, safetyService }),
      reactionService: createReactionService(),
      realtimeTicketService: ticketService,
      ...(options.fanout ? { connectionManager: createConnectionManager({ fanout: options.fanout }) } : {}),
      ...(options.trustedProxyAddresses ? { trustedProxyAddresses: options.trustedProxyAddresses } : {}),
      ...(options.upgradesPerUserWindow ? { upgradesPerUserWindow: options.upgradesPerUserWindow } : {})
    })
  } finally {
    globalThis.setInterval = originalSetInterval
  }
  await server.listen({ port: 0, host: "127.0.0.1" })
  const address = server.address() as AddressInfo
  const url = `ws://127.0.0.1:${address.port}`
  const sockets = new Set<WebSocket>()
  const heartbeat = intervals.find((entry) => entry.ms === REALTIME_HEARTBEAT_INTERVAL_MS)
  assert.ok(heartbeat)
  return {
    authService,
    url,
    tickHeartbeat: () => heartbeat.callback(),
    async issueTicket(sessionToken: string) {
      const issued = await ticketService.issue(sessionToken)
      assert.ok(issued)
      return issued.ticket
    },
    async connect(sessionToken: string, socketOptions: WebSocket.ClientOptions = {}) {
      const issued = await ticketService.issue(sessionToken)
      assert.ok(issued)
      const socket = new WebSocket(`${url}/ws`, [`ticket-${issued.ticket}`], socketOptions)
      sockets.add(socket)
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve())
        socket.once("error", reject)
      })
      return socket
    },
    async createSession(phoneNumber: string, displayName: string): Promise<Session> {
      await authService.sendCode(phoneNumber)
      const verified = await authService.verifyCode(phoneNumber, "123456")
      await authService.updateProfile(verified.sessionToken, {
        displayName,
        age: 24,
        gender: "woman",
        avatarPresetId: "avatar_v2_body_default"
      })
      for (const step of ["profile", "avatar", "room"] as const) {
        await authService.completeOnboardingStep(verified.sessionToken, step)
      }
      return { userId: verified.account.userId, sessionToken: verified.sessionToken, displayName }
    },
    async saveThread(first: Session, second: Session, threadId: string): Promise<ChatThread> {
      const thread: ChatThread = {
        threadId,
        miniRoomId: `mini_${threadId}`,
        participantUserIds: [first.userId, second.userId],
        participants: [
          { userId: first.userId, displayName: first.displayName },
          { userId: second.userId, displayName: second.displayName }
        ],
        createdAt: new Date().toISOString()
      }
      await chatService.repository.saveThread(thread)
      return thread
    },
    async close() {
      for (const socket of sockets) {
        if (socket.readyState !== WebSocket.CLOSED) socket.terminate()
      }
      await server.close()
    }
  }
}

function collect(socket: WebSocket) {
  const events: ServerEvent[] = []
  socket.on("message", (data) => events.push(JSON.parse(data.toString()) as ServerEvent))
  return {
    ofType(type: ServerEvent["type"]) {
      return events.filter((event) => event.type === type)
    }
  }
}

async function upgradeStatus(url: string, ticket: string, headers: Record<string, string>): Promise<number | "open"> {
  const socket = new WebSocket(`${url}/ws`, [`ticket-${ticket}`], { headers })
  try {
    return await new Promise<number | "open">((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("upgrade did not settle")), 1_000)
      socket.once("open", () => { clearTimeout(timer); resolve("open") })
      socket.once("unexpected-response", (_request, response) => {
        clearTimeout(timer)
        resolve(response.statusCode ?? 0)
      })
      socket.once("error", () => undefined)
    })
  } finally {
    socket.terminate()
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition")
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}
