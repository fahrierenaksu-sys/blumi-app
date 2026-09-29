import test from "node:test"
import assert from "node:assert/strict"
import { resolveDiscoveryStartup, areDiscoveryImagesDisplayed, recordDiscoveryImageReceipt } from "./discoveryStartupModel"

test("first card requires current safety, data, layout and displayed images", () => {
  const ready = { safetyReady: true, dataReady: true, hasCard: true, chromeReady: true, imagesReady: true, failed: false }
  assert.equal(resolveDiscoveryStartup(ready), "ready")
  for (const field of ["safetyReady", "dataReady", "imagesReady", "chromeReady"] as const) {
    assert.equal(resolveDiscoveryStartup({ ...ready, [field]: false }), "pending")
  }
})
test("empty and quota states need no avatar; errors settle without partial cards", () => {
  assert.equal(resolveDiscoveryStartup({ safetyReady: true, dataReady: true, chromeReady: true, hasCard: false, imagesReady: false, failed: false }), "ready")
  assert.equal(resolveDiscoveryStartup({ safetyReady: false, dataReady: false, chromeReady: false, hasCard: false, imagesReady: false, failed: true }), "error")
})
test("display receipts are scoped to exact current images, including retry/account changes", () => {
  assert.equal(areDiscoveryImagesDisplayed(["account-A:surface", "account-A:avatar"], ["account-A:surface"]), false)
  assert.equal(areDiscoveryImagesDisplayed(["account-B:avatar"], ["account-A:avatar"]), false)
  assert.equal(areDiscoveryImagesDisplayed(["retry-2:avatar"], ["retry-1:avatar"]), false)
  assert.equal(areDiscoveryImagesDisplayed(["surface", "avatar"], ["surface", "avatar", "rear"]), true)
})
test("cancelled/old-account callbacks cannot insert receipts and current receipts stay bounded", () => {
  const required = ["account-B:surface", "account-B:avatar"]
  const current = ["account-A:avatar"]
  assert.equal(recordDiscoveryImageReceipt(current, required, "account-A:surface"), current)
  const next = recordDiscoveryImageReceipt(current, required, required[0])
  assert.deepEqual(next, [required[0]])
  assert.equal(recordDiscoveryImageReceipt(next, required, required[0]), next)
  assert.deepEqual(recordDiscoveryImageReceipt(next, required, required[1]), required)
})
