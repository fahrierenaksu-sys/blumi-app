import assert from "node:assert/strict"
import test from "node:test"
import { resolveCompactViewportLayout } from "./compactViewportLayout"

test("iPhone SE-height viewports switch to a smaller composition that fits the height", () => {
  const compact = resolveCompactViewportLayout(667)
  const full = resolveCompactViewportLayout(844)

  assert.equal(compact.compact, true)
  assert.equal(full.compact, false)
  assert.ok(compact.authAvatarSize < full.authAvatarSize)
  assert.ok(compact.authStageHeight < full.authStageHeight)
  assert.ok(compact.discoverAvatarSize < full.discoverAvatarSize)
  assert.ok(compact.discoverDeckHeight < full.discoverDeckHeight)
  assert.ok(compact.discoverDeckHeight < 667)
  assert.ok(full.discoverDeckHeight < 844)
})

test("compact viewports hide Discover progress; taller ones keep it", () => {
  assert.equal(resolveCompactViewportLayout(667).showDiscoverProgress, false)
  assert.equal(resolveCompactViewportLayout(844).showDiscoverProgress, true)
})

test("large text switches the cinematic scene to its compact-safe composition", () => {
  assert.equal(resolveCompactViewportLayout(874, 1.3).compact, true)
  assert.equal(resolveCompactViewportLayout(956, 1.5).compact, true)
})
