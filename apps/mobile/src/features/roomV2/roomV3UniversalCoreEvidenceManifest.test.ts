import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  createRoomV3UniversalCoreEvidenceBundlePayload,
  ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
  ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
  verifyRoomV3UniversalCoreEvidenceFiles,
  validateRoomV3UniversalCoreEvidenceManifest,
  type RoomV3UniversalCoreEvidenceManifest,
  type RoomV3UniversalCoreSkuEvidenceRow
} from "./roomV3UniversalCoreEvidenceManifest"
import { ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS } from "./roomV3UniversalCoreRuntimeFurniture"
import {
  ROOM_V3_FURNITURE_CATEGORIES
} from "./roomV3ProductionPlan"
import {
  ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
} from "./roomV3UniversalCoreInventory"
import { ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID } from "./roomV3UniversalCoreArtifactRegistry"
import type { RoomFurnitureRotation } from "./roomV2.types"
import { UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID } from "@blumi/domain"

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

function createValidRow(
  candidateId: (typeof ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)[number],
  index: number
): RoomV3UniversalCoreSkuEvidenceRow {
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
  const seating = SEAT_CANDIDATE_IDS.has(candidateId)
    ? {
        seatingEvidenceId: `seating-${index}`,
        seatingResult: { contact: "pass", approach: "pass", exit: "pass" } as const
      }
    : {}

  return {
    candidateId,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    scaleSceneEvidenceId: `scale-${index}`,
    perspectiveProfile: ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
    perspectiveEvidenceId: `perspective-${index}`,
    perspectiveResult: {
      cameraAlignment: "pass",
      surfaceContact: "pass",
      avatarScale: "pass",
      depthOcclusion: "pass"
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
    ...seating
  }
}

function getRequiredRotations(
  candidateId: (typeof ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)[number]
): readonly RoomFurnitureRotation[] {
  const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[candidateId]
  const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
  return category?.requiresDirectionalAssets
    ? ["front", "back", "left", "right"]
    : ["front"]
}

function createValidManifest(): RoomV3UniversalCoreEvidenceManifest {
  return {
    manifestVersion: ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    buildIdentity: `git:${"a".repeat(40)}`,
    evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
    evidenceBundleSha256: `sha256:${"b".repeat(64)}`,
    simulatorDevice: "iPhone 17 Pro iOS 26.4 Simulator",
    simulatorViewport: { width: 390, height: 844, orientation: "portrait" },
    rows: ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map(createValidRow)
  }
}

test("accepts a complete immutable evidence row for every canonical Universal Core SKU", () => {
  const validation = validateRoomV3UniversalCoreEvidenceManifest(createValidManifest())

  assert.deepEqual(validation, { isValid: true, issueIds: [] })
})

test("fails closed when a canonical SKU row is missing or duplicated", () => {
  const manifest = createValidManifest()
  const rows = [...manifest.rows.slice(1), manifest.rows[1]]
  const validation = validateRoomV3UniversalCoreEvidenceManifest({ ...manifest, rows })

  assert.equal(validation.isValid, false)
  assert.ok(validation.issueIds.includes("missing_candidate_row:universal_petal_side_table_a"))
  assert.ok(validation.issueIds.includes("duplicate_candidate_row:universal_cloud_loveseat_a"))
})

test("requires seating contact evidence only for planned seat categories", () => {
  const manifest = createValidManifest()
  const rows = manifest.rows.map((row) =>
    row.candidateId === "universal_cloud_loveseat_a"
      ? { ...row, seatingEvidenceId: undefined, seatingResult: undefined }
      : row
  )
  const validation = validateRoomV3UniversalCoreEvidenceManifest({ ...manifest, rows })

  assert.equal(validation.isValid, false)
  assert.ok(validation.issueIds.includes("universal_cloud_loveseat_a:missing_seating_evidence"))
})

test("requires every directional rotation exactly once for directional SKUs", () => {
  const manifest = createValidManifest()
  const rows = manifest.rows.map((row) =>
    row.candidateId === "universal_cloud_loveseat_a"
      ? { ...row, rotationsReviewed: ["front"] as const }
      : row
  )
  const validation = validateRoomV3UniversalCoreEvidenceManifest({ ...manifest, rows })

  assert.equal(validation.isValid, false)
  assert.ok(validation.issueIds.includes("universal_cloud_loveseat_a:invalid_rotation_coverage"))
})

test("requires a locked My Room perspective verdict for every SKU", () => {
  const manifest = createValidManifest()
  const validation = validateRoomV3UniversalCoreEvidenceManifest({
    ...manifest,
    rows: manifest.rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            perspectiveProfile: undefined,
            perspectiveEvidenceId: undefined,
            perspectiveResult: undefined
          }
        : row
    )
  })

  assert.equal(validation.isValid, false)
  assert.ok(
    validation.issueIds.includes(
      "universal_petal_side_table_a:missing_perspective_evidence"
    )
  )
  assert.ok(
    validation.issueIds.includes(
      "universal_petal_side_table_a:invalid_perspective_result"
    )
  )
})

test("requires candidate-bound native My Room evidence for each required rotation", () => {
  const manifest = createValidManifest()
  const validation = validateRoomV3UniversalCoreEvidenceManifest({
    ...manifest,
    rows: manifest.rows.map((row) =>
      row.candidateId === "universal_cloud_loveseat_a"
        ? {
            ...row,
            simulatorScreenshotPathByRotation: {
              front:
                "docs/room-v3-qa/universal-core/universal_cloud_loveseat_a_front.png"
            }
          }
        : row
    )
  })

  assert.equal(validation.isValid, false)
  assert.ok(
    validation.issueIds.includes(
      "universal_cloud_loveseat_a:invalid_rotation_simulator_evidence"
    )
  )
})

test("rejects duplicate rotation evidence even when all four names appear", () => {
  const manifest = createValidManifest()
  const rows = manifest.rows.map((row) =>
    row.candidateId === "universal_cloud_loveseat_a"
      ? { ...row, rotationsReviewed: ["front", "back", "left", "left"] as const }
      : row
  )
  const validation = validateRoomV3UniversalCoreEvidenceManifest({ ...manifest, rows })

  assert.equal(validation.isValid, false)
  assert.ok(validation.issueIds.includes("universal_cloud_loveseat_a:invalid_rotation_coverage"))
})

test("fails closed for malformed viewport and screenshot provenance without throwing", () => {
  const manifest = createValidManifest()
  assert.doesNotThrow(() =>
    validateRoomV3UniversalCoreEvidenceManifest({
      ...manifest,
      simulatorViewport: null
    } as unknown as RoomV3UniversalCoreEvidenceManifest)
  )
  const invalidViewport = validateRoomV3UniversalCoreEvidenceManifest({
    ...manifest,
    simulatorViewport: { width: 375, height: 812, orientation: "portrait" }
  })
  assert.equal(invalidViewport.isValid, false)
  assert.ok(invalidViewport.issueIds.includes("invalid_simulator_viewport"))

  const malformedScreenshot = validateRoomV3UniversalCoreEvidenceManifest({
    ...manifest,
    rows: manifest.rows.map((row, index) =>
      index === 0 ? { ...row, simulatorScreenshotPaths: null } : row
    )
  } as unknown as RoomV3UniversalCoreEvidenceManifest)
  assert.equal(malformedScreenshot.isValid, false)
  assert.ok(malformedScreenshot.issueIds.includes("universal_petal_side_table_a:invalid_runtime_result"))
})

test("accepts candidate-bound rotation JPEG evidence while rejecting traversal and another SKU's capture", () => {
  const manifest = createValidManifest()
  const currentPath =
    "docs/room-v3-qa/2026-07-26-current-myroom-flow/rotation-native/universal_table_lamp_a_front_placed_current_editor.jpeg"
  const currentEvidence = {
    ...manifest,
    rows: manifest.rows.map((row) =>
      row.candidateId === "universal_table_lamp_a"
        ? {
            ...row,
            simulatorScreenshotPaths: [currentPath],
            simulatorScreenshotPathByRotation: { front: currentPath },
            simulatorScreenshotSha256ByPath: {
              [currentPath]: `sha256:${"c".repeat(64)}`
            }
          }
        : row
    )
  }
  assert.deepEqual(
    validateRoomV3UniversalCoreEvidenceManifest(currentEvidence),
    { isValid: true, issueIds: [] }
  )

  for (const simulatorScreenshotPaths of [
    [
      "docs/room-v3-qa/../../private/universal_table_lamp_a_front_placed_current_editor.jpeg"
    ],
    [
      "docs/room-v3-qa/2026-07-26-current-myroom-flow/rotation-native/universal_cloud_loveseat_a_front_placed_current_editor.jpeg"
    ]
  ]) {
    const validation = validateRoomV3UniversalCoreEvidenceManifest({
      ...manifest,
      rows: manifest.rows.map((row) =>
        row.candidateId === "universal_table_lamp_a"
          ? { ...row, simulatorScreenshotPaths }
          : row
      )
    })
    assert.equal(validation.isValid, false)
    assert.ok(
      validation.issueIds.includes(
        "universal_table_lamp_a:invalid_runtime_result"
      )
    )
  }
})

test("verifies every rotation-bound Simulator evidence file and its immutable bundle digest", async () => {
  const baseManifest = createValidManifest()
  const manifest: RoomV3UniversalCoreEvidenceManifest = {
    ...baseManifest,
    evidenceBundleSha256: sha256(
      createRoomV3UniversalCoreEvidenceBundlePayload(baseManifest)
    )
  }
  const validation = await verifyRoomV3UniversalCoreEvidenceFiles(manifest, {
    async inspect(repoRelativePath) {
      const row = manifest.rows.find((candidate) =>
        candidate.simulatorScreenshotPaths.includes(repoRelativePath)
      )
      return {
        isRegularFile: true,
        sha256:
          row?.simulatorScreenshotSha256ByPath[repoRelativePath] ??
          `sha256:${"0".repeat(64)}`
      }
    },
    async sha256Text(value) {
      return sha256(value)
    }
  })

  assert.deepEqual(validation, { isValid: true, issueIds: [] })
})

test("file verification rejects missing files and forged hashes", async () => {
  const manifest = createValidManifest()
  const missing = await verifyRoomV3UniversalCoreEvidenceFiles(manifest, {
    async inspect() {
      return null
    },
    async sha256Text() {
      return manifest.evidenceBundleSha256
    }
  })

  assert.equal(missing.isValid, false)
  assert.ok(
    missing.issueIds.includes(
      "universal_petal_side_table_a:missing_evidence_file"
    )
  )

  const firstRow = manifest.rows[0]
  const forged = await verifyRoomV3UniversalCoreEvidenceFiles(manifest, {
    async inspect(repoRelativePath) {
      return {
        isRegularFile: true,
        sha256:
          repoRelativePath === firstRow.simulatorScreenshotPaths[0]
            ? `sha256:${"f".repeat(64)}`
            : manifest.rows.find((row) =>
                row.simulatorScreenshotPaths.includes(repoRelativePath)
              )?.simulatorScreenshotSha256ByPath[repoRelativePath] ??
              `sha256:${"0".repeat(64)}`
      }
    },
    async sha256Text() {
      return manifest.evidenceBundleSha256
    }
  })
  assert.equal(forged.isValid, false)
  assert.ok(
    forged.issueIds.includes(
      "universal_petal_side_table_a:evidence_sha256_mismatch"
    )
  )
})

test("file verification fails closed when the inspector or bundle digest computation throws", async () => {
  const manifest = createValidManifest()

  const inspectionFailure = await verifyRoomV3UniversalCoreEvidenceFiles(
    manifest,
    {
      async inspect(repoRelativePath) {
        if (repoRelativePath === manifest.rows[0]?.simulatorScreenshotPaths[0]) {
          throw new Error("disk read failed")
        }
        return {
          isRegularFile: true,
          sha256:
            manifest.rows.find((row) =>
              row.simulatorScreenshotPaths.includes(repoRelativePath)
            )?.simulatorScreenshotSha256ByPath[repoRelativePath] ??
            `sha256:${"0".repeat(64)}`
        }
      },
      async sha256Text() {
        return manifest.evidenceBundleSha256
      }
    }
  )

  assert.equal(inspectionFailure.isValid, false)
  assert.ok(
    inspectionFailure.issueIds.includes(
      "universal_petal_side_table_a:evidence_file_inspection_failed"
    )
  )

  const bundleFailure = await verifyRoomV3UniversalCoreEvidenceFiles(manifest, {
    async inspect(repoRelativePath) {
      return {
        isRegularFile: true,
        sha256:
          manifest.rows.find((row) =>
            row.simulatorScreenshotPaths.includes(repoRelativePath)
          )?.simulatorScreenshotSha256ByPath[repoRelativePath] ??
          `sha256:${"0".repeat(64)}`
      }
    },
    async sha256Text() {
      throw new Error("bundle digest failed")
    }
  })

  assert.equal(bundleFailure.isValid, false)
  assert.ok(
    bundleFailure.issueIds.includes(
      "evidence_bundle_sha256_verification_failed"
    )
  )
})

test("fails closed without throwing for malformed candidate, rotation, and screenshot values", () => {
  const manifest = createValidManifest()
  for (const malformedRow of [
    { ...manifest.rows[0], candidateId: undefined },
    { ...manifest.rows[0], rotationsReviewed: null },
    { ...manifest.rows[0], simulatorScreenshotPaths: [null] }
  ]) {
    assert.doesNotThrow(() =>
      validateRoomV3UniversalCoreEvidenceManifest({
        ...manifest,
        rows: [malformedRow, ...manifest.rows.slice(1)]
      } as unknown as RoomV3UniversalCoreEvidenceManifest)
    )
    assert.equal(
      validateRoomV3UniversalCoreEvidenceManifest({
        ...manifest,
        rows: [malformedRow, ...manifest.rows.slice(1)]
      } as unknown as RoomV3UniversalCoreEvidenceManifest).isValid,
      false
    )
  }
})

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}
