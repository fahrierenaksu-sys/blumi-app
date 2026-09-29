import assert from "node:assert/strict"
import test from "node:test"
import { resolveConnectionBannerState } from "./connectionBannerModel"

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
