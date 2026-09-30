// Owner decision 2026-09-30: authenticated sessions no longer join the legacy
// shared public lobby, and presence is never relayed between users who block
// one another. The approved loop is mutual match -> text chat -> optional
// chat-initiated room invite (HTTP) -> shared room. These tests drive the real
// Fastify routes and the real websocket server over shared services.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import type { AddressInfo } from "node:net"
import type { ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore
} from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"
import { createConnectionManager } from "./connectionManager"
import { LEGACY_PUBLIC_LOBBY_ROOM_ID } from "./realtimePresencePolicy"
import { createRealtimeServer } from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

const LOBBY_PRESENCE_EVENT_TYPES = new Set<ServerEvent["type"]>([
  "room.joined",
  "presence.snapshot",
  "presence.nearby",
  "mini_room.invite_received"
])

test("two matched accounts exchange no lobby data and complete match -> chat -> room invite -> shared room", async () => {
  const harness = await createHarness()
  try {
    const { ada, bora, threadId } = await harness.createMatchedPair("01")
    const adaSocket = await harness.connect(ada.sessionToken)
    const boraSocket = await harness.connect(bora.sessionToken)
    const adaEvents = collectEvents(adaSocket)
    const boraEvents = collectEvents(boraSocket)

    adaSocket.send(JSON.stringify({
      type: "chat.send_message",
      payload: { threadId, body: "Hi Bora" }
    }))
    const received = await boraEvents.waitFor("chat.message_received")
    assert.equal(received.payload.body, "Hi Bora")

    const invite = await harness.http("POST", `/v1/threads/${threadId}/room-invites`, ada.sessionToken, {})
    assert.equal(invite.statusCode, 201)
    await boraEvents.waitFor("chat.room_invite_updated")
    const accepted = await harness.http(
      "POST",
      `/v1/room-invites/${invite.json().invite.inviteId}/decision`,
      bora.sessionToken,
      { status: "accepted" }
    )
    assert.equal(accepted.statusCode, 200)
    const adaReady = await adaEvents.waitFor("mini_room.ready")
    const boraReady = await boraEvents.waitFor("mini_room.ready")
    const miniRoomId = adaReady.payload.miniRoom.miniRoomId
    assert.equal(boraReady.payload.miniRoom.miniRoomId, miniRoomId)
    assert.equal(adaReady.payload.miniRoom.sourceThreadId, threadId)

    adaSocket.send(JSON.stringify({
      type: "reaction.send",
      payload: { roomId: miniRoomId, reaction: "wave" }
    }))
    const reaction = await boraEvents.waitFor("reaction.received")
    assert.equal(reaction.payload.actorUserId, ada.userId)
    assert.equal(reaction.payload.roomId, miniRoomId)

    for (const [socket, partner] of [[adaSocket, bora], [boraSocket, ada]] as const) {
      socket.send(JSON.stringify({
        type: "connection.decide",
        payload: { miniRoomId, partnerUserId: partner.userId, status: "saved" }
      }))
    }
    const matched = await adaEvents.waitFor("connection.matched")
    assert.deepEqual(new Set(matched.payload.participantUserIds), new Set([ada.userId, bora.userId]))
    await boraEvents.waitFor("connection.matched")

    await settle(adaSocket, adaEvents)
    await settle(boraSocket, boraEvents)
    for (const events of [adaEvents, boraEvents]) {
      assert.deepEqual(events.all().filter((event) => LOBBY_PRESENCE_EVENT_TYPES.has(event.type)), [])
    }
    assert.equal(await harness.presenceService.findUserPresence(LEGACY_PUBLIC_LOBBY_ROOM_ID, ada.userId), null)
    assert.equal(await harness.presenceService.findUserPresence(LEGACY_PUBLIC_LOBBY_ROOM_ID, bora.userId), null)
  } finally {
    await harness.close()
  }
})

test("blocked accounts receive no presence, snapshot, nearby, or reaction data about each other and cannot rejoin a room", async () => {
  const harness = await createHarness()
  try {
    const { ada, bora, threadId } = await harness.createMatchedPair("02")
    const adaSocket = await harness.connect(ada.sessionToken)
    const boraSocket = await harness.connect(bora.sessionToken)
    const adaEvents = collectEvents(adaSocket)
    const boraEvents = collectEvents(boraSocket)

    const invite = await harness.http("POST", `/v1/threads/${threadId}/room-invites`, ada.sessionToken, {})
    assert.equal(invite.statusCode, 201)
    const accepted = await harness.http(
      "POST",
      `/v1/room-invites/${invite.json().invite.inviteId}/decision`,
      bora.sessionToken,
      { status: "accepted" }
    )
    assert.equal(accepted.statusCode, 200)
    const miniRoomId = (await adaEvents.waitFor("mini_room.ready")).payload.miniRoom.miniRoomId
    await boraEvents.waitFor("mini_room.ready")

    adaSocket.send(JSON.stringify({ type: "safety.block", payload: { blockedUserId: bora.userId } }))
    assert.equal((await adaEvents.waitFor("safety.user_blocked")).payload.blockedUserId, bora.userId)
    await adaEvents.waitFor("mini_room.ended")
    await boraEvents.waitFor("mini_room.ended")
    const adaBaseline = adaEvents.all().length
    const boraBaseline = boraEvents.all().length

    // Both former participants try the ended room and the retired lobby.
    for (const socket of [adaSocket, boraSocket]) {
      socket.send(JSON.stringify({ type: "reaction.send", payload: { roomId: miniRoomId, reaction: "heart" } }))
      socket.send(JSON.stringify({ type: "room.join", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID } }))
    }
    await adaEvents.waitForCount("realtime.error", 1)
    await boraEvents.waitForCount("realtime.error", 1)
    const reinvite = await harness.http("POST", `/v1/threads/${threadId}/room-invites`, bora.sessionToken, {})
    assert.equal(reinvite.statusCode, 403)
    const rejoin = await harness.http("POST", `/v1/room-sessions/${miniRoomId}/join`, bora.sessionToken, {})
    // The block ended the room, so rejoining is refused (INVITE_NOT_AVAILABLE).
    assert.equal(rejoin.statusCode, 409)
    assert.equal(rejoin.json().code, "INVITE_NOT_AVAILABLE")
    assert.equal(
      await harness.miniRoomService.findActiveMiniRoomForUser(bora.userId),
      null
    )

    await settle(adaSocket, adaEvents)
    await settle(boraSocket, boraEvents)
    for (const [events, baseline] of [[adaEvents, adaBaseline], [boraEvents, boraBaseline]] as const) {
      const after = events.all().slice(baseline)
      assert.deepEqual(
        after.filter((event) => event.type !== "chat.thread_listed").map((event) => event.type),
        ["realtime.error"],
        "only the requester's own lobby rejection is delivered"
      )
      assert.deepEqual(events.all().filter((event) => LOBBY_PRESENCE_EVENT_TYPES.has(event.type)), [])
    }
    assert.equal(
      boraEvents.all().some((event) => event.type === "reaction.received" && event.payload.actorUserId === ada.userId),
      false
    )
  } finally {
    await harness.close()
  }
})

for (const deployEnvironment of ["staging", "production"] as const) {
  test(`legacy or modified clients cannot join, move in, or invite through the public lobby (BLUMI_DEPLOY_ENV=${deployEnvironment})`, async () => {
    const previous = process.env.BLUMI_DEPLOY_ENV
    process.env.BLUMI_DEPLOY_ENV = deployEnvironment
    const harness = await createHarness()
    try {
      const { ada: legacy, bora: target } = await harness.createMatchedPair("03")
      const observer = await harness.createAccount("+905551119099", "Observer")
      // Simulate a presence row persisted before the retirement was deployed.
      await harness.presenceService.joinRoom({
        roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID,
        profile: await harness.profileOf(target.userId),
        initialSpotId: "seat-right"
      })
      const legacySocket = await harness.connect(legacy.sessionToken)
      const targetSocket = await harness.connect(target.sessionToken)
      const observerSocket = await harness.connect(observer.sessionToken)
      const legacyEvents = collectEvents(legacySocket)
      const targetEvents = collectEvents(targetSocket)
      const observerEvents = collectEvents(observerSocket)

      const attempts = [
        { type: "room.join", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID, sessionToken: legacy.sessionToken } },
        { type: "room.join", payload: { roomId: ` ${LEGACY_PUBLIC_LOBBY_ROOM_ID} ` } },
        { type: "room.join", payload: { roomId: "some-other-room" } },
        { type: "presence.move_to_spot", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID, spotId: "seat-left" } },
        { type: "mini_room.invite", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID, recipientUserId: target.userId } },
        { type: "mini_room.invite_decision", payload: { inviteId: "invite_forged", status: "accepted" } },
        { type: "reaction.send", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID, reaction: "wave" } }
      ] as const
      // Paced one at a time: the socket's in-flight limit is not under test.
      for (const [index, attempt] of attempts.entries()) {
        legacySocket.send(JSON.stringify(attempt))
        await legacyEvents.waitForCount("realtime.error", index + 1)
      }
      // A leave of the retired room must not publish the stale row either.
      legacySocket.send(JSON.stringify({ type: "room.leave", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID } }))
      await legacyEvents.waitFor("room.left")

      await settle(legacySocket, legacyEvents)
      const legacyTypes = legacyEvents.all()
        .filter((event) => event.type !== "chat.thread_listed")
      assert.deepEqual(
        legacyTypes.map((event) => event.type === "realtime.error" ? event.payload.requestType : event.type),
        [...attempts.map((attempt) => attempt.type), "room.left"]
      )
      for (const event of legacyTypes) {
        if (event.type !== "realtime.error") continue
        assert.deepEqual(event.payload, {
          code: "PRESENCE_ROOM_UNAVAILABLE",
          requestType: event.payload.requestType,
          message: "That room is not available."
        })
      }
      await settle(targetSocket, targetEvents)
      await settle(observerSocket, observerEvents)
      for (const events of [targetEvents, observerEvents]) {
        assert.deepEqual(events.all().filter((event) => event.type !== "chat.thread_listed"), [])
      }
      assert.equal(await harness.presenceService.findUserPresence(LEGACY_PUBLIC_LOBBY_ROOM_ID, legacy.userId), null)
      assert.equal(await harness.presenceService.findUserPresence(LEGACY_PUBLIC_LOBBY_ROOM_ID, observer.userId), null)
    } finally {
      if (previous === undefined) delete process.env.BLUMI_DEPLOY_ENV
      else process.env.BLUMI_DEPLOY_ENV = previous
      await harness.close()
    }
  })
}

test("after a socket reconnect the server still rejects the lobby and still delivers chat and invite events", async () => {
  const harness = await createHarness()
  try {
    const { ada, bora, threadId } = await harness.createMatchedPair("04")
    const firstSocket = await harness.connect(ada.sessionToken)
    const closed = new Promise<void>((resolveClose) => firstSocket.once("close", () => resolveClose()))
    firstSocket.close()
    await closed

    const adaSocket = await harness.connect(ada.sessionToken)
    const boraSocket = await harness.connect(bora.sessionToken)
    const adaEvents = collectEvents(adaSocket)
    const boraEvents = collectEvents(boraSocket)
    adaSocket.send(JSON.stringify({ type: "room.join", payload: { roomId: LEGACY_PUBLIC_LOBBY_ROOM_ID } }))
    assert.equal((await adaEvents.waitFor("realtime.error")).payload.requestType, "room.join")

    boraSocket.send(JSON.stringify({ type: "chat.send_message", payload: { threadId, body: "Still there?" } }))
    assert.equal((await adaEvents.waitFor("chat.message_received")).payload.body, "Still there?")
    const invite = await harness.http("POST", `/v1/threads/${threadId}/room-invites`, bora.sessionToken, {})
    assert.equal(invite.statusCode, 201)
    assert.equal((await adaEvents.waitFor("chat.room_invite_updated")).payload.inviteId, invite.json().invite.inviteId)

    await settle(adaSocket, adaEvents)
    await settle(boraSocket, boraEvents)
    for (const events of [adaEvents, boraEvents]) {
      assert.deepEqual(events.all().filter((event) => LOBBY_PRESENCE_EVENT_TYPES.has(event.type)), [])
    }
  } finally {
    await harness.close()
  }
})

test("presence policy and router never branch on the deploy environment", () => {
  for (const file of ["realtimePresencePolicy.ts", "realtimeRouter.ts"]) {
    const source = readFileSync(resolve(__dirname, "../../src/realtime", file), "utf8")
    assert.doesNotMatch(source, /deployEnvironment|BLUMI_DEPLOY_ENV|NODE_ENV/, file)
  }
})

async function createHarness() {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const miniRoomService = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const connectionService = createConnectionService({ miniRoomService, safetyService })
  const connectionManager = createConnectionManager()
  const realtimeTicketService = createRealtimeTicketService({ authService })
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    connectionService,
    connectionManager,
    realtimeTicketService
  })
  const realtime = createRealtimeServer({
    authService,
    chatService,
    safetyService,
    presenceService,
    miniRoomService,
    connectionService,
    reactionService: createReactionService(),
    connectionManager,
    realtimeTicketService
  })
  await realtime.listen({ port: 0, host: "127.0.0.1" })
  const port = (realtime.address() as AddressInfo).port

  async function createAccount(phoneNumber: string, displayName: string) {
    await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })
    const verified = await app.inject({
      method: "POST",
      url: "/v1/accounts/register",
      payload: {
        termsAcceptance: { version: "test-terms-v1", locale: "tr" },
        phoneNumber,
        verificationCode: "482931"
      }
    })
    const sessionToken = verified.json().session.sessionToken as string
    const userId = verified.json().session.userId as string
    assert.equal(verified.json().session.mode, "production")
    await authService.updateProfile(sessionToken, {
      displayName,
      age: 24,
      gender: "woman",
      avatarPresetId: "avatar_v2_body_default"
    })
    for (const step of ["profile", "avatar", "room"] as const) {
      await authService.completeOnboardingStep(sessionToken, step)
    }
    return { sessionToken, userId }
  }

  return {
    presenceService,
    miniRoomService,
    createAccount,
    async createMatchedPair(suffix: string) {
      const ada = await createAccount(`+9055511190${suffix}`, "Ada")
      const bora = await createAccount(`+9055511191${suffix}`, "Bora")
      const matchId = `mutual_${suffix}`
      await matchService.repository.createMatch({
        matchId,
        participantUserIds: [ada.userId, bora.userId],
        matchedAt: "2026-09-29T10:00:00.000Z"
      })
      const threadId = `thread_match_${matchId}`
      await chatService.createThread({
        threadId,
        miniRoomId: `match_${matchId}`,
        participantUserIds: [ada.userId, bora.userId],
        participants: [
          { userId: ada.userId, displayName: "Ada" },
          { userId: bora.userId, displayName: "Bora" }
        ]
      })
      return { ada, bora, threadId }
    },
    async profileOf(userId: string) {
      const account = await authService.repository.findAccountByUserId(userId)
      assert.ok(account)
      return account.profile
    },
    http(method: "GET" | "POST", url: string, sessionToken: string, payload?: unknown) {
      return app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${sessionToken}` },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> })
      })
    },
    async connect(sessionToken: string) {
      const issued = await realtimeTicketService.issue(sessionToken)
      assert.ok(issued)
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, [`ticket-${issued.ticket}`])
      await new Promise<void>((resolveOpen, reject) => {
        socket.once("open", () => resolveOpen())
        socket.once("error", reject)
      })
      return socket
    },
    async close() {
      await realtime.close()
      await app.close()
    }
  }
}

/**
 * Round-trips a harmless request on the socket and then yields briefly, so
 * any stray event produced by earlier requests would already have arrived.
 * Callers first await the events they expect; this only guards against extras.
 */
async function settle(socket: WebSocket, events: ReturnType<typeof collectEvents>) {
  const before = events.all().filter((event) => event.type === "chat.thread_listed").length
  socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
  await events.waitForCount("chat.thread_listed", before + 1)
  await new Promise<void>((resolveTick) => setTimeout(resolveTick, 50))
}

function collectEvents(socket: WebSocket) {
  const events: ServerEvent[] = []
  const listeners = new Set<() => void>()
  socket.on("message", (data) => {
    events.push(JSON.parse(data.toString()) as ServerEvent)
    for (const listener of listeners) listener()
  })
  function waitUntil<T>(find: () => T | undefined, label: string): Promise<T> {
    const existing = find()
    if (existing !== undefined) return Promise.resolve(existing)
    return new Promise((resolveWait, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check)
        reject(new Error(`Timed out waiting for ${label}`))
      }, 2000)
      function check() {
        const found = find()
        if (found === undefined) return
        clearTimeout(timer)
        listeners.delete(check)
        resolveWait(found)
      }
      listeners.add(check)
    })
  }
  return {
    all(): ServerEvent[] {
      return [...events]
    },
    waitFor<T extends ServerEvent["type"]>(type: T): Promise<Extract<ServerEvent, { type: T }>> {
      return waitUntil(
        () => events.find((event) => event.type === type) as Extract<ServerEvent, { type: T }> | undefined,
        type
      )
    },
    waitForCount(type: ServerEvent["type"], count: number): Promise<number> {
      return waitUntil(() => {
        const seen = events.filter((event) => event.type === type).length
        return seen >= count ? seen : undefined
      }, `${count} x ${type}`)
    }
  }
}
