import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createCapabilityService, parseCapabilityManifest } from "../capabilities/capabilityService"
import { createInMemoryChatRepository, createInMemoryChatStore } from "../chat/chatRepository"
import { createAdversarialServer, type AdversarialServer, type SyntheticAccount } from "./adversarialFixture"

const RECEIPTS_ROLLED_OUT = createCapabilityService({
  manifest: parseCapabilityManifest(JSON.stringify({
    rollouts: { db_chat_metadata_ready: 100, chat_read_receipts: 100 }
  })).manifest
})

async function createPair(options: Parameters<typeof createAdversarialServer>[0] = {}) {
  const server = createAdversarialServer(options)
  await server.app.ready()
  const ada = await server.createAccount("ada")
  const bora = await server.createAccount("bora")
  const threadId = await server.matchAndThread(ada, bora, `receipts_${Math.random().toString(36).slice(2, 8)}`)
  const events: Array<{ userId: string; event: ServerEvent }> = []
  const sendToUser = server.connectionManager.sendToUser.bind(server.connectionManager)
  server.connectionManager.sendToUser = (userId, event) => {
    events.push({ userId, event })
    return sendToUser(userId, event)
  }
  return { server, ada, bora, threadId, events }
}

function receiptsFor(events: Array<{ userId: string; event: ServerEvent }>, userId: string) {
  return events.filter((entry) => entry.userId === userId && entry.event.type === "chat.receipt_updated")
    .map((entry) => entry.event.type === "chat.receipt_updated" ? entry.event.payload : null)
}

async function send(server: AdversarialServer, account: SyntheticAccount, threadId: string, body: string) {
  const response = await server.call("POST", `/v1/threads/${threadId}/messages`, { token: account.sessionToken, payload: { body } })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().message as { messageId: string; sentAt: string }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
  assert.fail("Timed out waiting for a receipt")
}

test("a read without a body keeps the old behaviour; a named partner message becomes the read cursor", async () => {
  const { server, ada, bora, threadId } = await createPair({ capabilityService: RECEIPTS_ROLLED_OUT })
  try {
    const message = await send(server, ada, threadId, "hello")
    const read = (payload?: unknown) => server.call("POST", `/v1/threads/${threadId}/read`, { token: bora.sessionToken, payload })

    const legacy = await read()
    assert.equal(legacy.statusCode, 200, legacy.body)
    assert.ok(Number.isFinite(Date.parse(legacy.json().readAt)))
    assert.equal((await read({})).statusCode, 200)

    const named = await server.call("POST", `/v1/threads/${threadId}/read`, {
      token: ada.sessionToken,
      payload: { upToMessageId: message.messageId }
    })
    assert.equal(named.statusCode, 400, "a reader names the partner's message, not their own")
    assert.equal(named.json().code, "CHAT_READ_CURSOR_INVALID")

    for (const payload of [{ upToMessageId: " " }, { upToMessageId: 7 }, "null", "[]"]) {
      const response = await server.call("POST", `/v1/threads/${threadId}/read`, {
        token: bora.sessionToken,
        payload,
        headers: { "content-type": "application/json" }
      })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    // Like every route here, unknown keys are stripped (Fastify removeAdditional):
    // a client-chosen timestamp is never honoured; the server clock decides.
    const clientTime = await read({ readAt: "2000-01-01T00:00:00.000Z" })
    assert.equal(clientTime.statusCode, 200)
    assert.notEqual(clientTime.json().readAt, "2000-01-01T00:00:00.000Z")
  } finally {
    await server.app.close()
  }
})

test("history and acks report delivery to the sender; read state needs both settings", async () => {
  const { server, ada, bora, threadId, events } = await createPair({ capabilityService: RECEIPTS_ROLLED_OUT })
  try {
    const message = await send(server, ada, threadId, "hello")
    const cursor = { sentAt: message.sentAt, messageId: message.messageId }

    const history = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: bora.sessionToken })
    assert.equal(history.statusCode, 200)
    assert.deepEqual(history.json().partnerReceipts, {}, "Ada has received nothing from Bora")
    await waitFor(() => receiptsFor(events, ada.userId).length === 1)
    assert.deepEqual(receiptsFor(events, ada.userId)[0]?.deliveredUpTo, cursor)
    assert.deepEqual(receiptsFor(events, bora.userId), [], "the reader never receives their own receipt")

    const adaThreads = await server.call("GET", "/v1/threads", { token: ada.sessionToken })
    assert.deepEqual(adaThreads.json().threads[0].partnerReceipts, { deliveredUpTo: cursor })

    const readUpTo = (account: SyntheticAccount) => server.call("POST", `/v1/threads/${threadId}/read`, {
      token: account.sessionToken,
      payload: { upToMessageId: message.messageId }
    })
    assert.equal((await readUpTo(bora)).statusCode, 200)
    assert.equal(receiptsFor(events, ada.userId).some((receipt) => receipt?.readUpTo), false, "read receipts are off by default")

    for (const account of [ada, bora]) {
      const saved = await server.call("PUT", "/v1/chat-preferences", { token: account.sessionToken, payload: { readReceiptsEnabled: true } })
      assert.equal(saved.statusCode, 200, saved.body)
      assert.deepEqual(saved.json(), { preferences: { readReceiptsEnabled: true }, available: true })
    }
    const adaView = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: ada.sessionToken })
    assert.deepEqual(adaView.json().partnerReceipts, { deliveredUpTo: cursor },
      "Bora's read while receipts were off was never stored, so it is never revealed")
    assert.equal((await readUpTo(bora)).statusCode, 200)
    const adaViewAfterRead = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: ada.sessionToken })
    assert.deepEqual(adaViewAfterRead.json().partnerReceipts, { deliveredUpTo: cursor, readUpTo: cursor })

    const later = await send(server, ada, threadId, "are you there?")
    assert.equal((await server.call("POST", `/v1/threads/${threadId}/read`, {
      token: bora.sessionToken,
      payload: { upToMessageId: later.messageId }
    })).statusCode, 200)
    assert.deepEqual(receiptsFor(events, ada.userId).at(-1)?.readUpTo, { sentAt: later.sentAt, messageId: later.messageId })

    const preferences = await server.call("GET", "/v1/chat-preferences", { token: ada.sessionToken })
    assert.deepEqual(preferences.json(), { preferences: { readReceiptsEnabled: true }, available: true })
  } finally {
    await server.app.close()
  }
})

test("without the rollout every chat route works, shows no receipts and refuses the setting", async () => {
  const { server, ada, bora, threadId, events } = await createPair()
  try {
    const message = await send(server, ada, threadId, "hello")
    const history = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: bora.sessionToken })
    assert.equal(history.statusCode, 200)
    assert.equal("partnerReceipts" in history.json(), false)
    assert.equal((await server.call("POST", `/v1/threads/${threadId}/read`, {
      token: bora.sessionToken, payload: { upToMessageId: message.messageId }
    })).statusCode, 200)
    const threads = await server.call("GET", "/v1/threads", { token: ada.sessionToken })
    assert.equal("partnerReceipts" in threads.json().threads[0], false)
    const saved = await server.call("PUT", "/v1/chat-preferences", { token: ada.sessionToken, payload: { readReceiptsEnabled: true } })
    assert.equal(saved.statusCode, 409)
    assert.equal(saved.json().code, "CHAT_RECEIPTS_UNAVAILABLE")
    assert.deepEqual((await server.call("GET", "/v1/chat-preferences", { token: ada.sessionToken })).json(),
      { preferences: { readReceiptsEnabled: false }, available: false })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(events.filter((entry) => entry.event.type === "chat.receipt_updated"), [])
  } finally {
    await server.app.close()
  }
})

test("before migration 070 a rolled-out server keeps chat working and sends no receipts", async () => {
  const { server, ada, bora, threadId, events } = await createPair({
    capabilityService: RECEIPTS_ROLLED_OUT,
    chatRepository: createInMemoryChatRepository(createInMemoryChatStore(), { receiptsSupported: false })
  })
  try {
    const message = await send(server, ada, threadId, "hello")
    const history = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: bora.sessionToken })
    assert.equal(history.statusCode, 200)
    assert.deepEqual(history.json().messages.map((item: { messageId: string }) => item.messageId), [message.messageId])
    assert.equal("partnerReceipts" in history.json(), false)
    const read = await server.call("POST", `/v1/threads/${threadId}/read`, {
      token: bora.sessionToken, payload: { upToMessageId: message.messageId }
    })
    assert.equal(read.statusCode, 200)
    assert.equal(read.json().readAt, message.sentAt)
    assert.equal((await server.call("POST", `/v1/threads/${threadId}/read`, { token: bora.sessionToken })).statusCode, 200)
    const threads = await server.call("GET", "/v1/threads", { token: bora.sessionToken })
    assert.equal(threads.json().threads[0].unreadCount, 0)
    assert.equal("partnerReceipts" in threads.json().threads[0], false)
    assert.equal((await server.call("PUT", "/v1/chat-preferences", {
      token: ada.sessionToken, payload: { readReceiptsEnabled: true }
    })).statusCode, 409)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(events.filter((entry) => entry.event.type === "chat.receipt_updated"), [])
    assert.equal(events.filter((entry) => entry.event.type === "chat.thread_read").length, 2,
      "the reader's own unread sync is unchanged")
  } finally {
    await server.app.close()
  }
})

test("the chat preferences body needs one boolean", async () => {
  const { server, ada } = await createPair({ capabilityService: RECEIPTS_ROLLED_OUT })
  try {
    // (Fastify's type coercion turns a null into false, the private default.)
    for (const payload of [{}, { readReceiptsEnabled: "yes" }, [], { other: true }]) {
      const response = await server.call("PUT", "/v1/chat-preferences", { token: ada.sessionToken, payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    assert.equal((await server.call("PUT", "/v1/chat-preferences", { payload: { readReceiptsEnabled: true } })).statusCode, 401)
    assert.deepEqual((await server.call("GET", "/v1/chat-preferences", { token: ada.sessionToken })).json(),
      { preferences: { readReceiptsEnabled: false }, available: true }, "nothing was saved")
  } finally {
    await server.app.close()
  }
})
