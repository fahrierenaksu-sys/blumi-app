import assert from "node:assert/strict"
import test from "node:test"
import {
  PUBLIC_PROFILE_CARD_MAX_BADGES,
  parsePublicProfileCard,
  resolveSelectedPublicPrompt
} from "./PublicProfileCard"
import { reportUserRequestSchema } from "../api/CoreApiSchemas"

const validCard = {
  schemaVersion: 1,
  selectedPromptId: "small_joy",
  publicBadgeIds: ["first_room", "room_designer"],
  showRoomShowcase: true,
  roomHeadline: "  Kahve   ve sohbet  "
} as const

test("relationship intent is not part of the exact public card contract", () => {
  assert.throws(() => parsePublicProfileCard({
    ...validCard,
    relationshipIntent: "meet_and_see"
  }))
  assert.throws(() => parsePublicProfileCard({
    ...validCard,
    showRelationshipIntent: false
  }))
})

test("public profile card normalizes a Turkish room headline and preserves badge order", () => {
  const parsed = parsePublicProfileCard(validCard)

  assert.equal(parsed.roomHeadline, "Kahve ve sohbet")
  assert.deepEqual(parsed.publicBadgeIds, ["first_room", "room_designer"])
  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed.publicBadgeIds), true)
})

test("public profile card is exact and fails closed for malformed input", () => {
  const invalidInputs: unknown[] = [
    { ...validCard, extra: true },
    { ...validCard, schemaVersion: 2 },
    { ...validCard, selectedPromptId: "invented_prompt" },
    { ...validCard, publicBadgeIds: ["first_room", "first_room"] },
    {
      ...validCard,
      publicBadgeIds: Array.from(
        { length: PUBLIC_PROFILE_CARD_MAX_BADGES + 1 },
        (_, index) => `badge_${index}`
      )
    },
    { ...validCard, publicBadgeIds: ["Badge With Spaces"] },
    { ...validCard, roomHeadline: "a".repeat(31) },
    { ...validCard, roomHeadline: "Odam 🏡" }
  ]

  for (const input of invalidInputs) {
    assert.throws(() => parsePublicProfileCard(input))
  }
})

test("empty room headlines normalize to null and optional public fields remain explicit", () => {
  const parsed = parsePublicProfileCard({
    ...validCard,
    selectedPromptId: null,
    publicBadgeIds: [],
    showRoomShowcase: false,
    roomHeadline: "   "
  })

  assert.equal(parsed.selectedPromptId, null)
  assert.equal(parsed.roomHeadline, null)
})

test("selected public prompt resolves only when that answer exists on the profile", () => {
  const parsed = parsePublicProfileCard(validCard)
  const prompts = [
    { promptId: "ask_me_about", answer: "Mahalle kahvecileri" },
    { promptId: "small_joy", answer: "Gün batımı" }
  ] as const

  assert.deepEqual(resolveSelectedPublicPrompt(parsed, prompts), {
    promptId: "small_joy",
    answer: "Gün batımı"
  })
  assert.equal(
    resolveSelectedPublicPrompt(parsed, prompts.slice(0, 1)),
    null
  )
})

test("core safety parser accepts fake-or-bot and remains exact", () => {
  assert.equal(reportUserRequestSchema.parse({
    reportedUserId: "user_b",
    reason: "fake_or_bot"
  }).reason, "fake_or_bot")
  assert.equal(reportUserRequestSchema.safeParse({
    reportedUserId: "user_b",
    reason: "fake_or_bot",
    unexpected: true
  }).success, false)
})
