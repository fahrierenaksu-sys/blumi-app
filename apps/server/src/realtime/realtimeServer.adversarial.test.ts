// Adversarial realtime checks (2026-09-30): hostile frames, ticket misuse,
// foreign-thread access, rate-limit evasion and request-reply fanout. Every
// socket and server is local (127.0.0.1) and closed in `finally`.
import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import type { ChatThread, ClientEvent, ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import {
  MAX_REALTIME_FANOUT_USER_TARGETS,
  splitRealtimeFanoutTarget,
  validateRealtimeFanoutMessage,
  type RealtimeFanoutTarget
} from "./realtimeFanout"
import { createRealtimeServer } from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

const CLIENT_EVENT_TYPES: readonly ClientEvent["type"][] = [
  "room.join",
  "room.leave",
  "presence.move_to_spot",
  "mini_room.invite",
  "mini_room.leave",
  "mini_room.invite_decision",
  "connection.decide",
  "chat.list_threads",
  "chat.list_messages",
  "chat.send_message",
  "reaction.send",
  "safety.block",
  "safety.report"
]

test("a ticket issued before sign-out cannot open a socket afterwards", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905553330001", "Signed Out")
    const ticket = await harness.issueTicket(session.sessionToken)
    await harness.authService.revokeSession(session.sessionToken)
    assert.equal(await upgradeStatus(harness.url, ticket), 401)
  } finally {
    await harness.close()
  }
})

test("an expired ticket is rejected and a malformed or foreign ticket never reaches the store", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905553330002", "Expired Ticket")
    const stale = await harness.ticketService.issue(session.sessionToken, new Date(Date.now() - 31_000))
    assert.ok(stale)
    assert.equal(await upgradeStatus(harness.url, stale.ticket), 401)
    for (const ticket of ["short", "x".repeat(129), "bad.ticket", stale.ticket]) {
      assert.equal(await upgradeStatus(harness.url, ticket), 401, `ticket ${JSON.stringify(ticket.slice(0, 12))}`)
    }
    // A ticket is bound to the session that requested it: another account's
    // socket opens as that other account, never as the ticket's issuer.
    const other = await harness.createSession("+905553330003", "Other")
    const otherSocket = await harness.connect(other.sessionToken)
    try {
      const events = collectEvents(otherSocket)
      otherSocket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
      const listed = await events.waitFor("chat.thread_listed")
      assert.equal(listed.payload.userId, other.userId)
    } finally {
      otherSocket.close()
    }
  } finally {
    await harness.close()
  }
})

test("malformed, binary, unknown and prototype-polluting frames cannot crash, pollute or corrupt state", async () => {
  const harness = await createHarness()
  try {
    const actor = await harness.createSession("+905553330010", "Hostile")
    const socket = await harness.connect(actor.sessionToken)
    const events = collectEvents(socket)
    const frames: string[] = [
      "not json",
      "",
      "null",
      "42",
      "[]",
      "\"chat.list_threads\"",
      "{\"type\":1,\"payload\":{}}",
      "{\"type\":\"chat.list_threads\"}",
      "{\"__proto__\":{\"type\":\"chat.list_threads\"},\"payload\":{}}",
      "{\"type\":\"__proto__\",\"payload\":{}}",
      "{\"type\":\"constructor\",\"payload\":{}}",
      "{\"type\":\"toString\",\"payload\":{}}",
      "{\"type\":\"chat.send_message\",\"payload\":{\"__proto__\":{\"polluted\":true},\"threadId\":\"thread_none\",\"body\":\"x\"}}",
      "{\"type\":\"safety.block\",\"payload\":{\"constructor\":{\"prototype\":{\"polluted\":true}},\"blockedUserId\":\"__proto__\"}}",
      JSON.stringify({ type: "safety.block", payload: { blockedUserId: actor.userId } }),
      JSON.stringify({ type: "chat.send_message", payload: { threadId: ["a"], body: { nested: true } } })
    ]
    for (const type of CLIENT_EVENT_TYPES) {
      frames.push(JSON.stringify({ type, payload: null }))
      frames.push(JSON.stringify({ type, payload: {} }))
    }
    assert.ok(frames.length < 55, "stay under the per-connection event allowance")
    // Paced: a burst above eight in-flight events is closed on its own (4429).
    for (const frame of frames) await sendPaced(socket, frame)
    await sendPaced(socket, Buffer.from([0xff, 0x00, 0xfe]))
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))

    const listed = await events.waitFor("chat.thread_listed")
    assert.equal(listed.payload.userId, actor.userId)
    assert.equal(socket.readyState, WebSocket.OPEN)
    assert.equal(({} as Record<string, unknown>).polluted, undefined)
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false)
    // No self-block, no stray block and no presence were created by any frame.
    // (A block on an arbitrary non-empty id is accepted, exactly as the HTTP
    // block route accepts it; that parity is not asserted here.)
    assert.equal(await harness.safetyService.hasBlockBetween(actor.userId, actor.userId), false)
    assert.equal((await harness.chatService.listThreadsPage(actor.userId)).threads.length, 0)
    // Only replies to the actor, the explicit presence-room rejections and the
    // accepted block acknowledgement.
    for (const event of events.all()) {
      assert.ok(["chat.thread_listed", "realtime.error", "safety.user_blocked"].includes(event.type), `unexpected ${event.type}`)
    }
  } finally {
    await harness.close()
  }
})

test("a socket cannot read, write or leave another pair's thread", async () => {
  const harness = await createHarness()
  try {
    const ada = await harness.createSession("+905553330020", "Ada")
    const bora = await harness.createSession("+905553330021", "Bora")
    const intruder = await harness.createSession("+905553330022", "Intruder")
    const thread = await harness.saveThread(ada, bora, "thread_private_pair", "2026-09-30T10:00:00.000Z")
    await harness.chatService.sendMessageIdempotently(ada.userId, thread.threadId, "private body", "client_1")

    const boraSocket = await harness.connect(bora.sessionToken)
    const intruderSocket = await harness.connect(intruder.sessionToken)
    const boraEvents = collectEvents(boraSocket)
    const intruderEvents = collectEvents(intruderSocket)
    for (const event of [
      { type: "chat.list_messages", payload: { threadId: thread.threadId } },
      { type: "chat.send_message", payload: { threadId: thread.threadId, body: "injected" } },
      { type: "mini_room.leave", payload: { miniRoomId: thread.miniRoomId } },
      { type: "reaction.send", payload: { roomId: thread.miniRoomId, reaction: "wave" } },
      { type: "connection.decide", payload: { miniRoomId: thread.miniRoomId, partnerUserId: ada.userId, status: "saved" } }
    ]) {
      intruderSocket.send(JSON.stringify(event))
    }
    intruderSocket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    const listed = await intruderEvents.waitFor("chat.thread_listed")
    assert.deepEqual(listed.payload.threads, [])
    boraSocket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await boraEvents.waitFor("chat.thread_listed")

    const leaked = JSON.stringify(intruderEvents.all())
    assert.equal(leaked.includes("private body"), false)
    assert.equal(leaked.includes(thread.threadId), false)
    assert.deepEqual(
      intruderEvents.all().filter((event) => event.type !== "chat.thread_listed" && event.type !== "realtime.error"),
      []
    )
    assert.equal(boraEvents.all().some((event) => event.type === "chat.message_received"), false)
    const messages = await harness.chatService.listMessages(ada.userId, thread.threadId)
    assert.deepEqual(messages.map((message) => message.body), ["private body"])
  } finally {
    await harness.close()
  }
})

test("the per-user event budget survives a reconnect inside its window", async () => {
  const harness = await createHarness()
  try {
    const session = await harness.createSession("+905553330030", "Reconnect Flood")
    const first = await harness.connect(session.sessionToken)
    const firstEvents = collectEvents(first)
    // 59 no-op events plus one round trip use 60 of the user's 100 events.
    for (let index = 0; index < 59; index += 1) {
      await sendPaced(first, JSON.stringify({ type: "unknown", payload: { index } }))
    }
    first.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await firstEvents.waitFor("chat.thread_listed")
    const firstClosed = waitForClose(first)
    first.close()
    await firstClosed
    await waitUntil(() => harness.connectionManager.listConnections().length === 0)

    const second = await harness.connect(session.sessionToken)
    const secondEvents = collectEvents(second)
    const secondClosed = waitForClose(second, 2_000)
    // Events 61..100 are admitted; event 101 must close the socket.
    for (let index = 0; index < 40; index += 1) {
      await sendPaced(second, JSON.stringify({ type: "unknown", payload: { index } }))
    }
    second.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    const outcome = await Promise.race([
      secondClosed.then((code) => `closed:${code}`),
      secondEvents.waitFor("chat.thread_listed", 2_000).then(() => "admitted")
    ])
    assert.equal(outcome, "closed:4429", "a reconnect must not reset the user's event window")
  } finally {
    await harness.close()
  }
})

test("a thread-list page reply goes only to the requesting socket, so two devices do not multiply pagination", async () => {
  const harness = await createHarness()
  try {
    const owner = await harness.createSession("+905553330040", "Many Threads")
    const partner = await harness.createSession("+905553330041", "Partner")
    // 120 threads are three 50-thread pages.
    for (let index = 0; index < 120; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString()
      await harness.saveThread(owner, partner, `thread_page_${String(index).padStart(3, "0")}`, createdAt)
    }
    let pageQueries = 0
    const listThreadsPage = harness.chatService.listThreadsPage.bind(harness.chatService)
    harness.chatService.listThreadsPage = async (userId, options) => {
      pageQueries += 1
      return listThreadsPage(userId, options)
    }
    const phone = await harness.connect(owner.sessionToken)
    const tablet = await harness.connect(owner.sessionToken)
    const received = { phone: 0, tablet: 0 }
    // Model the mobile client: every listed page with a cursor requests the next one.
    for (const [name, socket] of [["phone", phone], ["tablet", tablet]] as const) {
      socket.on("message", (data) => {
        const event = JSON.parse(data.toString()) as ServerEvent
        if (event.type !== "chat.thread_listed") return
        received[name] += 1
        if (event.payload.nextCursor) {
          socket.send(JSON.stringify({ type: "chat.list_threads", payload: { cursor: event.payload.nextCursor } }))
        }
      })
    }
    phone.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await waitUntil(() => received.phone >= 3, 2_000)
    // Give any fanned-out duplicate requests time to arrive.
    const tabletEvents = collectEvents(tablet)
    tablet.send(JSON.stringify({ type: "unknown", payload: {} }))
    phone.send(JSON.stringify({ type: "unknown", payload: {} }))
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    assert.equal(pageQueries, 3, `three pages cost ${pageQueries} page queries`)
    assert.deepEqual(received, { phone: 3, tablet: 0 })
    assert.equal(phone.readyState, WebSocket.OPEN)
    assert.equal(tablet.readyState, WebSocket.OPEN)
    assert.deepEqual(tabletEvents.all(), [])
  } finally {
    await harness.close()
  }
})

test("a message-list reply goes only to the requesting socket", async () => {
  const harness = await createHarness()
  try {
    const ada = await harness.createSession("+905553330050", "Ada")
    const bora = await harness.createSession("+905553330051", "Bora")
    const thread = await harness.saveThread(ada, bora, "thread_reply_scope", "2026-09-30T10:00:00.000Z")
    const phone = await harness.connect(ada.sessionToken)
    const tablet = await harness.connect(ada.sessionToken)
    const phoneEvents = collectEvents(phone)
    const tabletEvents = collectEvents(tablet)
    phone.send(JSON.stringify({ type: "chat.list_messages", payload: { threadId: thread.threadId } }))
    await phoneEvents.waitFor("chat.message_listed")
    tablet.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await tabletEvents.waitFor("chat.thread_listed")
    assert.deepEqual(tabletEvents.all().map((event) => event.type), ["chat.thread_listed"])
  } finally {
    await harness.close()
  }
})

test(
  "a realtime thread list computed before a new thread arrives after chat.thread_created on the requesting socket only",
  // Fixed 2026-09-30 on the client (owner decision: no server revision). The
  // race below is real and stays: the reply omits the new thread. The mobile
  // store records when it issued the list request and keeps threads learned
  // after it (chatStore.adversarial.test.ts, "stale first thread-list page").
  // This test pins the server facts that fix relies on: one reply per
  // request, on the requesting socket, computed at request time.
  async () => {
    const harness = await createHarness()
    try {
      const ada = await harness.createSession("+905553330060", "Ada")
      const bora = await harness.createSession("+905553330061", "Bora")
      const socket = await harness.connect(ada.sessionToken)
      const events = collectEvents(socket)
      let releaseList!: () => void
      const listGate = new Promise<void>((resolve) => { releaseList = resolve })
      let signalListRead!: () => void
      const listRead = new Promise<void>((resolve) => { signalListRead = resolve })
      const listThreadsPage = harness.chatService.listThreadsPage.bind(harness.chatService)
      harness.chatService.listThreadsPage = async (userId, options) => {
        const page = await listThreadsPage(userId, options)
        signalListRead()
        await listGate
        return page
      }
      socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
      await listRead
      // A match creates a thread while the list query result is in flight.
      const thread = await harness.saveThread(ada, bora, "thread_new_match", new Date().toISOString())
      harness.connectionManager.sendToUsers(thread.participantUserIds, { type: "chat.thread_created", payload: thread })
      await events.waitFor("chat.thread_created")
      releaseList()
      await events.waitFor("chat.thread_listed")
      const types = events.all().map((event) => event.type)
      assert.deepEqual(types, ["chat.thread_created", "chat.thread_listed"])
      const lastList = events.all().find((event) => event.type === "chat.thread_listed")
      assert.ok(lastList?.type === "chat.thread_listed")
      assert.equal(lastList.payload.append, false)
      assert.equal(
        lastList.payload.threads.some((entry) => entry.threadId === thread.threadId),
        false,
        "the reply reflects the request time, which the client compares with the thread's arrival"
      )
    } finally {
      await harness.close()
    }
  }
)

test("an in-room send with a clientMessageId is acknowledged to the requesting socket and deduplicated", async () => {
  const harness = await createHarness()
  try {
    const ada = await harness.createSession("+905553330070", "Ada")
    const bora = await harness.createSession("+905553330071", "Bora")
    const thread = await harness.saveThread(ada, bora, "thread_room_ack", "2026-09-30T10:00:00.000Z")
    const phone = await harness.connect(ada.sessionToken)
    const tablet = await harness.connect(ada.sessionToken)
    const partner = await harness.connect(bora.sessionToken)
    const phoneEvents = collectEvents(phone)
    const tabletEvents = collectEvents(tablet)
    const partnerEvents = collectEvents(partner)
    const send = { type: "chat.send_message", payload: { threadId: thread.threadId, body: "see you in the room", clientMessageId: "room_client_ack_1" } }
    phone.send(JSON.stringify(send))
    await waitUntil(() => phoneEvents.all().some((event) => event.type === "chat.message_received" && event.payload.clientMessageId === "room_client_ack_1"))
    // A retry after a lost acknowledgement reuses the id: one committed row.
    phone.send(JSON.stringify(send))
    await waitUntil(() => phoneEvents.all().filter((event) => event.type === "chat.message_received" && event.payload.clientMessageId).length === 2)
    const acknowledgements = phoneEvents.all().filter((event) => event.type === "chat.message_received" && event.payload.clientMessageId)
    assert.equal(new Set(acknowledgements.map((event) => event.type === "chat.message_received" ? event.payload.messageId : "")).size, 1)
    const messages = await harness.chatService.listMessages(ada.userId, thread.threadId)
    assert.deepEqual(messages.map((message) => message.body), ["see you in the room"])
    await partnerEvents.waitFor("chat.message_received")
    await tabletEvents.waitFor("chat.message_received")
    // The id never leaves the requesting socket: the fanout copy is unchanged.
    for (const event of [...partnerEvents.all(), ...tabletEvents.all()]) {
      if (event.type === "chat.message_received") assert.equal(event.payload.clientMessageId, undefined)
    }
  } finally {
    await harness.close()
  }
})

test("a refused in-room send reports realtime.error with its clientMessageId to the requester only", async () => {
  const harness = await createHarness()
  try {
    const ada = await harness.createSession("+905553330080", "Ada")
    const bora = await harness.createSession("+905553330081", "Bora")
    const intruder = await harness.createSession("+905553330082", "Intruder")
    const thread = await harness.saveThread(ada, bora, "thread_room_refused", "2026-09-30T10:00:00.000Z")
    const socket = await harness.connect(intruder.sessionToken)
    const other = await harness.connect(intruder.sessionToken)
    const events = collectEvents(socket)
    const otherEvents = collectEvents(other)
    socket.send(JSON.stringify({ type: "chat.send_message", payload: { threadId: thread.threadId, body: "injected", clientMessageId: "room_client_refused" } }))
    const refused = await events.waitFor("realtime.error")
    assert.equal(refused.payload.code, "CHAT_MESSAGE_NOT_SENT")
    assert.equal(refused.payload.requestType, "chat.send_message")
    assert.equal(refused.payload.clientMessageId, "room_client_refused")
    assert.equal(JSON.stringify(refused).includes("injected"), false)
    // A send without a client id (older clients) keeps the old silent behaviour.
    socket.send(JSON.stringify({ type: "chat.send_message", payload: { threadId: thread.threadId, body: "injected" } }))
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await events.waitFor("chat.thread_listed")
    assert.equal(events.all().filter((event) => event.type === "realtime.error").length, 1)
    assert.equal(socket.readyState, WebSocket.OPEN)
    assert.deepEqual(otherEvents.all(), [])
  } finally {
    await harness.close()
  }
})

test("pre-authentication upgrade attempts are limited per client address before any ticket is consumed", async () => {
  const harness = await createHarness({ upgradeAttemptsPerAddressWindow: 5 })
  try {
    let consumed = 0
    const consume = harness.ticketService.consume.bind(harness.ticketService)
    harness.ticketService.consume = async (ticket, now) => {
      consumed += 1
      return consume(ticket, now)
    }
    const fake = "f".repeat(43)
    const statuses: (number | "open")[] = []
    for (let attempt = 0; attempt < 8; attempt += 1) statuses.push(await upgradeStatus(harness.url, fake))
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429, 429])
    assert.equal(consumed, 5, "refused attempts never reach the ticket store")
    // A spoofed X-Forwarded-For is ignored without a trusted proxy.
    assert.equal(await upgradeStatus(harness.url, fake, { "x-forwarded-for": "203.0.113.9" }), 429)
  } finally {
    await harness.close()
  }
})

test("behind a trusted proxy the upgrade limit keys on the forwarded client address", async () => {
  const harness = await createHarness({ upgradeAttemptsPerAddressWindow: 2, trustedProxyAddresses: ["127.0.0.1"] })
  try {
    const fake = "f".repeat(43)
    const first = { "x-forwarded-for": "203.0.113.10" }
    const second = { "x-forwarded-for": "203.0.113.11" }
    assert.equal(await upgradeStatus(harness.url, fake, first), 401)
    assert.equal(await upgradeStatus(harness.url, fake, first), 401)
    assert.equal(await upgradeStatus(harness.url, fake, first), 429)
    assert.equal(await upgradeStatus(harness.url, fake, second), 401, "another client behind the same proxy is unaffected")
  } finally {
    await harness.close()
  }
})

test("fanout chunking is exact at the 100-recipient receiver boundary", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `user_${index}`)
  const sizes = (target: RealtimeFanoutTarget) =>
    splitRealtimeFanoutTarget(target).map((chunk) => chunk.kind === "users" ? chunk.userIds.length : -1)
  assert.equal(MAX_REALTIME_FANOUT_USER_TARGETS, 100)
  assert.deepEqual(sizes({ kind: "users", userIds: ids(1) }), [1])
  assert.deepEqual(sizes({ kind: "users", userIds: ids(99) }), [99])
  assert.deepEqual(sizes({ kind: "users", userIds: ids(100) }), [100])
  assert.deepEqual(sizes({ kind: "users", userIds: ids(101) }), [100, 1])
  assert.deepEqual(sizes({ kind: "users", userIds: ids(200) }), [100, 100])
  assert.deepEqual(sizes({ kind: "users", userIds: ids(201) }), [100, 100, 1])
  const event: ServerEvent = { type: "safety.user_blocked", payload: { blockedUserId: "x" } }
  for (const count of [1, 100, 101, 201]) {
    const chunks = splitRealtimeFanoutTarget({ kind: "users", userIds: ids(count) })
    const flattened = chunks.flatMap((chunk) => chunk.kind === "users" ? [...chunk.userIds] : [])
    assert.deepEqual(flattened, ids(count), `${count} recipients survive chunking in order`)
    for (const target of chunks) {
      assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target, event }), true)
    }
  }
  // Receivers still reject what a publisher must never send.
  assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target: { kind: "users", userIds: ids(101) }, event }), false)
  assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target: { kind: "users", userIds: [] }, event }), false)
  assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target: { kind: "user", userId: "a\nb" }, event }), false)
  assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target: { kind: "user", userId: "a" }, event: { type: "realtime.error", payload: {} } }), false)
  assert.equal(validateRealtimeFanoutMessage({ origin: "instance_a", target: { kind: "user", userId: "a" }, event: { type: "__proto__", payload: {} } }), false)
})

type Session = { userId: string; sessionToken: string; displayName: string }

async function createHarness(options: {
  upgradeAttemptsPerAddressWindow?: number
  trustedProxyAddresses?: string[]
} = {}) {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const ticketService = createRealtimeTicketService({ authService })
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
  const server = createRealtimeServer({
    authService,
    chatService,
    safetyService,
    presenceService,
    miniRoomService,
    connectionService: createConnectionService({ miniRoomService, safetyService }),
    reactionService: createReactionService(),
    realtimeTicketService: ticketService,
    ...options
  })
  await server.listen({ port: 0, host: "127.0.0.1" })
  const address = server.address() as AddressInfo
  const url = `ws://127.0.0.1:${address.port}`
  const sockets = new Set<WebSocket>()
  return {
    authService,
    ticketService,
    chatService,
    safetyService,
    connectionManager: server.connectionManager,
    url,
    async issueTicket(sessionToken: string) {
      const issued = await ticketService.issue(sessionToken)
      assert.ok(issued)
      return issued.ticket
    },
    async connect(sessionToken: string) {
      const issued = await ticketService.issue(sessionToken)
      assert.ok(issued)
      const socket = new WebSocket(`${url}/ws`, [`ticket-${issued.ticket}`])
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
    async saveThread(first: Session, second: Session, threadId: string, createdAt: string): Promise<ChatThread> {
      const thread: ChatThread = {
        threadId,
        miniRoomId: `mini_${threadId}`,
        participantUserIds: [first.userId, second.userId],
        participants: [
          { userId: first.userId, displayName: first.displayName },
          { userId: second.userId, displayName: second.displayName }
        ],
        createdAt
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

async function upgradeStatus(
  url: string,
  ticket: string,
  headers: Record<string, string> = {}
): Promise<number | "open"> {
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

function collectEvents(socket: WebSocket) {
  const events: ServerEvent[] = []
  socket.on("message", (data, isBinary) => {
    if (isBinary) return
    events.push(JSON.parse(data.toString()) as ServerEvent)
  })
  return {
    all: () => [...events],
    async waitFor<T extends ServerEvent["type"]>(type: T, timeoutMs = 1_000): Promise<Extract<ServerEvent, { type: T }>> {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const found = events.find((event) => event.type === type)
        if (found) return found as Extract<ServerEvent, { type: T }>
        await new Promise<void>((resolve) => setTimeout(resolve, 2))
      }
      throw new Error(`Timed out waiting for ${type}`)
    }
  }
}

async function sendPaced(socket: WebSocket, frame: string | Buffer): Promise<void> {
  socket.send(frame, { binary: Buffer.isBuffer(frame) })
  await new Promise<void>((resolve) => setTimeout(resolve, 3))
}

async function waitForClose(socket: WebSocket, timeoutMs = 1_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for close")), timeoutMs)
    socket.once("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition")
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}
