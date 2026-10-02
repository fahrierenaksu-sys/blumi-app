import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createInMemoryChatRepository, createInMemoryChatStore } from "../chat/chatRepository"
import { createAdversarialServer, type AdversarialServer, type SyntheticAccount } from "./adversarialFixture"

async function createPair(options: Parameters<typeof createAdversarialServer>[0] = {}) {
  const server = createAdversarialServer(options)
  await server.app.ready()
  const ada = await server.createAccount("ada")
  const bora = await server.createAccount("bora")
  const threadId = await server.matchAndThread(ada, bora, `hide_${Math.random().toString(36).slice(2, 8)}`)
  const events: Array<{ userId: string; event: ServerEvent }> = []
  const sendToUser = server.connectionManager.sendToUser.bind(server.connectionManager)
  server.connectionManager.sendToUser = (userId, event) => {
    events.push({ userId, event })
    return sendToUser(userId, event)
  }
  return { server, ada, bora, threadId, events }
}

async function send(server: AdversarialServer, account: SyntheticAccount, threadId: string, body: string) {
  // The hide point is a time: keep each message in its own millisecond.
  await new Promise<void>((resolve) => setTimeout(resolve, 3))
  const response = await server.call("POST", `/v1/threads/${threadId}/messages`, { token: account.sessionToken, payload: { body } })
  assert.equal(response.statusCode, 201, response.body)
  return response.json().message as { messageId: string; sentAt: string }
}

async function threadsOf(server: AdversarialServer, account: SyntheticAccount) {
  const response = await server.call("GET", "/v1/threads", { token: account.sessionToken })
  assert.equal(response.statusCode, 200, response.body)
  return response.json().threads as Array<{ threadId: string; unreadCount: number; hiddenThrough?: string; lastMessage?: { body: string; sentAt: string } }>
}

async function bodiesOf(server: AdversarialServer, account: SyntheticAccount, threadId: string) {
  const response = await server.call("GET", `/v1/threads/${threadId}/messages`, { token: account.sessionToken })
  assert.equal(response.statusCode, 200, response.body)
  return (response.json().messages as Array<{ body: string }>).map((message) => message.body)
}

test("delete chat for me hides the thread and its history from the caller only, until a newer message", async () => {
  const { server, ada, bora, threadId, events } = await createPair()
  try {
    await send(server, ada, threadId, "one")
    await send(server, bora, threadId, "two")
    assert.equal((await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)?.unreadCount, 1)

    const hidden = await server.call("POST", `/v1/threads/${threadId}/hide`, { token: bora.sessionToken })
    assert.equal(hidden.statusCode, 200, hidden.body)
    assert.equal(hidden.json().threadId, threadId)
    assert.equal(hidden.json().userId, bora.userId)
    // The caller's devices clear the unread count: hidden messages are read.
    const readEvent = events.find((entry) => entry.userId === bora.userId && entry.event.type === "chat.thread_read")
    assert.ok(readEvent, "chat.thread_read reaches the caller")
    assert.equal(events.some((entry) => entry.userId === ada.userId), false, "the partner is never told")

    // Still listed (links, room invites and room chat find it), marked so every device hides the row.
    const marked = (await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)
    assert.equal(marked?.hiddenThrough, hidden.json().hiddenThrough)
    assert.ok(marked?.lastMessage && Date.parse(marked.lastMessage.sentAt) <= Date.parse(marked.hiddenThrough!))
    assert.equal(marked?.unreadCount, 0)
    assert.deepEqual(await bodiesOf(server, bora, threadId), [])
    assert.deepEqual(await bodiesOf(server, ada, threadId), ["one", "two"], "the partner keeps everything")
    assert.equal((await threadsOf(server, ada)).find((thread) => thread.threadId === threadId)?.hiddenThrough, undefined)

    await send(server, ada, threadId, "three")
    const back = (await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)
    assert.equal(back?.lastMessage?.body, "three")
    assert.ok(Date.parse(back!.lastMessage!.sentAt) > Date.parse(back!.hiddenThrough!), "newer than the hide point: shown again")
    assert.equal(back?.unreadCount, 1)
    assert.deepEqual(await bodiesOf(server, bora, threadId), ["three"])
  } finally {
    await server.app.close()
  }
})

test("the hide point is a message of this thread and never moves back", async () => {
  const { server, ada, bora, threadId } = await createPair()
  try {
    const first = await send(server, ada, threadId, "one")
    await send(server, ada, threadId, "two")
    const hide = (payload?: unknown, account = bora) =>
      server.call("POST", `/v1/threads/${threadId}/hide`, { token: account.sessionToken, payload })

    // The device names the newest message it showed: a later one stays.
    const named = await hide({ throughMessageId: first.messageId })
    assert.equal(named.statusCode, 200, named.body)
    assert.equal(named.json().hiddenThrough, first.sentAt)
    assert.deepEqual(await bodiesOf(server, bora, threadId), ["two"])
    assert.equal((await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)?.lastMessage?.body, "two")

    const all = await hide({})
    assert.equal(all.statusCode, 200, all.body)
    assert.deepEqual(await bodiesOf(server, bora, threadId), [])
    const earlier = await hide({ throughMessageId: first.messageId })
    assert.equal(earlier.json().hiddenThrough, all.json().hiddenThrough, "an older point never reveals messages again")
    assert.deepEqual(await bodiesOf(server, bora, threadId), [])

    const unknown = await hide({ throughMessageId: "message_elsewhere" })
    assert.equal(unknown.statusCode, 400)
    assert.equal(unknown.json().code, "CHAT_HIDE_CURSOR_INVALID")
    for (const payload of [{ throughMessageId: " " }, { throughMessageId: 7 }, "null", "[]"]) {
      const response = await server.call("POST", `/v1/threads/${threadId}/hide`, {
        token: bora.sessionToken,
        payload,
        headers: { "content-type": "application/json" }
      })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    assert.equal((await server.call("POST", `/v1/threads/${threadId}/hide`, { payload: {} })).statusCode, 401)
    assert.deepEqual(await bodiesOf(server, ada, threadId), ["one", "two"])
  } finally {
    await server.app.close()
  }
})

test("before migration 071 the hide answers 409 and nothing changes", async () => {
  const { server, ada, bora, threadId } = await createPair({
    chatRepository: createInMemoryChatRepository(createInMemoryChatStore(), { hideSupported: false })
  })
  try {
    await send(server, ada, threadId, "one")
    const response = await server.call("POST", `/v1/threads/${threadId}/hide`, { token: bora.sessionToken, payload: {} })
    assert.equal(response.statusCode, 409, response.body)
    assert.equal(response.json().code, "CHAT_HIDE_UNAVAILABLE")
    assert.deepEqual(await bodiesOf(server, bora, threadId), ["one"])
    assert.equal((await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)?.unreadCount, 1)
  } finally {
    await server.app.close()
  }
})

test("only a participant can hide a thread, and only through a message of that same thread", async () => {
  const { server, ada, bora, threadId } = await createPair()
  try {
    const carol = await server.createAccount("carol")
    const otherThreadId = await server.matchAndThread(bora, carol, `hide_other_${Math.random().toString(36).slice(2, 8)}`)
    await send(server, ada, threadId, "one")
    const elsewhere = await send(server, carol, otherThreadId, "later, in another thread")

    // An outsider learns nothing: the same answer as a thread that does not exist.
    const outsider = await server.call("POST", `/v1/threads/${threadId}/hide`, { token: carol.sessionToken, payload: {} })
    const missing = await server.call("POST", "/v1/threads/thread_does_not_exist/hide", { token: carol.sessionToken, payload: {} })
    assert.equal(outsider.statusCode, 404)
    assert.deepEqual(outsider.json(), missing.json())
    assert.deepEqual(await bodiesOf(server, ada, threadId), ["one"])
    assert.deepEqual(await bodiesOf(server, bora, threadId), ["one"])

    // A newer message the caller can read in another thread cannot move this thread's hide point.
    const crossed = await server.call("POST", `/v1/threads/${threadId}/hide`, {
      token: bora.sessionToken, payload: { throughMessageId: elsewhere.messageId }
    })
    assert.equal(crossed.statusCode, 400)
    assert.equal(crossed.json().code, "CHAT_HIDE_CURSOR_INVALID")
    assert.deepEqual(await bodiesOf(server, bora, threadId), ["one"])
    assert.equal((await threadsOf(server, bora)).find((thread) => thread.threadId === threadId)?.unreadCount, 1)
  } finally {
    await server.app.close()
  }
})
