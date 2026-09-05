import assert from "node:assert/strict"
import test from "node:test"
import {
  verifyUniversalCoreAssets
} from "./verify-room-v3-universal-core-assets.mjs"

test("artifact verifier trusts the complete 45-product wave and keeps surface exceptions explicit", async () => {
  const report = await verifyUniversalCoreAssets()

  assert.equal(report.productCount, 45)
  assert.equal(report.isTrusted, true)
  assert.deepEqual(report.issueIds, [])
  assert.ok(report.products.every((product) => product.assetCount >= 1))
  assert.ok(report.products.some((product) => product.requiredDirections.length === 4))
  assert.ok(report.products.some((product) => product.requiredDirections.length === 1))
  assert.ok(report.products.every((product) =>
    product.assets.every((asset) => asset.sha256.length === 64 && asset.alphaBounds)
  ))
})
