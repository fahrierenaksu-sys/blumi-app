import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import {
  findLastCanonicalRoomChatMessage,
  findCanonicalRoomChatThread,
  shouldRenderIncomingRoomChatMessage
} from "./inRoomChatThread"

test("room entry replays only the latest durable canonical chat message", () => {
  const latest = findLastCanonicalRoomChatMessage([
    createMessage("first", "Hello", "2026-07-22T09:00:00.000Z"),
    createMessage("invite", "__room_invite__", "2026-07-22T09:01:00.000Z"),
    createMessage("last", "See you inside.", "2026-07-22T09:02:00.000Z")
  ])

  assert.equal(latest?.messageId, "last")
  assert.equal(findLastCanonicalRoomChatMessage([
    createMessage("invite", "__room_invite__", "2026-07-22T09:01:00.000Z")
  ]), undefined)
  assert.equal(
    findLastCanonicalRoomChatMessage(
      [
        createMessage("entry", "Already here", "2026-07-22T09:00:00.000Z"),
        createMessage("new", "Sent after entry", "2026-07-22T09:05:00.000Z")
      ],
      Date.parse("2026-07-22T09:01:00.000Z")
    )?.messageId,
    "entry"
  )
})

const threads: ChatThread[] = [
  createThread("connection_thread", "connection_room"),
  createThread("mutual_match_thread", "match_room")
]

test("in-room chat uses only the server-provided source thread for a pair", () => {
  const selected = findCanonicalRoomChatThread({
    threads,
    sourceThreadId: "mutual_match_thread",
    localUserId: "user_one",
    partnerUserId: "user_two"
  })

  assert.equal(selected?.threadId, "mutual_match_thread")
})

test("in-room chat fails closed when the server did not provide a matching source thread", () => {
  assert.equal(
    findCanonicalRoomChatThread({
      threads,
      sourceThreadId: undefined,
      localUserId: "user_one",
      partnerUserId: "user_two"
    }),
    undefined
  )
  assert.equal(
    findCanonicalRoomChatThread({
      threads,
      sourceThreadId: "mutual_match_thread",
      localUserId: "user_one",
      partnerUserId: "unrelated_user"
    }),
    undefined
  )
})

test("in-room chat does not render the sender's realtime echo as a second bubble", () => {
  assert.equal(
    shouldRenderIncomingRoomChatMessage({
      senderUserId: "user_one",
      localUserId: "user_one",
      body: "I am already shown optimistically.",
      sentAt: "2026-07-22T10:00:00.000Z",
      baselineTimestamp: Date.parse("2026-07-22T09:59:00.000Z")
    }),
    false
  )

  assert.equal(
    shouldRenderIncomingRoomChatMessage({
      senderUserId: "user_two",
      localUserId: "user_one",
      body: "I can see you in the room.",
      sentAt: "2026-07-22T10:00:00.000Z",
      baselineTimestamp: Date.parse("2026-07-22T09:59:00.000Z")
    }),
    true
  )
})

function createThread(threadId: string, miniRoomId: string): ChatThread {
  return {
    threadId,
    miniRoomId,
    participantUserIds: ["user_one", "user_two"],
    participants: [
      { userId: "user_one", displayName: "Ada" },
      { userId: "user_two", displayName: "Bora" }
    ],
    createdAt: "2026-07-21T12:00:00.000Z"
  }
}

function createMessage(messageId: string, body: string, sentAt: string) {
  return {
    messageId,
    threadId: "mutual_match_thread",
    senderUserId: "user_two",
    body,
    sentAt
  }
}
