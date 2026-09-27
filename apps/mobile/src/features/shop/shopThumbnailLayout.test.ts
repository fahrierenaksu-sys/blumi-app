import assert from "node:assert/strict"
import test from "node:test"
import { getShopThumbnailLayout } from "./shopThumbnailLayout"

test("transparent canvas padding does not change the visible product footprint", () => {
  const padded = getShopThumbnailLayout([512, 768, 169, 403, 174, 194], 120, 82)!
  const tight = getShopThumbnailLayout([174, 194, 0, 0, 174, 194], 120, 82)!
  const paddedScale = padded.width / 512
  const tightScale = tight.width / 174
  assert.ok(Math.abs(paddedScale - tightScale) < 0.0001)
  assert.ok(Math.abs(padded.left + 169 * paddedScale - tight.left) < 0.0001)
  assert.ok(Math.abs(padded.top + 403 * paddedScale - tight.top) < 0.0001)
  assert.ok(tight.top >= 6)
  assert.ok(tight.top + 194 * tightScale <= 76)
})

test("wide shoes stay contained and centered without distortion", () => {
  const result = getShopThumbnailLayout([256, 384, 88, 310, 100, 40], 90, 70)!
  const scale = result.width / 256
  assert.ok(Math.abs(result.height / 384 - scale) < 0.0001)
  assert.ok(result.left + 88 * scale >= 6)
  assert.ok(result.left + 188 * scale <= 84.0001)
  assert.ok(Math.abs(result.top + 330 * scale - 35) < 0.001)
})

test("unmeasured frames and invalid metadata safely use the existing thumbnail", () => {
  assert.equal(getShopThumbnailLayout(undefined, 90, 70), undefined)
  assert.equal(getShopThumbnailLayout([1, 1, 0, 0, 0, 0], 90, 70), undefined)
  assert.equal(getShopThumbnailLayout([10, 10, 0, 0, 10, 10], 0, 70), undefined)
})
