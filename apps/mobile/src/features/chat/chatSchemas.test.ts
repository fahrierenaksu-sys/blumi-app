import assert from "node:assert/strict"
import test from "node:test"
import {
  chatMessageSchema as sharedChatMessageSchema,
  chatThreadSchema as sharedChatThreadSchema
} from "@blumi/contracts"
import {
  chatMessageListSchema,
  chatMessageSchema,
  chatThreadReadSchema,
  chatThreadListSchema,
  chatThreadSchema
} from "./chatSchemas"

const MESSAGE = {
  messageId: "message-1",
  threadId: "thread-1",
  senderUserId: "user-1",
  body: "Hello",
  sentAt: "2026-07-22T10:00:00.000Z"
} as const

const COMPLETE_AVATAR = {
  presetId: "avatar_v2_body_default",
  revision: 3,
  loadout: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "face_default",
    eyesId: "eyes_default",
    noseId: "nose_default",
    mouthId: "mouth_default",
    hairId: "hair_default",
    topId: "top_default",
    bottomId: "bottom_default",
    shoesId: "shoes_default",
    accessoryIds: ["accessory_default"]
  }
} as const

const THREAD = {
  threadId: "thread-1",
  miniRoomId: "room-1",
  participantUserIds: ["user-1", "user-2"] as [string, string],
  participants: [
    { userId: "user-1", displayName: "Mina" },
    { userId: "user-2" }
  ] as [{ userId: string; displayName: string }, { userId: string }],
  createdAt: "2026-07-22T09:00:00.000Z",
  lastMessage: MESSAGE
}

test("chat schemas accept canonical thread and message payloads", () => {
  assert.strictEqual(chatMessageSchema, sharedChatMessageSchema)
  assert.strictEqual(chatThreadSchema, sharedChatThreadSchema)
  assert.equal(chatMessageSchema.safeParse(MESSAGE).success, true)
  assert.equal(chatThreadSchema.safeParse(THREAD).success, true)
  assert.equal(
    chatThreadListSchema.safeParse({ userId: "user-1", threads: [THREAD] }).success,
    true
  )
  assert.equal(
    chatMessageListSchema.safeParse({
      userId: "user-1",
      threadId: "thread-1",
      messages: [MESSAGE]
    }).success,
    true
  )
  assert.equal(
    chatThreadReadSchema.safeParse({
      userId: "user-1",
      threadId: "thread-1",
      readAt: "2026-07-22T10:01:00.000Z"
    }).success,
    true
  )
})

test("chat schemas preserve a complete canonical participant avatar", () => {
  const parsed = chatThreadSchema.safeParse({
    ...THREAD,
    participants: [
      THREAD.participants[0],
      { userId: "user-2", displayName: "Defne", avatar: COMPLETE_AVATAR }
    ]
  })

  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.deepEqual(parsed.data.participants[1].avatar, COMPLETE_AVATAR)
})

test("chat schemas reject malformed dates, identities, and tuple cardinality", () => {
  assert.equal(chatMessageSchema.safeParse({ ...MESSAGE, sentAt: "tomorrow" }).success, false)
  assert.equal(
    chatMessageSchema.safeParse({ ...MESSAGE, sentAt: "June 27, 2026" }).success,
    false
  )
  assert.equal(
    chatMessageSchema.safeParse({ ...MESSAGE, sentAt: "2026-06-27 00:00:00 UTC" }).success,
    false
  )
  assert.equal(
    chatThreadSchema.safeParse({
      ...THREAD,
      participantUserIds: ["user-1"],
      participants: THREAD.participants
    }).success,
    false
  )
  assert.equal(
    chatThreadSchema.safeParse({
      ...THREAD,
      lastMessage: { ...MESSAGE, senderUserId: "" }
    }).success,
    false
  )
  assert.equal(
    chatThreadSchema.safeParse({
      ...THREAD,
      participants: [
        THREAD.participants[0],
        {
          userId: "user-2",
          displayName: "Defne",
          avatar: { ...COMPLETE_AVATAR, revision: -1 }
        }
      ]
    }).success,
    false
  )
})
