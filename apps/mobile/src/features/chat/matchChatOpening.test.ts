import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import { openMatchedChat } from "./matchChatOpening"

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

test("matched chat navigates only after canonical thread creation succeeds", async () => {
  const events: string[] = []
  const result = await openMatchedChat({
    createThread: async () => {
      events.push("created")
      return thread
    },
    onThreadReady: (createdThread) => {
      events.push(`navigate:${createdThread.threadId}`)
    }
  })

  assert.deepEqual(events, ["created", "navigate:thread_match_one"])
  assert.deepEqual(result, { status: "opened", thread })
})

test("matched chat returns retryable failure and never navigates on error", async () => {
  let navigated = false
  const result = await openMatchedChat({
    createThread: async () => {
      throw new Error("Network unavailable")
    },
    onThreadReady: () => {
      navigated = true
    }
  })

  assert.equal(navigated, false)
  assert.deepEqual(result, {
    status: "failed",
    errorMessage: "We couldn't open that chat. Check your connection and try again."
  })
})
