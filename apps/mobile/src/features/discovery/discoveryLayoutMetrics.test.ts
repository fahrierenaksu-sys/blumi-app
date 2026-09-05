import assert from "node:assert/strict"
import test from "node:test"
import { resolveDiscoveryLayoutMetrics } from "./discoveryLayoutMetrics"

test("the canonical iPhone width retains the approved deck geometry", () => {
  const layout = resolveDiscoveryLayoutMetrics(402, 760)

  assert.equal(layout.deckHeight, 548)
  assert.equal(layout.card.avatarSize, 268)
  assert.equal(layout.card.infoOverlayBottom, 120)
  assert.equal(layout.action.primarySize, 64)
})

test("short portrait viewports retain the compact deck and hide progress", () => {
  const compact = resolveDiscoveryLayoutMetrics(375, 667)

  assert.equal(compact.deckHeight, 448)
  assert.equal(compact.card.avatarSize, 224)
  assert.equal(compact.showProgress, false)
})

test("Discovery metrics change continuously across adjacent content widths", () => {
  const below = resolveDiscoveryLayoutMetrics(401, 760)
  const boundary = resolveDiscoveryLayoutMetrics(402, 760)
  const above = resolveDiscoveryLayoutMetrics(403, 760)

  assert.ok(Math.abs(boundary.deckHeight - below.deckHeight) <= 1.5)
  assert.ok(Math.abs(above.deckHeight - boundary.deckHeight) <= 1.5)
  assert.ok(Math.abs(above.card.avatarSize - boundary.card.avatarSize) <= 1)
  assert.ok(Math.abs(above.action.primarySize - boundary.action.primarySize) <= 1)
})

test("Discovery metrics remain proportional and clamp outside supported widths", () => {
  const invalid = resolveDiscoveryLayoutMetrics(Number.NaN, 760)
  const compact = resolveDiscoveryLayoutMetrics(320, 760)
  const canonical = resolveDiscoveryLayoutMetrics(402, 760)
  const large = resolveDiscoveryLayoutMetrics(440, 760)
  const veryLarge = resolveDiscoveryLayoutMetrics(1200, 760)

  assert.deepEqual(invalid, compact)
  assert.ok(compact.deckHeight < canonical.deckHeight)
  assert.ok(canonical.deckHeight < large.deckHeight)
  assert.equal(veryLarge.deckHeight, resolveDiscoveryLayoutMetrics(480, 760).deckHeight)
  assert.ok(Math.abs(
    large.card.avatarSize / canonical.card.avatarSize
      - large.deckHeight / canonical.deckHeight
  ) < 0.001)
})

test("profile progress remains available at every viewport width", () => {
  assert.equal(resolveDiscoveryLayoutMetrics(320, 760).showProgress, true)
  assert.equal(resolveDiscoveryLayoutMetrics(440, 760).showProgress, true)
})
