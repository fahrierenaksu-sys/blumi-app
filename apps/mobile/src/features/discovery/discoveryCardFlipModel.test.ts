import assert from "node:assert/strict"
import test from "node:test"
import { normalizeDiscoveryCardBack } from "./discoveryCardFlipModel"

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
