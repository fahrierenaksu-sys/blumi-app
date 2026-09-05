import assert from "node:assert/strict"
import test from "node:test"

import {
  ROOM_V3_ACTIVE_MASTER_GEOMETRY,
  ROOM_V3_CANONICAL_SHELL_LANGUAGE,
  createRoomV3ShellProductionBriefs,
  validateRoomV3ShellCandidate
} from "./roomV3ShellProductionContract"
import {
  ROOM_V3_ACTIVE_MASTER_ASSET_SHA256,
  ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
  ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
  type RoomV3ShellArtifactReceipt
} from "./roomV3ShellArtifactReceipt"

const completeCandidate = {
  masterGeometryId: ROOM_V3_ACTIVE_MASTER_GEOMETRY.id,
  canvasSize: ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize,
  assetSha256: "a".repeat(64),
  sourceProvenanceId: "source-ledger:apricot",
  geometryOverlayEvidenceId: "geometry-registry:apricot",
  simulatorEvidenceId: "native-evidence:apricot",
  producerEvidenceId: "producer-evidence:v1",
  independentReviewerEvidenceId: "independent-review:v1",
  visualLanguageTags: [...ROOM_V3_CANONICAL_SHELL_LANGUAGE]
}

function createTrustedReceipt(): RoomV3ShellArtifactReceipt {
  return {
    schemaVersion: ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
    verifierId: ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
    buildIdentity: `git:${"b".repeat(40)}`,
    artifactRegistrySha256: `sha256:${"c".repeat(64)}`,
    evidenceBundleSha256: `sha256:${"d".repeat(64)}`,
    masterGeometryId: ROOM_V3_ACTIVE_MASTER_GEOMETRY.id,
    masterAssetSha256: ROOM_V3_ACTIVE_MASTER_ASSET_SHA256,
    approvedShells: [
      {
        shellId: "room_v3_shell_apricot_sky_social_loft",
        assetKey: "room_v3_shell_apricot_sky_social_loft_candidate_v6",
        assetSha256: `sha256:${completeCandidate.assetSha256}`,
        sourceProvenanceId: completeCandidate.sourceProvenanceId,
        geometryOverlayEvidenceId: completeCandidate.geometryOverlayEvidenceId,
        simulatorEvidenceId: completeCandidate.simulatorEvidenceId,
        producerEvidenceId: completeCandidate.producerEvidenceId,
        independentReviewerEvidenceId:
          completeCandidate.independentReviewerEvidenceId
      }
    ]
  }
}

test("creates one application-consistent shell brief for every planned home", () => {
  const briefs = createRoomV3ShellProductionBriefs()

  assert.equal(briefs.length, 6)
  assert.equal(new Set(briefs.map((brief) => brief.collectionId)).size, 6)
  assert.ok(
    briefs.every(
      (brief) =>
        brief.geometryStatus === "source_locked" &&
        brief.canvasSize.width === 1254 &&
        brief.canvasSize.height === 714 &&
        brief.requiredVisualLanguage === ROOM_V3_CANONICAL_SHELL_LANGUAGE
    )
  )
})

test("rejects a shell candidate that drifts from the locked Room V2 source geometry", () => {
  const validation = validateRoomV3ShellCandidate({
    masterGeometryId: "former_room_v2_shell",
    canvasSize: { width: 1662, height: 946 },
    assetSha256: "candidate-sha256",
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
  })

  assert.deepEqual(ROOM_V3_ACTIVE_MASTER_GEOMETRY, {
    id: "room_v2_shell_blumi_world_v1",
    sourceAssetKey: "room_v2_shell_blumi_world_v1",
    canvasSize: { width: 1254, height: 714 },
    approvalEvidenceId: "room-v2-source-locked-user-direction"
  })
  assert.equal(validation.isValid, false)
  assert.deepEqual(validation.issueIds, [
    "invalid_master_geometry",
    "invalid_canvas_size",
    "artifact_verifier_required"
  ])
})

test("reports a source-lock violation once even when both supplied master and candidate ID drift", () => {
  const validation = validateRoomV3ShellCandidate({
    masterGeometryId: "unlocked-master",
    canvasSize: { width: 1254, height: 714 },
    assetSha256: "candidate-sha256",
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
  }, {
    id: "unlocked-master",
    sourceAssetKey: "unlocked-master",
    canvasSize: { width: 1254, height: 714 },
    approvalEvidenceId: "untrusted"
  })

  assert.deepEqual(validation.issueIds, ["invalid_master_geometry", "artifact_verifier_required"])
})

test("keeps a structurally complete manifest pending until a build-time artifact verifier signs it", () => {
  const approvedMaster = ROOM_V3_ACTIVE_MASTER_GEOMETRY
  const validation = validateRoomV3ShellCandidate({
    masterGeometryId: approvedMaster.id,
    canvasSize: approvedMaster.canvasSize,
    assetSha256: "candidate-sha256",
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
  }, approvedMaster)

  assert.deepEqual(validation, {
    isValid: false,
    issueIds: ["artifact_verifier_required"]
  })
})

test("accepts a structurally complete shell only when a trusted receipt matches every evidence binding", () => {
  const validation = validateRoomV3ShellCandidate(
    completeCandidate,
    ROOM_V3_ACTIVE_MASTER_GEOMETRY,
    {
      shellId: "room_v3_shell_apricot_sky_social_loft",
      assetKey: "room_v3_shell_apricot_sky_social_loft_candidate_v6",
      receipt: createTrustedReceipt()
    }
  )

  assert.deepEqual(validation, { isValid: true, issueIds: [] })
})

test("keeps the verifier gate closed when a receipt is structurally valid but bound to another asset", () => {
  const receipt = createTrustedReceipt()
  const validation = validateRoomV3ShellCandidate(
    completeCandidate,
    ROOM_V3_ACTIVE_MASTER_GEOMETRY,
    {
      shellId: "room_v3_shell_apricot_sky_social_loft",
      assetKey: "room_v3_shell_apricot_sky_social_loft_candidate_v6",
      receipt: {
        ...receipt,
        approvedShells: receipt.approvedShells.map((entry) => ({
          ...entry,
          assetSha256: `sha256:${"f".repeat(64)}`
        }))
      }
    }
  )

  assert.deepEqual(validation.issueIds, ["artifact_verifier_required"])
})
