import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreTrustedArtifactRegistry
} from "./roomV3UniversalCoreRuntimeFurniture"
import {
  resolveApprovedRoomV3UniversalCoreFurniture,
  type RoomV3UniversalCorePromotionRecord,
  type RoomV3UniversalCorePromotionTrust
} from "./roomV3UniversalCorePromotion"
import {
  ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
  ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
  type RoomV3UniversalCoreEvidenceManifest
} from "./roomV3UniversalCoreEvidenceManifest"
import { ROOM_V3_FURNITURE_CATEGORIES } from "./roomV3ProductionPlan"
import { ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID } from "./roomV3UniversalCoreInventory"
import type { RoomFurnitureRotation } from "./roomV2.types"
import {
  UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
  UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
  UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
  type UniversalCoreRoomPromotionRecord
} from "@blumi/domain"
import {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID
} from "./roomV3UniversalCoreArtifactRegistry"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

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

const SEAT_CANDIDATE_IDS = new Set([
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_lounge_armchair_a",
  "universal_cloud_accent_chair_b",
  "universal_cloud_loveseat_a",
  "universal_bench_a",
  "universal_long_sofa_a",
  "universal_cloud_bed_b",
  "universal_soft_pouf_b"
])
function getRequiredRotations(candidateId: string): readonly RoomFurnitureRotation[] {
  const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[candidateId as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID]
  const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
  return category?.requiresDirectionalAssets
    ? ["front", "back", "left", "right"]
    : ["front"]
}

function createTrustedArtifactRegistry(): RoomV3UniversalCoreTrustedArtifactRegistry {
  return {
    verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => [
        id,
        { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id] }
      ])
    )
  }
}

function createCompleteEvidenceManifest(): RoomV3UniversalCoreEvidenceManifest {
  return {
    manifestVersion: ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    buildIdentity: `git:${"a".repeat(40)}`,
    evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
    evidenceBundleSha256: `sha256:${"b".repeat(64)}`,
    simulatorDevice: "iPhone 17 Pro iOS 26.4 Simulator",
    simulatorViewport: { width: 390, height: 844, orientation: "portrait" },
    rows: ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((candidateId, index) => {
      const rotations = getRequiredRotations(candidateId)
      const simulatorScreenshotPathByRotation = Object.fromEntries(
        rotations.map((rotation) => [
          rotation,
          `docs/room-v3-qa/universal-core/${candidateId}_${rotation}.png`
        ])
      )
      const simulatorScreenshotPaths = Object.values(
        simulatorScreenshotPathByRotation
      )
      return {
        candidateId,
        artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
        scaleSceneEvidenceId: `scale-${index}`,
        perspectiveProfile: ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
        perspectiveEvidenceId: `perspective-${index}`,
        perspectiveResult: {
          cameraAlignment: "pass" as const,
          surfaceContact: "pass" as const,
          avatarScale: "pass" as const,
          depthOcclusion: "pass" as const
        },
        depthLaneEvidenceId: `depth-${index}`,
        collisionEvidenceId: `collision-${index}`,
        persistenceEvidenceId: `persistence-${index}`,
        simulatorEvidenceId: `simulator-${index}`,
        independentReviewId: `review-${index}`,
        rotationsReviewed: rotations,
        placementAction: "place in canonical Room V2 mobile shell",
        collisionResult: "pass" as const,
        persistenceResult: "pass" as const,
        ...(SEAT_CANDIDATE_IDS.has(candidateId)
          ? {
              seatingEvidenceId: `seating-${index}`,
              seatingResult: {
                contact: "pass" as const,
                approach: "pass" as const,
                exit: "pass" as const
              }
            }
          : {}),
        simulatorScreenshotPaths,
        simulatorScreenshotPathByRotation,
        simulatorScreenshotSha256ByPath: Object.fromEntries(
          simulatorScreenshotPaths.map((screenshotPath, rotationIndex) => [
            screenshotPath,
            `sha256:${(index * 4 + rotationIndex).toString(16).padStart(64, "0")}`
          ])
        )
      }
    })
  }
}

function createCompleteRecord(): RoomV3UniversalCorePromotionRecord {
  const skuEvidenceManifest = createCompleteEvidenceManifest()
  const evidenceManifestId = "room-v3-universal-core-test-evidence-manifest"
  return {
    artifactRegistry: createTrustedArtifactRegistry(),
    evidenceManifestId,
    simulatorEvidenceId: "simulator-universal-core-v1",
    independentReviewerEvidenceId: "reviewer-universal-core-v1",
    collisionEvidenceId: "collision-universal-core-v1",
    seatingEvidenceId: "seating-universal-core-v1",
    persistenceEvidenceId: "persistence-universal-core-v1",
    skuEvidenceManifest,
    economyPromotion: {
      schemaVersion: UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
      buildIdentity: skuEvidenceManifest.buildIdentity,
      evidenceManifestId,
      evidenceVerifierId: skuEvidenceManifest.evidenceVerifierId,
      evidenceBundleSha256: skuEvidenceManifest.evidenceBundleSha256,
      artifactManifestId: UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
      candidateSetDigest: UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
      approvedItemIds: [...UNIVERSAL_CORE_ROOM_ITEM_IDS]
    }
  }
}

function createCompleteTrust(
  record: RoomV3UniversalCorePromotionRecord
): RoomV3UniversalCorePromotionTrust {
  return {
    buildIdentity: record.skuEvidenceManifest.buildIdentity,
    evidenceVerifierId: record.skuEvidenceManifest.evidenceVerifierId,
    evidenceBundleSha256: record.skuEvidenceManifest.evidenceBundleSha256
  }
}

test("Universal Core promotion stays closed without a complete evidence record", () => {
  assert.deepEqual(resolveApprovedRoomV3UniversalCoreFurniture(), [])
  const complete = createCompleteRecord()
  assert.deepEqual(resolveApprovedRoomV3UniversalCoreFurniture(complete), [])
  assert.deepEqual(
    resolveApprovedRoomV3UniversalCoreFurniture({
      ...complete,
      simulatorEvidenceId: ""
    }, createCompleteTrust(complete)),
    []
  )
})

test("Universal Core promotion stays closed when only global evidence exists without the 45-row SKU manifest", () => {
  const complete = createCompleteRecord()
  const { skuEvidenceManifest: _skuEvidenceManifest, ...globalOnlyRecord } = complete

  assert.deepEqual(
    resolveApprovedRoomV3UniversalCoreFurniture(
      globalOnlyRecord as RoomV3UniversalCorePromotionRecord,
      createCompleteTrust(complete)
    ),
    []
  )
})

test("Universal Core promotion rejects an evidence manifest bound to another artifact registry", () => {
  const record = createCompleteRecord()
  const mismatched = {
    ...record,
    skuEvidenceManifest: {
      ...record.skuEvidenceManifest,
      artifactManifestId: "different-artifact-manifest",
      rows: record.skuEvidenceManifest.rows.map((row) => ({
        ...row,
        artifactManifestId: "different-artifact-manifest"
      }))
    }
  }

  assert.deepEqual(
    resolveApprovedRoomV3UniversalCoreFurniture(
      mismatched,
      createCompleteTrust(record)
    ),
    []
  )
})

test("Universal Core promotion rejects a missing or mismatched server economy gate", () => {
  const complete = createCompleteRecord()
  const { economyPromotion: _economyPromotion, ...withoutEconomyGate } = complete
  assert.deepEqual(
    resolveApprovedRoomV3UniversalCoreFurniture(
      withoutEconomyGate as RoomV3UniversalCorePromotionRecord,
      createCompleteTrust(complete)
    ),
    []
  )

  for (const economyPromotion of [
    {
      ...complete.economyPromotion,
      buildIdentity: "another-build"
    },
    {
      ...complete.economyPromotion,
      evidenceManifestId: "another-evidence-manifest"
    },
    {
      ...complete.economyPromotion,
      artifactManifestId: "another-artifact-manifest"
    },
    {
      ...complete.economyPromotion,
      approvedItemIds: complete.economyPromotion.approvedItemIds.slice(1)
    }
  ] satisfies UniversalCoreRoomPromotionRecord[]) {
    assert.deepEqual(
      resolveApprovedRoomV3UniversalCoreFurniture({
        ...complete,
        economyPromotion
      }, createCompleteTrust(complete)),
      []
    )
  }
})

test("Universal Core promotion resolves the complete 45-item runtime wave when evidence is complete", () => {
  const record = createCompleteRecord()
  const promoted = resolveApprovedRoomV3UniversalCoreFurniture(
    record,
    createCompleteTrust(record)
  )

  assert.equal(promoted.length, 45)
  assert.equal(new Set(promoted.map((item) => item.id)).size, 45)
  assert.ok(promoted.every((item) => item.sourceStatus === "approved"))
  assert.ok(promoted.every((item) => item.qaStatus === "pass"))
  assert.ok(promoted.every((item) => {
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
      item.id as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
    ]
    const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
    return category?.requiresDirectionalAssets
      ? Boolean(item.assetsByRotation)
      : item.assetsByRotation === undefined
  }))
})

test("Universal Core promotion rejects trusted approval bound to another digest or build", () => {
  const record = createCompleteRecord()
  const trust = createCompleteTrust(record)
  for (const mismatchedTrust of [
    { ...trust, buildIdentity: `git:${"c".repeat(40)}` },
    { ...trust, evidenceVerifierId: "untrusted-verifier" },
    { ...trust, evidenceBundleSha256: `sha256:${"d".repeat(64)}` }
  ]) {
    assert.deepEqual(
      resolveApprovedRoomV3UniversalCoreFurniture(record, mismatchedTrust),
      []
    )
  }
})
