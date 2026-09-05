import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

// The focused TypeScript test runner emits JS to a temporary directory while
// the React Native asset files remain in the source tree. Resolve those image
// requests back to the checked-in assets before Node applies the extension
// stubs above.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && /\.(png|webp)$/.test(request)) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2.mock") as typeof import("./roomV2.mock")
const {
  ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG,
  ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT,
  resolveHistoricalRoomV2QaFurnitureCatalog
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2HistoricalQaCatalog") as typeof import("./roomV2HistoricalQaCatalog")
const {
  roomV2ProductionAssets
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2ProductionAssets") as typeof import("./roomV2ProductionAssets")
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreArtifactRegistry") as typeof import("./roomV3UniversalCoreArtifactRegistry")
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  validateRoomFurnitureVisualContract
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextContracts") as typeof import("./roomVNextContracts")
const {
  ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
  ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreEvidenceManifest") as typeof import("./roomV3UniversalCoreEvidenceManifest")
const {
  ROOM_V3_FURNITURE_CATEGORIES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3ProductionPlan") as typeof import("./roomV3ProductionPlan")
const {
  ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreInventory") as typeof import("./roomV3UniversalCoreInventory")
const {
  UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
  UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
  UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("@blumi/domain") as typeof import("@blumi/domain")
const seatCandidateIds = new Set([
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

function getFurnitureItem(itemId: string) {
  const item = ROOM_V2_FURNITURE_CATALOG.find((candidate) => candidate.id === itemId)
  assert.ok(item, `missing active Room V2 furniture item: ${itemId}`)
  return item
}

function collectAssetSources(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return []
  }

  if ("source" in input && typeof (input as { source?: unknown }).source === "string") {
    return [(input as { source: string }).source]
  }

  return Object.values(input).flatMap((value) => collectAssetSources(value))
}

test("default My Room shell keeps the approved wide framing instead of the cropped legacy zoom", () => {
  const shell = ROOM_V2_SHELL_CATALOG.find(
    (candidate) => candidate.id === "room_v2_shell_blumi_world_v1"
  )
  assert.ok(shell)
  assert.equal(shell.myRoomCamera?.compactRendererWidth, "155%")
  assert.equal(shell.myRoomCamera?.regularRendererWidth, "154%")
  assert.equal(shell.myRoomCamera?.rendererTranslateY, 0)
  assert.equal(shell.myRoomCamera?.compactStageHeightRatio, 0.64)
  assert.equal(shell.myRoomCamera?.wideStageHeightRatio, 0.64)
})

test("runtime assets do not bundle the blocked historical shell draft", () => {
  assert.equal("mintGardenMasterDraft" in roomV2ProductionAssets.shells, false)
  assert.equal(
    Object.keys(roomV2ProductionAssets.furniture).some((key) => key.startsWith("roomVNext")),
    false
  )
  assert.equal(
    collectAssetSources(roomV2ProductionAssets).some((source) =>
      source.includes("/assets/runtime/room-vnext/")
    ),
    false
  )
})

function getRequiredRotations(
  candidateId: string
): readonly import("./roomV2.types").RoomFurnitureRotation[] {
  const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
    candidateId as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
  ]
  const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
  return category?.requiresDirectionalAssets
    ? (["front", "back", "left", "right"] as const)
    : (["front"] as const)
}

function createCompletePromotionRecord(): import("./roomV3UniversalCorePromotion").RoomV3UniversalCorePromotionRecord {
  const buildIdentity = `git:${"a".repeat(40)}`
  const evidenceBundleSha256 = `sha256:${"b".repeat(64)}`
  return {
    artifactRegistry: {
      verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
      artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
      verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
      verifiedAssetHashesByCandidateId: Object.fromEntries(
        ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => [
          id,
          { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id] }
        ])
      )
    },
    evidenceManifestId: "room-v3-universal-core-test-evidence-manifest",
    simulatorEvidenceId: "simulator-universal-core-v1",
    independentReviewerEvidenceId: "reviewer-universal-core-v1",
    collisionEvidenceId: "collision-universal-core-v1",
    seatingEvidenceId: "seating-universal-core-v1",
    persistenceEvidenceId: "persistence-universal-core-v1",
    skuEvidenceManifest: {
      manifestVersion: ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
      artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
      buildIdentity,
      evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
      evidenceBundleSha256,
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
        collisionResult: "pass",
        persistenceResult: "pass",
        simulatorScreenshotPaths,
        simulatorScreenshotPathByRotation,
        simulatorScreenshotSha256ByPath: Object.fromEntries(
          simulatorScreenshotPaths.map((screenshotPath, rotationIndex) => [
            screenshotPath,
            `sha256:${(index * 4 + rotationIndex).toString(16).padStart(64, "0")}`
          ])
        ),
        ...(seatCandidateIds.has(candidateId)
          ? {
              seatingEvidenceId: `seating-${index}`,
              seatingResult: { contact: "pass", approach: "pass", exit: "pass" }
            }
          : {})
      }
      })
    },
    economyPromotion: {
      schemaVersion: UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
      buildIdentity,
      evidenceManifestId: "room-v3-universal-core-test-evidence-manifest",
      evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
      evidenceBundleSha256,
      artifactManifestId: UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
      candidateSetDigest: UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
      approvedItemIds: [...UNIVERSAL_CORE_ROOM_ITEM_IDS]
    }
  }
}

function createCompletePromotionTrust(
  record: import("./roomV3UniversalCorePromotion").RoomV3UniversalCorePromotionRecord
): import("./roomV3UniversalCorePromotion").RoomV3UniversalCorePromotionTrust {
  return {
    buildIdentity: record.skuEvidenceManifest.buildIdentity,
    evidenceVerifierId: record.skuEvidenceManifest.evidenceVerifierId,
    evidenceBundleSha256: record.skuEvidenceManifest.evidenceBundleSha256
  }
}

test("active Room V2 seating declares complete seatSpec routing metadata", () => {
  const chair = getFurnitureItem("room_v2_chair_blush")
  const bed = getFurnitureItem("room_v2_cozy_bed")

  assert.equal(bed.sceneProjection, "floor_plane")
  assert.deepEqual(bed.renderSizeByRotation?.front, {
    width: 0.294,
    height: 0.196
  })
  assert.deepEqual(bed.anchorByRotation?.right, { x: 0.5, y: 1 })

  assert.deepEqual(chair.seatSpec, {
    capacity: 1,
    seatPoints: [{
      id: "front_edge",
      x: 0,
      y: -0.2,
      facing: "front",
      approachPoint: { x: 0, y: 0.22 },
      exitPoint: { x: 0, y: 0.28 },
      seatHeight: 0.096
    }]
  })
  assert.deepEqual(bed.seatSpec, {
    capacity: 1,
    seatPoints: [{
      id: "left_edge",
      x: -0.18,
      y: -0.36,
      facing: "left",
      approachPoint: { x: -0.18, y: 0.36 },
      exitPoint: { x: -0.18, y: 0.44 },
      seatHeight: 0.08
    }]
  })

  for (const item of [chair, bed]) {
    assert.equal(item.interactionType, "seat")
    assert.ok(item.seatSpec)
    assert.equal(item.seatSpec.capacity, item.seatSpec.seatPoints.length)
    for (const seat of item.seatSpec.seatPoints) {
      assert.ok(seat.approachPoint)
      assert.ok(seat.exitPoint)
      assert.equal(typeof seat.seatHeight, "number")
    }
  }
})

test("active Room V2 blush lounge chair carries a front-seat occlusion crop", () => {
  const chair = getFurnitureItem("room_v2_chair_blush")

  assert.deepEqual(chair.frontOcclusionByRotation, {
    front: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    back: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    left: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    right: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 }
  })
})

test("active Room V2 bookshelf is placed on the wall surface", () => {
  const bookshelf = getFurnitureItem("room_v2_cute_bookshelf")
  assert.equal(bookshelf.placementSurface, "wall")
  assert.equal(bookshelf.layer, "wall")
  assert.equal(bookshelf.blocksMovement, false)
  assert.equal(bookshelf.footprint, undefined)
})

test("active Room V2 tables expose their tabletop support bounds", () => {
  for (const itemId of ["room_v2_table_round", "room_v2_side_table"]) {
    const item = getFurnitureItem(itemId)
    assert.deepEqual(item.surfaceSupports, [{
      surface: "tabletop",
      localBounds: { minX: 0.12, maxX: 0.88, minY: 0.18, maxY: 0.28 }
    }])
  }
})

test("active Room V2 production catalog stays legacy-only by default and appends the full approved 45-piece wave only through promotion records", () => {
  assert.equal(ROOM_V2_FURNITURE_CATALOG.length, 7)

  const record = createCompletePromotionRecord()
  const promotedCatalog = resolveHistoricalRoomV2QaFurnitureCatalog(
    [record],
    createCompletePromotionTrust(record)
  )

  assert.equal(promotedCatalog.length, 52)
  assert.deepEqual(
    promotedCatalog.slice(0, 7).map((item) => item.id),
    ROOM_V2_FURNITURE_CATALOG.map((item) => item.id)
  )
  assert.equal(
    promotedCatalog.filter((item) => item.id.startsWith("universal_")).length,
    45
  )
  assert.ok(
    promotedCatalog
      .filter((item) => item.id.startsWith("universal_"))
      .every((item) => item.sourceStatus === "approved" && item.qaStatus === "pass")
  )
})

test("VNext QA candidate catalog contains the bed plus every cohesion pilot piece without changing production", () => {
  assert.deepEqual(
    ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG.map((item) => item.id),
    [
      "room_v2_cozy_bed",
      "room_vnext_lounge_chair",
      "room_vnext_round_table",
      "room_vnext_side_table",
      "room_vnext_lamp",
      "room_vnext_bookshelf",
      "room_vnext_rug",
      "room_vnext_tabletop_plant"
    ]
  )
  assert.ok(ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG.slice(1).every((item) =>
    item.sourceStatus === "candidate" &&
    item.qaStatus === "pending" &&
    item.visualContract?.assetVersion === 17
  ))
  assert.equal(ROOM_V2_FURNITURE_CATALOG.some((item) => item.id === "room_vnext_rug"), false)
})

test("VNext QA candidate uses the refined v17 pilot and v0.34 clean-master bed proof sources", () => {
  const [, ...pilot] = ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG
  assert.equal(ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT.assetVersion, 25)
  assert.equal(ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT.physicalSizeCm.height, 140)
  for (const direction of ["front", "right", "back", "left"] as const) {
    const visual = ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT.directions[direction]
    assert.deepEqual(
      visual.normalizedFloorPivot,
      { x: 0.5027322404371585, y: 0.6857923497267759 }
    )
    assert.ok(String(visual.bodyAsset.source).includes("pink-cloud-bed-v0.34-candidate"))
    assert.ok(String(visual.contactShadowAsset?.source).includes("pink-cloud-bed-v0.34-candidate"))
    assert.ok(String(visual.thumbnailAsset?.source).includes("pink-cloud-bed-v0.34-candidate"))
  }
  assert.ok(pilot.every((item) =>
    String(item.visualContract?.directions.front.bodyAsset.source).includes("pilot-v17") &&
    String(item.thumbnail?.source).includes("pilot-v17")
  ))
})

test("every cohesion pilot item carries a valid four-direction visual contract", () => {
  for (const item of ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG.slice(1)) {
    const validation = validateRoomFurnitureVisualContract(item.visualContract!)
    assert.equal(validation.isValid, true, `${item.id}: ${validation.issueIds.join(",")}`)
    assert.deepEqual(Object.keys(item.visualContract!.directions).sort(), ["back", "front", "left", "right"])
    assert.equal(item.visualContract!.directions.front.normalizedFloorPivot.x, item.visualContract!.directions.right.normalizedFloorPivot.x)
    assert.equal(item.visualContract!.directions.front.normalizedFloorPivot.y, item.visualContract!.directions.right.normalizedFloorPivot.y)
  }
})

test("every cohesion pilot direction exposes finite numeric render dimensions", () => {
  const directions = ["front", "right", "back", "left"] as const

  for (const item of ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG.slice(1)) {
    for (const direction of directions) {
      const size = item.renderSizeByRotation?.[direction]
      assert.ok(size, `${item.id} is missing ${direction} render size`)
      assert.equal(typeof size.width, "number")
      assert.equal(typeof size.height, "number")
      assert.ok(Number.isFinite(size.width))
      assert.ok(Number.isFinite(size.height))
      assert.deepEqual(size, item.visualContract?.directions[direction].normalizedRenderSize)
    }
  }
})

test("the cohesion rug uses the floor render pass instead of furniture depth", () => {
  const rug = ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG.find((item) => item.id === "room_vnext_rug")
  assert.ok(rug)
  assert.equal(rug.sceneProjection, "floor_plane")
  assert.equal(rug.layer, "floor")
})
