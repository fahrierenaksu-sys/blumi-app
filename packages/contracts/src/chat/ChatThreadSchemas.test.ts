import assert from "node:assert/strict"
import test from "node:test"
import {
  chatMessageSchema,
  chatParticipantSummarySchema
} from "./ChatThreadSchemas"

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
