import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createSafetyService } from "../safety/safetyService"
import { createChatService } from "./chatService"
import { CHAT_TYPING_EXPIRES_MS, createChatTypingService, isChatTypingSwitchedOn } from "./chatTypingService"

const ADA = "user_ada"
const BORA = "user_bora"
const CEM = "user_cem"
const THREAD = "thread_typing"

async function setup(options: {
  rolledOut?: (userId: string) => boolean
  findThread?: (threadId: string) => Promise<{ participantUserIds: readonly string[] } | null>
} = {}) {
  const safetyService = createSafetyService()
  const chatService = createChatService({ blockPolicy: safetyService })
  await chatService.createThread({
    threadId: THREAD,
    miniRoomId: "room_typing",
    participantUserIds: [ADA, BORA],
    participants: [{ userId: ADA }, { userId: BORA }]
  })
  const events: Array<{ userId: string; event: ServerEvent }> = []
  let lookups = 0
  const typing = createChatTypingService({
    threads: {
      findThread: async (threadId) => {
        lookups += 1
        return options.findThread ? options.findThread(threadId) : chatService.repository.findThread(threadId)
      }
    },
    blockPolicy: safetyService,
    isRolledOutFor: options.rolledOut ?? (() => true),
    emit: (userId, event) => { events.push({ userId, event }) }
  })
  const relay = (userId: string, payload: unknown, connectionId = `connection_${userId}`) =>
    typing.relay({ connectionId, userId, payload })
  return { safetyService, typing, events, relay, lookups: () => lookups }
}

test("a start reaches only the partner with a bounded lifetime; a stop carries 0", async () => {
  const { events, relay } = await setup()
  await relay(ADA, { threadId: THREAD, state: "start" })
  await relay(ADA, { threadId: THREAD, state: "stop" })
  assert.deepEqual(events, [
    { userId: BORA, event: { type: "chat.typing_updated", payload: { threadId: THREAD, userId: ADA, state: "start", expiresInMs: CHAT_TYPING_EXPIRES_MS } } },
    { userId: BORA, event: { type: "chat.typing_updated", payload: { threadId: THREAD, userId: ADA, state: "stop", expiresInMs: 0 } } }
  ])
})

test("a non-participant, a missing thread and malformed or text-carrying payloads are dropped silently", async () => {
  const { events, relay } = await setup()
  await relay(CEM, { threadId: THREAD, state: "start" })
  await relay(ADA, { threadId: "thread_missing", state: "start" })
  await relay(ADA, { threadId: THREAD, state: "start", body: "secret draft" })
  await relay(ADA, { threadId: THREAD, state: "typing" })
  await relay(ADA, null)
  assert.deepEqual(events, [])
})

test("a block in either direction stops the signal at once", async () => {
  const { events, relay, safetyService } = await setup()
  await safetyService.blockUser(BORA, ADA)
  await relay(ADA, { threadId: THREAD, state: "start" })
  await relay(BORA, { threadId: THREAD, state: "start" })
  assert.deepEqual(events, [])
})

test("the kill switch (capability) must be on for the typist and the partner", async () => {
  const offForBora = await setup({ rolledOut: (userId) => userId !== BORA })
  await offForBora.relay(ADA, { threadId: THREAD, state: "start" })
  await offForBora.relay(BORA, { threadId: THREAD, state: "start" })
  assert.deepEqual(offForBora.events, [])
})

test("a thread lookup failure is swallowed without throwing", async () => {
  const { events, relay } = await setup({ findThread: async () => { throw new Error("db down") } })
  await assert.doesNotReject(relay(ADA, { threadId: THREAD, state: "start" }))
  assert.deepEqual(events, [])
})

test("a stop never overtakes its start from the same socket, and the pair is read once", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let first = true
  const safetyService = createSafetyService()
  const events: string[] = []
  const typing = createChatTypingService({
    threads: {
      findThread: async () => {
        if (first) { first = false; await gate }
        return { participantUserIds: [ADA, BORA] }
      }
    },
    blockPolicy: safetyService,
    isRolledOutFor: () => true,
    emit: (_userId, event) => { if (event.type === "chat.typing_updated") events.push(event.payload.state) }
  })
  const start = typing.relay({ connectionId: "c1", userId: ADA, payload: { threadId: THREAD, state: "start" } })
  const stop = typing.relay({ connectionId: "c1", userId: ADA, payload: { threadId: THREAD, state: "stop" } })
  release()
  await Promise.all([start, stop])
  assert.deepEqual(events, ["start", "stop"])
})

test("participant pairs are cached: repeated signals do not re-read the thread", async () => {
  const { relay, lookups } = await setup()
  for (let index = 0; index < 5; index++) await relay(ADA, { threadId: THREAD, state: "start" })
  assert.equal(lookups(), 1)
})

test("the kill switch env value keeps typing on only when unset, empty or 1", () => {
  assert.equal(isChatTypingSwitchedOn(undefined), true)
  assert.equal(isChatTypingSwitchedOn(""), true)
  assert.equal(isChatTypingSwitchedOn(" 1 "), true)
  for (const off of ["0", "false", "off", "no", "yes"]) assert.equal(isChatTypingSwitchedOn(off), false)
})
