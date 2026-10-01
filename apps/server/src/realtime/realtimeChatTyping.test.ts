import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import { createInMemoryAuthRepository } from "../auth/authRepository"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createCapabilityService, parseCapabilityManifest } from "../capabilities/capabilityService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createConnectionManager } from "./connectionManager"
import type { RealtimeFanout } from "./realtimeFanout"
import { createRealtimeServer } from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

const THREAD = "typing-thread"

async function createHarness(options: { typingOn?: boolean } = {}) {
  const authStore = createBlumiBackendStore()
  const authService = createAuthService({
    codeFactory: () => "123456",
    store: authStore,
    repository: createInMemoryAuthRepository(authStore)
  })
  const realtimeTicketService = createRealtimeTicketService({ authService })
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
  const published: string[] = []
  const fanout: RealtimeFanout = {
    async publish(message) { published.push(message.event.type) },
    async subscribe() { return async () => undefined }
  }
  const server = createRealtimeServer({
    authService,
    chatService,
    safetyService,
    presenceService,
    miniRoomService,
    connectionService: createConnectionService({ miniRoomService, safetyService }),
    reactionService: createReactionService(),
    realtimeTicketService,
    connectionManager: createConnectionManager({ fanout }),
    capabilityService: createCapabilityService({
      manifest: parseCapabilityManifest(undefined).manifest,
      defaultRollouts: { chat_typing: 100 },
      runtimeGates: { chat_typing: () => options.typingOn ?? true }
    })
  })
  await server.listen({ port: 0, host: "127.0.0.1" })
  const { port } = server.address() as AddressInfo
  const createSession = async (phoneNumber: string, displayName: string) => {
    await authService.sendCode(phoneNumber)
    const verified = await authService.verifyCode(phoneNumber, "123456")
    await authService.updateProfile(verified.sessionToken, {
      displayName, age: 24, gender: "woman", avatarPresetId: "avatar_v2_body_default"
    })
    for (const step of ["profile", "avatar", "room"] as const) {
      await authService.completeOnboardingStep(verified.sessionToken, step)
    }
    return { userId: verified.account.userId, sessionToken: verified.sessionToken }
  }
  const connect = async (sessionToken: string) => {
    const issued = await realtimeTicketService.issue(sessionToken)
    assert.ok(issued)
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, [`ticket-${issued.ticket}`])
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject) })
    return socket
  }
  return { chatService, safetyService, published, createSession, connect, close: () => server.close() }
}

function collect(socket: WebSocket) {
  const events: ServerEvent[] = []
  socket.on("message", (data) => { events.push(JSON.parse(data.toString()) as ServerEvent) })
  return {
    typing: () => events.filter((event) => event.type === "chat.typing_updated"),
    async waitFor(type: ServerEvent["type"], count = 1) {
      const deadline = Date.now() + 1500
      while (events.filter((event) => event.type === type).length < count) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${type}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
  }
}

async function pair(harness: Awaited<ReturnType<typeof createHarness>>, suffix: string) {
  const a = await harness.createSession(`+90555111${suffix}1`, "Typist A")
  const b = await harness.createSession(`+90555111${suffix}2`, "Typist B")
  const c = await harness.createSession(`+90555111${suffix}3`, "Outsider C")
  await harness.chatService.createThread({ threadId: THREAD, miniRoomId: "typing-room",
    participantUserIds: [a.userId, b.userId], participants: [{ userId: a.userId }, { userId: b.userId }] })
  const sa = await harness.connect(a.sessionToken)
  const sb = await harness.connect(b.sessionToken)
  const sc = await harness.connect(c.sessionToken)
  return { a, b, c, sa, sb, sc, ea: collect(sa), eb: collect(sb), ec: collect(sc) }
}

const typing = (socket: WebSocket, state: string, threadId = THREAD) =>
  socket.send(JSON.stringify({ type: "chat.typing", payload: { threadId, state } }))

test("typing reaches only the partner, in process, and never the typist, an outsider or the fanout", async () => {
  const harness = await createHarness()
  try {
    const { a, sa, sc, ea, eb, ec } = await pair(harness, "01")
    typing(sa, "start")
    await eb.waitFor("chat.typing_updated")
    typing(sa, "stop")
    await eb.waitFor("chat.typing_updated", 2)
    typing(sc, "start")
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(eb.typing().map((event) => event.payload), [
      { threadId: THREAD, userId: a.userId, state: "start", expiresInMs: 6000 },
      { threadId: THREAD, userId: a.userId, state: "stop", expiresInMs: 0 }
    ])
    assert.deepEqual(ea.typing(), [], "the typist gets no echo")
    assert.deepEqual(ec.typing(), [], "an outsider neither sends nor receives")
    assert.equal(harness.published.includes("chat.typing_updated"), false, "never on the NOTIFY fanout")
  } finally { await harness.close() }
})

test("a blocked pair and a switched-off server relay nothing", async () => {
  const blocked = await createHarness()
  try {
    const { a, b, sa, eb } = await pair(blocked, "02")
    await blocked.safetyService.blockUser(b.userId, a.userId)
    typing(sa, "start")
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(eb.typing(), [])
  } finally { await blocked.close() }

  const off = await createHarness({ typingOn: false })
  try {
    const { sa, eb } = await pair(off, "03")
    typing(sa, "start")
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(eb.typing(), [])
  } finally { await off.close() }
})

test("a typing flood is shed silently: the socket stays open and chat sends keep their budget", async () => {
  const harness = await createHarness()
  try {
    const { sa, eb } = await pair(harness, "04")
    for (let index = 0; index < 300; index++) typing(sa, index % 2 ? "stop" : "start")
    // Sends still have their whole shared budget (8 in flight per socket), one by one.
    for (let index = 1; index <= 6; index++) {
      sa.send(JSON.stringify({ type: "chat.send_message", payload: { threadId: THREAD, body: `hello ${index}` } }))
      await eb.waitFor("chat.message_received", index)
    }
    assert.equal(sa.readyState, WebSocket.OPEN, "typing never closes the socket")
    assert.ok(eb.typing().length <= 20, "over the lane budget signals are dropped")
  } finally { await harness.close() }
})
