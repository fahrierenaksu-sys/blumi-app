import assert from "node:assert/strict"
import test from "node:test"
import {
  getConnectionBannerCopy,
  resolveConnectionBannerLocale,
  resolveConnectionBannerState
} from "./connectionBannerModel"

test("initial realtime connection is silent while offline and later failures remain visible", () => {
  assert.equal(resolveConnectionBannerState("connecting", true), "hidden")
  assert.equal(resolveConnectionBannerState("connecting", true, true), "reconnecting")
  assert.equal(resolveConnectionBannerState("idle", true), "hidden")
  assert.equal(resolveConnectionBannerState("connected", true), "hidden")
  assert.equal(resolveConnectionBannerState("connecting", false), "offline")
  assert.equal(resolveConnectionBannerState("reconnecting", true), "reconnecting")
  assert.equal(resolveConnectionBannerState("disconnected", true), "reconnecting")
  assert.equal(resolveConnectionBannerState("error", true), "reconnecting")
})

test("an unreachable server is shown as unreachable, not as an imminent reconnect", () => {
  assert.equal(resolveConnectionBannerState("unreachable", true), "unreachable")
  // Device offline still wins: the fix is on the user's side.
  assert.equal(resolveConnectionBannerState("unreachable", false), "offline")
})

test("banner copy is honest in English and Turkish", () => {
  const english = getConnectionBannerCopy("en")
  const turkish = getConnectionBannerCopy("tr")
  assert.equal(english.offline, "No internet connection")
  assert.equal(english.reconnecting, "Reconnecting to Blumi…")
  assert.match(english.unreachable, /can't reach Blumi/i)
  assert.match(english.unreachable, /trying/i)
  assert.match(turkish.unreachable, /ulaşılamıyor/)
  for (const key of ["offline", "connecting", "reconnecting", "unreachable"] as const) {
    assert.ok(turkish[key].length > 0)
    assert.notEqual(turkish[key], english[key])
  }
  assert.equal(resolveConnectionBannerLocale("tr-TR"), "tr")
  assert.equal(resolveConnectionBannerLocale("en-GB"), "en")
  assert.equal(resolveConnectionBannerLocale(undefined), "en")
})
