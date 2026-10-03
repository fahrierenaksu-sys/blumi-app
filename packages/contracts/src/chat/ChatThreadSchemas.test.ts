import assert from "node:assert/strict"
import test from "node:test"
import {
  chatAckDeliveredCommandSchema,
  chatMessageListSchema,
  chatMessageSchema,
  chatParticipantSummarySchema,
  chatPreferencesEnvelopeSchema,
  chatThreadSchema,
  chatTypingCommandSchema
} from "./ChatThreadSchemas"
import {
  chatPreferencesUpdateRequestSchema,
  listChatRoomInvitesQuerySchema,
  markThreadReadRequestSchema
} from "../api/CoreApiSchemas"

test("room invitation query accepts legacy, bounded history and exclusive exact lookups", () => {
  assert.deepEqual(listChatRoomInvitesQuerySchema.parse({}), {})
  assert.deepEqual(listChatRoomInvitesQuerySchema.parse({ limit: "20", before: "synthetic_cursor" }),
    { limit: 20, before: "synthetic_cursor" })
  assert.deepEqual(listChatRoomInvitesQuerySchema.parse({ before: "synthetic_cursor" }), { before: "synthetic_cursor" })
  assert.deepEqual(listChatRoomInvitesQuerySchema.parse({ inviteId: "synthetic_target" }), { inviteId: "synthetic_target" })
  assert.equal(listChatRoomInvitesQuerySchema.parse({ limit: "50" }).limit, 50)
})

test("room invitation query rejects invalid bounds and mixed lookup modes", () => {
  for (const input of [{ limit: 0 }, { limit: 51 }, { limit: "Infinity" }, { limit: 1.5 },
    { before: " " }, { inviteId: "" }, { before: "x".repeat(257) }, { inviteId: "x".repeat(257) },
    { inviteId: "synthetic_target", limit: 20 }, { inviteId: "synthetic_target", before: "synthetic_cursor" }]) {
    assert.equal(listChatRoomInvitesQuerySchema.safeParse(input).success, false)
  }
})

const COMMON_LOADOUT = {
  bodyId: "avatar_v2_body_default",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_default",
  noseId: "avatar_v2_nose_default",
  mouthId: "avatar_v2_mouth_default",
  hairId: "avatar_v2_hair_default",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_default",
  accessoryIds: []
}

test("chat participant schema accepts exact avatar loadout V1 and V2", () => {
  const v1 = { schemaVersion: 1 as const, ...COMMON_LOADOUT }
  const v2 = {
    schemaVersion: 2 as const,
    ...COMMON_LOADOUT,
    dressId: "avatar_v2_dress_rose_garden",
    outerwearId: null
  }

  assert.equal(parseAvatar(v1).schemaVersion, 1)
  assert.deepEqual(parseAvatar(v2), v2)
})

test("chat participant schema rejects mixed or extended avatar loadout shapes", () => {
  const mixedV1 = {
    schemaVersion: 1 as const,
    ...COMMON_LOADOUT,
    dressId: null,
    outerwearId: null
  }
  const extendedV2 = {
    schemaVersion: 2 as const,
    ...COMMON_LOADOUT,
    dressId: null,
    outerwearId: null,
    unexpected: true
  }

  assert.equal(parseParticipant(mixedV1).success, false)
  assert.equal(parseParticipant(extendedV2).success, false)
})

test("chat message schema keeps legacy payloads backward compatible", () => {
  const legacy = {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Hello",
    sentAt: "2026-08-13T09:00:00.000Z"
  }

  assert.deepEqual(chatMessageSchema.parse(legacy), legacy)
})

test("chat message schema accepts exact optional delivery, read, and edit metadata", () => {
  const enriched = {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Edited hello",
    sentAt: "2026-08-13T09:00:00.000Z",
    deliveredAt: "2026-08-13T09:00:01.000Z",
    readAt: "2026-08-13T09:00:02.000Z",
    editedAt: "2026-08-13T09:01:00.000Z"
  }

  assert.deepEqual(chatMessageSchema.parse(enriched), enriched)
  assert.equal(chatMessageSchema.safeParse({ ...enriched, unexpected: true }).success, false)
})

test("chat message schema rejects malformed metadata timestamps", () => {
  const base = {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Hello",
    sentAt: "2026-08-13T09:00:00.000Z"
  }

  assert.equal(chatMessageSchema.safeParse({ ...base, deliveredAt: "soon" }).success, false)
  assert.equal(chatMessageSchema.safeParse({ ...base, readAt: "later" }).success, false)
  assert.equal(chatMessageSchema.safeParse({ ...base, editedAt: "yesterday" }).success, false)
})

test("chat message schema rejects impossible metadata chronology", () => {
  const base = {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Hello",
    sentAt: "2026-08-13T09:00:00.000Z"
  }

  assert.equal(chatMessageSchema.safeParse({
    ...base,
    deliveredAt: "2026-08-13T08:59:59.000Z"
  }).success, false)
  assert.equal(chatMessageSchema.safeParse({
    ...base,
    deliveredAt: "2026-08-13T09:00:02.000Z",
    readAt: "2026-08-13T09:00:01.000Z"
  }).success, false)
  assert.equal(chatMessageSchema.safeParse({
    ...base,
    editedAt: "2026-08-13T08:59:59.000Z"
  }).success, false)
  assert.equal(chatMessageSchema.safeParse({
    ...base,
    editedAt: "2026-08-13T09:05:00.000Z"
  }).success, false)
})

const RECEIPT_THREAD = {
  threadId: "thread-1",
  miniRoomId: "room-1",
  participantUserIds: ["user-1", "user-2"],
  participants: [{ userId: "user-1" }, { userId: "user-2" }],
  createdAt: "2026-10-01T09:00:00.000Z"
}

test("thread and message lists round-trip the viewer's partner receipt cursors", () => {
  const partnerReceipts = {
    deliveredUpTo: { sentAt: "2026-10-01T09:02:00.000Z", messageId: "message-9" },
    readUpTo: { sentAt: "2026-10-01T09:01:00.000Z" }
  }
  assert.deepEqual(chatThreadSchema.parse({ ...RECEIPT_THREAD, partnerReceipts }).partnerReceipts, partnerReceipts)
  assert.deepEqual(chatMessageListSchema.parse({
    userId: "user-1",
    threadId: "thread-1",
    messages: [],
    partnerReceipts
  }).partnerReceipts, partnerReceipts)
})

test("an old server's thread and message list without receipts stays valid", () => {
  assert.equal(chatThreadSchema.parse(RECEIPT_THREAD).partnerReceipts, undefined)
  assert.equal(chatMessageListSchema.parse({ userId: "user-1", threadId: "thread-1", messages: [] }).partnerReceipts, undefined)
})

test("receipt cursors reject malformed dates and empty or oversized message ids", () => {
  for (const cursor of [
    { sentAt: "soon" },
    { sentAt: "2026-10-01T09:00:00.000Z", messageId: "" },
    { sentAt: "2026-10-01T09:00:00.000Z", messageId: "m".repeat(257) }
  ]) {
    assert.equal(chatThreadSchema.safeParse({
      ...RECEIPT_THREAD,
      partnerReceipts: { deliveredUpTo: cursor }
    }).success, false, JSON.stringify(cursor))
  }
})

test("receipts never ride on the strict message shape older clients parse", () => {
  const message = {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Hello",
    sentAt: "2026-10-01T09:00:00.000Z"
  }
  assert.equal(chatMessageSchema.safeParse({ ...message, deliveredUpTo: { sentAt: message.sentAt } }).success, false)
})

test("delivery acks, read bodies and chat preferences are strict", () => {
  assert.equal(chatAckDeliveredCommandSchema.safeParse({ threadId: "thread-1", upToMessageId: "message-1" }).success, true)
  assert.equal(chatAckDeliveredCommandSchema.safeParse({ threadId: "thread-1" }).success, false)
  assert.equal(chatAckDeliveredCommandSchema.safeParse({ threadId: "thread-1", upToMessageId: "m", userId: "x" }).success, false)
  assert.deepEqual(markThreadReadRequestSchema.parse({}), {})
  assert.deepEqual(markThreadReadRequestSchema.parse({ upToMessageId: " message-1 " }), { upToMessageId: "message-1" })
  assert.equal(markThreadReadRequestSchema.safeParse({ upToMessageId: " " }).success, false)
  assert.equal(markThreadReadRequestSchema.safeParse({ readAt: "2026-10-01T09:00:00.000Z" }).success, false)
  assert.equal(chatPreferencesUpdateRequestSchema.safeParse({ readReceiptsEnabled: true }).success, true)
  assert.equal(chatPreferencesUpdateRequestSchema.safeParse({ readReceiptsEnabled: "yes" }).success, false)
  assert.equal(chatPreferencesUpdateRequestSchema.safeParse({}).success, false)
  assert.deepEqual(
    chatPreferencesEnvelopeSchema.parse({ preferences: { readReceiptsEnabled: false } }),
    { preferences: { readReceiptsEnabled: false } }
  )
})

test("typing commands are strict and can never carry draft text", () => {
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "thread-1", state: "start" }).success, true)
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "thread-1", state: "stop" }).success, true)
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "thread-1", state: "start", body: "hel" }).success, false)
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "thread-1", state: "typing" }).success, false)
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "", state: "start" }).success, false)
  assert.equal(chatTypingCommandSchema.safeParse({ threadId: "t".repeat(257), state: "start" }).success, false)
  assert.equal(chatTypingCommandSchema.safeParse({ state: "start" }).success, false)
})

function parseAvatar(loadout: unknown): Record<string, unknown> {
  const parsed = parseParticipant(loadout)
  assert.equal(parsed.success, true)
  if (!parsed.success) throw new Error("Participant avatar must parse.")
  return parsed.data.avatar?.loadout as unknown as Record<string, unknown>
}

function parseParticipant(loadout: unknown) {
  return chatParticipantSummarySchema.safeParse({
    userId: "user-1",
    avatar: {
      presetId: COMMON_LOADOUT.bodyId,
      revision: 1,
      loadout
    }
  })
}
