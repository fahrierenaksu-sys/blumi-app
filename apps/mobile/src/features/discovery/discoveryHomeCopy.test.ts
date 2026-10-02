import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVERY_VIBE_OPTIONS,
  getDiscoveryHomeCopy
} from "./discoveryHomeCopy"

test("vibe filter values stay canonical while every locale labels each one", () => {
  // The server matches vibes by value, so only the label is localised.
  assert.deepEqual(DISCOVERY_VIBE_OPTIONS, [
    "Coffee dates",
    "Slow burn",
    "Bookish",
    "Outdoors",
    "Creative",
    "Fitness",
    "Night owl",
    "Pets"
  ])
  for (const locale of ["tr", "en"] as const) {
    const { vibeLabels } = getDiscoveryHomeCopy(locale).filters
    for (const vibe of DISCOVERY_VIBE_OPTIONS) {
      assert.ok(vibeLabels[vibe].trim().length > 0, `${locale}: ${vibe}`)
    }
  }
  assert.equal(getDiscoveryHomeCopy("en").filters.vibeLabels["Coffee dates"], "Coffee dates")
})
