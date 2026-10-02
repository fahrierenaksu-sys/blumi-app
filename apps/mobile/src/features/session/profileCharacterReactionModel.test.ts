import assert from "node:assert/strict"
import test from "node:test"
import { getProfileCharacterReaction } from "./profileCharacterReactionModel"

test("an unselected profile hero stays neutral", () => {
  assert.deepEqual(getProfileCharacterReaction(undefined), {
    interactionLabel: "Karakterini seçebilirsin",
    motionStyle: "idle",
    timeline: null
  })
})

test("the authored timelines have one duration per transition and settle on the last frame", () => {
  for (const gender of ["woman", "man"] as const) {
    const reaction = getProfileCharacterReaction(gender)
    assert.ok(reaction.timeline)
    assert.equal(
      reaction.timeline.frameDurationsMs.length,
      reaction.timeline.frameCount - 1
    )
    assert.equal(
      reaction.timeline.settleFrameIndex,
      reaction.timeline.frameCount - 1
    )
    assert.ok(reaction.timeline.frameDurationsMs.every((duration) => duration > 0))
  }
})
