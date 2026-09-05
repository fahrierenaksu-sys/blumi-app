import assert from "node:assert/strict"
import test from "node:test"

import type { RoomShell } from "./roomV2.types"
import {
  resolveApprovedRoomV3Shells,
  type RoomV3ShellPromotionRecord
} from "./roomV3ShellPromotion"
import {
  ROOM_V3_ACTIVE_MASTER_ASSET_SHA256,
  ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
  ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
  type RoomV3ShellArtifactReceipt
} from "./roomV3ShellArtifactReceipt"

const roomV3Shell: RoomShell = {
  id: "room_v3_shell_blush_petal_cottage",
  name: "Blush Petal Cottage",
  asset: { key: "room-v3-pilot", source: 1 },
  canvasSize: { width: 1254, height: 714 },
  geometryVersion: "room_v3",
  sourceStatus: "approved",
  qaStatus: "pass"
}

const approvedMaster = {
  id: "room_v2_shell_blumi_world_v1",
  sourceAssetKey: "room_v2_shell_blumi_world_v1",
  canvasSize: { width: 1254, height: 714 },
  approvalEvidenceId: "room-v2-source-locked-user-direction"
} as const

const promotionRecord: RoomV3ShellPromotionRecord = {
  shellId: roomV3Shell.id,
  masterGeometryId: approvedMaster.id,
  canvasSize: approvedMaster.canvasSize,
  assetSha256: "e".repeat(64),
  sourceProvenanceId: "artist-source-record",
  geometryOverlayEvidenceId: "overlay-record",
  simulatorEvidenceId: "simulator-record",
  producerEvidenceId: "producer-record",
  independentReviewerEvidenceId: "reviewer-record",
  visualLanguageTags: [
    "soft_painterly",
    "warm_ambient",
    "rounded_friendly",
    "avatar_scale_consistent",
    "premium_material_depth"
  ]
}

const trustedReceipt: RoomV3ShellArtifactReceipt = {
  schemaVersion: ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
  verifierId: ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
  buildIdentity: `git:${"a".repeat(40)}`,
  artifactRegistrySha256: `sha256:${"b".repeat(64)}`,
  evidenceBundleSha256: `sha256:${"c".repeat(64)}`,
  masterGeometryId: approvedMaster.id,
  masterAssetSha256: ROOM_V3_ACTIVE_MASTER_ASSET_SHA256,
  approvedShells: [
    {
      shellId: roomV3Shell.id,
      assetKey: roomV3Shell.asset.key,
      assetSha256: `sha256:${promotionRecord.assetSha256}`,
      sourceProvenanceId: promotionRecord.sourceProvenanceId,
      geometryOverlayEvidenceId: promotionRecord.geometryOverlayEvidenceId,
      simulatorEvidenceId: promotionRecord.simulatorEvidenceId,
      producerEvidenceId: promotionRecord.producerEvidenceId,
      independentReviewerEvidenceId:
        promotionRecord.independentReviewerEvidenceId
    }
  ]
}

test("does not expose V3 shells to the runtime catalog before a master is approved", () => {
  assert.deepEqual(
    resolveApprovedRoomV3Shells([roomV3Shell], [promotionRecord], null),
    []
  )
})

test("does not expose a V3 shell from metadata until the build-time artifact verifier exists", () => {
  const approvedShells = resolveApprovedRoomV3Shells(
    [roomV3Shell],
    [promotionRecord],
    approvedMaster
  )

  assert.deepEqual(approvedShells, [])
})

test("promotes only the shell explicitly bound to a trusted artifact receipt", () => {
  const approvedShells = resolveApprovedRoomV3Shells(
    [roomV3Shell],
    [promotionRecord],
    approvedMaster,
    trustedReceipt
  )

  assert.equal(approvedShells.length, 1)
  assert.deepEqual(approvedShells[0], {
    ...roomV3Shell,
    asset: { ...roomV3Shell.asset },
    canvasSize: { ...roomV3Shell.canvasSize },
    sourceStatus: "approved",
    qaStatus: "pass"
  })
  assert.notEqual(approvedShells[0], roomV3Shell)
})

test("fails closed when receipt and promotion metadata disagree", () => {
  assert.deepEqual(
    resolveApprovedRoomV3Shells(
      [roomV3Shell],
      [{ ...promotionRecord, simulatorEvidenceId: "another-native-run" }],
      approvedMaster,
      trustedReceipt
    ),
    []
  )
})
