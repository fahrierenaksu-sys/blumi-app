import assert from "node:assert/strict"
import test from "node:test"
import { getProfileHeroStretch, PROFILE_HERO_MAX_STRETCH } from "./profilePreviewHeroModel"

test("DSC-15: pulling past the top pins the hero background and stretches it", () => {
  assert.deepEqual(getProfileHeroStretch(0, false), { translateY: 0, scale: 1 })
  assert.deepEqual(getProfileHeroStretch(120, false), { translateY: 0, scale: 1 }, "normal scrolling leaves the hero alone")
  const pulled = getProfileHeroStretch(-72, false)
  assert.equal(pulled.translateY, -72)
  assert.equal(pulled.scale, 1.2)
  assert.equal(getProfileHeroStretch(-2000, false).scale, PROFILE_HERO_MAX_STRETCH)
})

test("DSC-15: Reduce Motion keeps the hero still", () => {
  assert.deepEqual(getProfileHeroStretch(-72, true), { translateY: 0, scale: 1 })
})
