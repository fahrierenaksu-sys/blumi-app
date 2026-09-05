import assert from "node:assert/strict"
import test from "node:test"
import { getSetupCharacterMotionPlan } from "./setupCharacterMotionModel"

test("profile guide enters with a real sprite step before settling into an asynchronous idle", () => {
  assert.deepEqual(getSetupCharacterMotionPlan("guide"), {
    entranceDelayMs: 80,
    entranceDurationMs: 520,
    cueIntervalMs: 4600,
    spriteCueDurationMs: 860,
    spriteCueState: "walk_front",
    spriteTravel: 8,
    breathDurationMs: 2800,
    breathOffset: 3,
    breathScale: 1.012
  })
})

test("styling avatar uses a quieter motion rhythm so controls remain the focus", () => {
  assert.deepEqual(getSetupCharacterMotionPlan("styling"), {
    entranceDelayMs: 0,
    entranceDurationMs: 420,
    cueIntervalMs: 6200,
    spriteCueDurationMs: 720,
    spriteCueState: "walk_front",
    spriteTravel: 5,
    breathDurationMs: 3200,
    breathOffset: 2,
    breathScale: 1.008
  })
})
