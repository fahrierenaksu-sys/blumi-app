import assert from "node:assert/strict"
import test from "node:test"
import { publicProfileCardSchema } from "./PublicProfileCard"
import { reportUserRequestSchema } from "../api/CoreApiSchemas"

// The room headline schema is the live runtime use of this contract
// (room snapshot routes validate the showcase headline with it).
const roomHeadline = publicProfileCardSchema.shape.roomHeadline

test("room headline normalizes Turkish whitespace", () => {
  const parsed = roomHeadline.safeParse("  Kahve   ve sohbet  ")
  assert.equal(parsed.success, true)
  assert.equal(parsed.data, "Kahve ve sohbet")
})

test("empty room headlines normalize to null", () => {
  const parsed = roomHeadline.safeParse("   ")
  assert.equal(parsed.success, true)
  assert.equal(parsed.data, null)
})

test("room headline fails closed for overlong or unsupported text", () => {
  assert.equal(roomHeadline.safeParse("a".repeat(31)).success, false)
  assert.equal(roomHeadline.safeParse("Odam 🏡").success, false)
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
