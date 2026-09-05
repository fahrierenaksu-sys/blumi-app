import assert from "node:assert/strict"
import test from "node:test"
import { getProfileCharacterReaction } from "./profileCharacterReactionModel"

test("the profile hero gives each selected character its authored micro-story", () => {
  assert.deepEqual(getProfileCharacterReaction("woman"), {
    interactionLabel: "Kendi etrafında neşeyle dönüp tatlıca yerleşiyor",
    motionStyle: "twirl",
    timeline: {
      atlasColumns: 4,
      atlasRows: 4,
      frameCount: 16,
      frameDurationsMs: [112, 108, 108, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 176],
      settleFrameIndex: 15
    }
  })
  assert.deepEqual(getProfileCharacterReaction("man"), {
    interactionLabel: "Yakasını düzelterek havalı bir duruşa yerleşiyor",
    motionStyle: "collar",
    timeline: {
      atlasColumns: 4,
      atlasRows: 4,
      frameCount: 16,
      frameDurationsMs: [150, 144, 144, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 220],
      settleFrameIndex: 15
    }
  })
})

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
    const totalDuration = reaction.timeline.frameDurationsMs.reduce(
      (total, duration) => total + duration,
      0
    )
    assert.ok(totalDuration >= (gender === "man" ? 2_100 : 1_600))
    assert.ok(totalDuration <= (gender === "man" ? 2_400 : 1_950))
  }
})
