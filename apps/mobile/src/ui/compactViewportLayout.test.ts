import assert from "node:assert/strict"
import test from "node:test"
import { resolveCompactViewportLayout } from "./compactViewportLayout"

test("iPhone SE-height viewports reserve enough space for complete auth and discover actions", () => {
  assert.deepEqual(resolveCompactViewportLayout(667), {
    compact: true,
    authAvatarSize: 126,
    authStageHeight: 184,
    discoverAvatarSize: 224,
    discoverDeckHeight: 448,
    showDiscoverProgress: false
  })
})

test("taller viewports retain the full-size release composition", () => {
  assert.deepEqual(resolveCompactViewportLayout(844), {
    compact: false,
    authAvatarSize: 150,
    authStageHeight: 224,
    discoverAvatarSize: 268,
    discoverDeckHeight: 548,
    showDiscoverProgress: true
  })
})

test("large text switches the cinematic scene to its compact-safe composition", () => {
  assert.equal(resolveCompactViewportLayout(874, 1.3).compact, true)
  assert.equal(resolveCompactViewportLayout(956, 1.5).compact, true)
})
