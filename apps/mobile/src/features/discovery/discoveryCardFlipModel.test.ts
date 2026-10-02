import assert from "node:assert/strict"
import test from "node:test"
import { getDiscoveryCardFlipLift, normalizeDiscoveryCardBack } from "./discoveryCardFlipModel"

test("card back content is bounded and hides absent optional sections", () => {
  assert.deepEqual(
    normalizeDiscoveryCardBack({
      prompt: "  Pazar günüm kahve ve yürüyüş. ",
      interests: ["Kahve", "Kahve", "Müzik", "Çok uzun bir etiket olmamalı"],
      badges: ["Kendi Tarzı", "", "Kendi Tarzı"]
    }),
    {
      prompt: "Pazar günüm kahve ve yürüyüş.",
      interests: ["Kahve", "Müzik", "Çok uzun bir etiket olmamalı"],
      badges: ["Kendi Tarzı"]
    }
  )
  assert.deepEqual(normalizeDiscoveryCardBack({}), {
    prompt: null,
    interests: [],
    badges: []
  })
})

test("the card lifts toward the viewer mid-turn and lies flat at both faces", () => {
  assert.equal(getDiscoveryCardFlipLift(0), 1)
  assert.ok(Math.abs(getDiscoveryCardFlipLift(1) - 1) < 1e-9)
  const middle = getDiscoveryCardFlipLift(0.5)
  assert.ok(middle > getDiscoveryCardFlipLift(0.25) && middle > 1 && middle <= 1.06, "a small lift, highest edge-on")
  assert.equal(getDiscoveryCardFlipLift(Number.NaN), 1)
})
