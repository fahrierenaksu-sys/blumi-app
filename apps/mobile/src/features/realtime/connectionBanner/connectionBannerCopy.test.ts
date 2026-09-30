import assert from "node:assert/strict"
import test from "node:test"
import { getConnectionBannerLabel } from "./connectionBannerCopy"

test("banner copy is short, honest and localized in Turkish and English", () => {
  assert.equal(getConnectionBannerLabel("reconnecting", "en"), "Connecting…")
  assert.equal(getConnectionBannerLabel("reconnecting", "tr"), "Bağlanıyor…")
  assert.equal(getConnectionBannerLabel("offline", "en"), "No internet connection")
  assert.equal(getConnectionBannerLabel("offline", "tr"), "İnternet bağlantısı yok")
  assert.match(getConnectionBannerLabel("unreachable", "en"), /can't reach Blumi/i)
  assert.match(getConnectionBannerLabel("unreachable", "en"), /trying/i)
  assert.match(getConnectionBannerLabel("unreachable", "tr"), /ulaşılamıyor/)
  for (const state of ["reconnecting", "offline", "unreachable"] as const) {
    assert.notEqual(getConnectionBannerLabel(state, "tr"), getConnectionBannerLabel(state, "en"))
    assert.doesNotMatch(getConnectionBannerLabel(state, "en"), /Reconnecting to Blumi/)
  }
})

test("a hidden banner has no label", () => {
  assert.equal(getConnectionBannerLabel("hidden", "en"), "")
  assert.equal(getConnectionBannerLabel("hidden", "tr"), "")
})
