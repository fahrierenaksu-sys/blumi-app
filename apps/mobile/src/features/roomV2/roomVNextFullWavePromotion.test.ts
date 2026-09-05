import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import type {
  RoomVNextFullWavePromotionRecord,
  RoomVNextFullWavePromotionTrust
} from "./roomVNextFullWavePromotion"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS,
  ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_ARTIFACT_FINGERPRINT
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWaveCatalog") as typeof import("./roomVNextFullWaveCatalog")
const { ROOM_V2_FURNITURE_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./roomV2.mock") as typeof import("./roomV2.mock")
const { resolveHistoricalRoomV2QaFurnitureCatalog } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./roomV2HistoricalQaCatalog") as typeof import("./roomV2HistoricalQaCatalog")
const {
  resolveApprovedRoomVNextFullWaveFurniture,
  ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_BUILD_ID,
  ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_MANIFEST_ID,
  ROOM_VNEXT_FULL_WAVE_EVIDENCE_VERIFIER_ID,
  ROOM_VNEXT_FULL_WAVE_PROMOTION_SCHEMA_VERSION
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWavePromotion") as typeof import("./roomVNextFullWavePromotion")

function completeRecord(): RoomVNextFullWavePromotionRecord {
  return {
    schemaVersion: ROOM_VNEXT_FULL_WAVE_PROMOTION_SCHEMA_VERSION,
    candidateBuildId: ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_BUILD_ID,
    candidateManifestId: ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_MANIFEST_ID,
    candidateArtifactFingerprint: ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_ARTIFACT_FINGERPRINT,
    evidenceManifestId: "evidence-manifest-cute-v3",
    simulatorEvidenceId: "simulator-cute-v3",
    independentReviewerEvidenceId: "review-cute-v3",
    collisionEvidenceId: "collision-cute-v3",
    seatingEvidenceId: "seating-cute-v3",
    persistenceEvidenceId: "persistence-cute-v3",
    buildIdentity: "immutable-commit-cute-v3",
    evidenceBundleSha256: "sha256:cute-v3",
    finalUserApprovalId: "user-approval-cute-v3",
    approvedItemIds: [...ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS]
  }
}

function trustFor(record: RoomVNextFullWavePromotionRecord): RoomVNextFullWavePromotionTrust {
  return {
    evidenceVerifierId: ROOM_VNEXT_FULL_WAVE_EVIDENCE_VERIFIER_ID,
    buildIdentity: record.buildIdentity,
    evidenceBundleSha256: record.evidenceBundleSha256,
    finalUserApprovalId: record.finalUserApprovalId
  }
}

test("full-wave production resolver stays fail-closed without an approval record", () => {
  assert.deepEqual(resolveApprovedRoomVNextFullWaveFurniture(), [])
})

test("complete cute v3 promotion evidence resolves all 45 as approved", () => {
  const record = completeRecord()
  const furniture = resolveApprovedRoomVNextFullWaveFurniture(record, trustFor(record))
  assert.equal(furniture.length, 45)
  assert.ok(furniture.every((item) => item.sourceStatus === "approved" && item.qaStatus === "pass"))
})

test("production catalog ingress appends cute v3 only when a complete record is supplied", () => {
  const record = completeRecord()
  const catalog = resolveHistoricalRoomV2QaFurnitureCatalog([], null, [record], trustFor(record))
  assert.equal(catalog.length, ROOM_V2_FURNITURE_CATALOG.length + 45)
  assert.equal(catalog.filter((item) => item.sourceStatus === "approved").length, 45)
})

test("promotion resolver rejects a mismatched build, digest, or ordered SKU set", () => {
  const record = completeRecord()
  assert.deepEqual(
    resolveApprovedRoomVNextFullWaveFurniture(
      { ...record, candidateBuildId: "other-build" },
      trustFor(record)
    ),
    []
  )
  assert.deepEqual(
    resolveApprovedRoomVNextFullWaveFurniture(
      record,
      { ...trustFor(record), evidenceBundleSha256: "sha256:other" }
    ),
    []
  )
  assert.deepEqual(
    resolveApprovedRoomVNextFullWaveFurniture(
      { ...record, approvedItemIds: [...record.approvedItemIds].reverse() },
      trustFor(record)
    ),
    []
  )
  assert.deepEqual(
    resolveApprovedRoomVNextFullWaveFurniture(
      { ...record, candidateArtifactFingerprint: "fnv1a32:drifted" },
      trustFor(record)
    ),
    []
  )
})
