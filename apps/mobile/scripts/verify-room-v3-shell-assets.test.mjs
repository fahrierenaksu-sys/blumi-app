import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_REGISTRY_PATH,
  verifyRoomV3ShellAssets
} from "./verify-room-v3-shell-assets.mjs"

test("writes unqualified current-shell evidence to the current checkpoint", () => {
  assert.match(
    DEFAULT_REGISTRY_PATH,
    /2026-07-28-six-shell-prototype-current\/shell_artifact_registry\.json$/
  )
})

test("validates the six current shell candidates without opaque black edge mattes", async () => {
  const report = await verifyRoomV3ShellAssets()

  assert.equal(report.shellCount, 6)
  assert.equal(report.isGeometryValid, true)
  assert.equal(report.isTrusted, false)
  assert.equal(report.promotionEligible, false)
  assert.deepEqual(report.issueIds, [])
  assert.deepEqual(report.trustIssueIds, [
    "visual_review_required",
    "native_simulator_evidence_required",
    "independent_review_required"
  ])
  assert.ok(report.master.alphaMaskSha256.length > 0)
  assert.ok(report.shells.every((shell) => shell.lockedGeometry === "PASS"))
  assert.ok(report.shells.every((shell) => shell.canvasSize.width === 1254))
  assert.ok(report.shells.every((shell) => shell.canvasSize.height === 714))
  assert.ok(report.shells.every((shell) => shell.opaqueNearBlackEdgePixelCount === 0))
  assert.deepEqual(
    report.shells.map((shell) => shell.path.match(/candidate_(v\d+)\.png$/)?.[1]),
    ["v6", "v10", "v6", "v10", "v6", "v6"]
  )
})

test("rejects the superseded v3 shell wave because it contains opaque black mattes", async () => {
  const shellIds = [
    "apricot_sky_social_loft",
    "blush_petal_cottage",
    "cocoa_navy_modern_studio",
    "sage_cloud_scandinavian"
  ]
  const report = await verifyRoomV3ShellAssets({
    shellIds,
    candidateVersion: "v3"
  })

  assert.equal(report.shellCount, 4)
  assert.deepEqual(report.shells.map((shell) => shell.id), shellIds)
  assert.ok(report.shells.every((shell) => shell.path.endsWith("_candidate_v3.png")))
  assert.equal(report.isGeometryValid, true)
  assert.equal(report.isArtifactValid, false)
  assert.equal(report.isTrusted, false)
  assert.equal(report.promotionEligible, false)
  assert.deepEqual(report.issueIds, [
    "blush_petal_cottage:opaque_near_black_matte",
    "sage_cloud_scandinavian:opaque_near_black_matte"
  ])
  assert.ok(report.shells.every((shell) => shell.lockedGeometry === "PASS"))
})
