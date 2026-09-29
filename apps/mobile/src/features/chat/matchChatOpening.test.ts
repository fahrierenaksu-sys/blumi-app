import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import { createMatchedChatOpener } from "./matchChatOpening"

const thread: ChatThread = {
  threadId: "thread_match_one",
  miniRoomId: "match_one",
  participantUserIds: ["user_a", "user_b"],
  participants: [
    { userId: "user_a", displayName: "A" },
    { userId: "user_b", displayName: "B" }
  ],
  createdAt: "2026-07-13T10:00:00.000Z"
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

test("concurrent pending-chat attempts share one canonical thread creation", async () => {
  const request = deferred<ChatThread>()
  const created: ChatThread[] = []
  let requests = 0
  const open = createMatchedChatOpener({
    createThread: () => { requests += 1; return request.promise },
    onThreadReady: (createdThread) => created.push(createdThread)
  })
  const first = open()
  const duplicate = open()

  assert.equal(requests, 1)
  request.resolve(thread)
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate])
  assert.deepEqual(firstResult, { status: "opened", thread })
  assert.deepEqual(duplicateResult, firstResult)
  assert.deepEqual(created, [thread])
})

test("failed thread creation can be retried and only success publishes the thread", async () => {
  const created: ChatThread[] = []
  let requests = 0
  const open = createMatchedChatOpener({
    createThread: async () => {
      requests += 1
      if (requests === 1) throw new Error("Network unavailable")
      return thread
    },
    onThreadReady: (createdThread) => created.push(createdThread)
  })

  const failed = await open()
  assert.deepEqual(created, [])
  assert.deepEqual(failed, {
    status: "failed",
    errorMessage: "We couldn't open that chat. Check your connection and try again."
  })

  const retried = await open()
  assert.equal(requests, 2)
  assert.deepEqual(created, [thread])
  assert.deepEqual(retried, { status: "opened", thread })
})
