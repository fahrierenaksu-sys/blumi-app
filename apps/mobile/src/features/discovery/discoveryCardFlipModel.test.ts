import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVERY_CARD_FLIP_DURATION,
  DISCOVERY_CARD_FLIP_EASING,
  getDiscoveryCardFlipState,
  normalizeDiscoveryCardBack
} from "./discoveryCardFlipModel"

test("card flip uses a short, bounded motion window", () => {
  assert.ok(DISCOVERY_CARD_FLIP_DURATION >= 320)
  assert.ok(DISCOVERY_CARD_FLIP_DURATION <= 420)
  assert.equal(DISCOVERY_CARD_FLIP_EASING, "easeInOut")
})

test("reduced motion keeps one readable face without a transitional blank", () => {
  assert.deepEqual(getDiscoveryCardFlipState(0, true), {
    frontRotation: "0deg",
    backRotation: "180deg",
    frontVisible: true,
    backVisible: false
  })
  assert.deepEqual(getDiscoveryCardFlipState(1, true), {
    frontRotation: "180deg",
    backRotation: "360deg",
    frontVisible: false,
    backVisible: true
  })
})

test("normal motion rotates both mounted faces through the midpoint", () => {
  assert.deepEqual(getDiscoveryCardFlipState(0, false), {
    frontRotation: "0deg",
    backRotation: "180deg",
    frontVisible: true,
    backVisible: false
  })
  assert.deepEqual(getDiscoveryCardFlipState(0.5, false), {
    frontRotation: "90deg",
    backRotation: "270deg",
    frontVisible: false,
    backVisible: true
  })
  assert.deepEqual(getDiscoveryCardFlipState(1, false), {
    frontRotation: "180deg",
    backRotation: "360deg",
    frontVisible: false,
    backVisible: true
  })
})

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
