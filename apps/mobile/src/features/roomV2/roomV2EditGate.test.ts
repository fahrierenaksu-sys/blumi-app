import assert from "node:assert/strict"
import test from "node:test"
import { canEditRoomV2Decor } from "./roomV2EditGate"

test("room edits wait for both room persistence and owner inventory", () => {
  assert.equal(canEditRoomV2Decor("loading", true), false)
  assert.equal(canEditRoomV2Decor("ready", false), false)
  assert.equal(canEditRoomV2Decor("ready", true), true)
})

test("room edits recover to a safe local draft after persistence fails", () => {
  // A load error is recovered to the provider's fresh default draft. The
  // inventory gate still protects ownership-sensitive edits.
  assert.equal(canEditRoomV2Decor("failed", true), true)
  assert.equal(canEditRoomV2Decor("failed", false), false)
})
