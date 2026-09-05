import type { RoomFurnitureRotation } from "./roomV2.types"
import { UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID } from "@blumi/domain"
import { ROOM_V3_FURNITURE_CATEGORIES } from "./roomV3ProductionPlan"
import { ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID } from "./roomV3UniversalCoreInventory"
import { ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS } from "./roomV3UniversalCoreRuntimeFurniture"

export const ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION =
  "room-v3-universal-core-evidence-manifest-v3" as const

export const ROOM_V3_LOCKED_PERSPECTIVE_PROFILE =
  "my-room-locked-2.5d-v1" as const

export interface RoomV3UniversalCoreEvidenceViewport {
  width: number
  height: number
  orientation: "portrait"
}

export interface RoomV3UniversalCoreSeatingEvidenceResult {
  contact: "pass"
  approach: "pass"
  exit: "pass"
}

export interface RoomV3UniversalCorePerspectiveEvidenceResult {
  cameraAlignment: "pass"
  surfaceContact: "pass"
  avatarScale: "pass"
  depthOcclusion: "pass"
}

export interface RoomV3UniversalCoreSkuEvidenceRow {
  candidateId: (typeof ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)[number]
  artifactManifestId: string
  scaleSceneEvidenceId: string
  perspectiveProfile: typeof ROOM_V3_LOCKED_PERSPECTIVE_PROFILE
  perspectiveEvidenceId: string
  perspectiveResult: RoomV3UniversalCorePerspectiveEvidenceResult
  depthLaneEvidenceId: string
  collisionEvidenceId: string
  persistenceEvidenceId: string
  simulatorEvidenceId: string
  independentReviewId: string
  rotationsReviewed: readonly RoomFurnitureRotation[]
  placementAction: string
  collisionResult: "pass"
  persistenceResult: "pass"
  seatingEvidenceId?: string
  seatingResult?: RoomV3UniversalCoreSeatingEvidenceResult
  simulatorScreenshotPaths: readonly string[]
  simulatorScreenshotPathByRotation: Readonly<
    Partial<Record<RoomFurnitureRotation, string>>
  >
  simulatorScreenshotSha256ByPath: Readonly<Record<string, string>>
}

export interface RoomV3UniversalCoreEvidenceManifest {
  manifestVersion: typeof ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION
  artifactManifestId: string
  buildIdentity: string
  evidenceVerifierId: typeof UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID
  evidenceBundleSha256: string
  simulatorDevice: string
  simulatorViewport: RoomV3UniversalCoreEvidenceViewport
  rows: readonly RoomV3UniversalCoreSkuEvidenceRow[]
}

export interface RoomV3UniversalCoreEvidenceManifestValidation {
  isValid: boolean
  issueIds: string[]
}

export interface RoomV3UniversalCoreEvidenceFileInspection {
  isRegularFile: boolean
  sha256: string
}

export interface RoomV3UniversalCoreEvidenceFileInspector {
  inspect(
    repoRelativePath: string
  ): Promise<RoomV3UniversalCoreEvidenceFileInspection | null>
  sha256Text(value: string): Promise<string>
}

export const ROOM_V3_UNIVERSAL_CORE_SIMULATOR_VIEWPORT = {
  width: 390,
  height: 844,
  orientation: "portrait"
} as const

const REQUIRED_ROTATIONS = new Set<RoomFurnitureRotation>([
  "front",
  "back",
  "left",
  "right"
])

export function validateRoomV3UniversalCoreEvidenceManifest(
  manifest: unknown
): RoomV3UniversalCoreEvidenceManifestValidation {
  const issueIds = new Set<string>()
  if (!manifest) return { isValid: false, issueIds: ["missing_manifest"] }
  if (!isRecord(manifest)) {
    return { isValid: false, issueIds: ["invalid_manifest"] }
  }

  if (manifest.manifestVersion !== ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION) {
    issueIds.add("invalid_manifest_version")
  }
  if (!hasText(manifest.artifactManifestId)) issueIds.add("missing_artifact_manifest_id")
  if (!isImmutableGitBuildIdentity(manifest.buildIdentity)) {
    issueIds.add("invalid_build_identity")
  }
  if (manifest.evidenceVerifierId !== UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID) {
    issueIds.add("invalid_evidence_verifier")
  }
  if (!isSha256Digest(manifest.evidenceBundleSha256)) {
    issueIds.add("invalid_evidence_bundle_sha256")
  }
  if (!hasText(manifest.simulatorDevice)) issueIds.add("missing_simulator_device")
  if (
    !isRecord(manifest.simulatorViewport) ||
    manifest.simulatorViewport.width !== ROOM_V3_UNIVERSAL_CORE_SIMULATOR_VIEWPORT.width ||
    manifest.simulatorViewport.height !== ROOM_V3_UNIVERSAL_CORE_SIMULATOR_VIEWPORT.height ||
    manifest.simulatorViewport.orientation !== ROOM_V3_UNIVERSAL_CORE_SIMULATOR_VIEWPORT.orientation
  ) {
    issueIds.add("invalid_simulator_viewport")
  }

  const expectedIds = new Set<string>(ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)
  const seenIds = new Set<string>()
  if (!Array.isArray(manifest.rows)) {
    issueIds.add("invalid_rows")
  }
  for (const row of Array.isArray(manifest.rows) ? manifest.rows : []) {
    if (!isRecord(row)) {
      issueIds.add("invalid_row")
      continue
    }
    const candidateId = hasText(row.candidateId) ? row.candidateId.trim() : ""
    if (!candidateId) {
      issueIds.add("invalid_candidate_row")
    } else {
      if (seenIds.has(candidateId)) {
        issueIds.add(`duplicate_candidate_row:${candidateId}`)
      }
      seenIds.add(candidateId)
      if (!expectedIds.has(candidateId)) {
        issueIds.add(`unexpected_candidate_row:${candidateId}`)
      }
    }

    validateEvidenceRow(row, candidateId, manifest.artifactManifestId, issueIds)
  }

  for (const id of expectedIds) {
    if (!seenIds.has(id)) issueIds.add(`missing_candidate_row:${id}`)
  }

  return { isValid: issueIds.size === 0, issueIds: [...issueIds] }
}

export async function verifyRoomV3UniversalCoreEvidenceFiles(
  manifest: unknown,
  inspector: RoomV3UniversalCoreEvidenceFileInspector
): Promise<RoomV3UniversalCoreEvidenceManifestValidation> {
  const manifestValidation = validateRoomV3UniversalCoreEvidenceManifest(manifest)
  if (!manifestValidation.isValid || !isEvidenceManifest(manifest)) {
    return manifestValidation
  }

  const issueIds = new Set<string>()
  for (const row of manifest.rows) {
    for (const repoRelativePath of row.simulatorScreenshotPaths) {
      let inspection: RoomV3UniversalCoreEvidenceFileInspection | null
      try {
        inspection = await inspector.inspect(repoRelativePath)
      } catch {
        issueIds.add(`${row.candidateId}:evidence_file_inspection_failed`)
        continue
      }
      if (!inspection) {
        issueIds.add(`${row.candidateId}:missing_evidence_file`)
        continue
      }
      if (!inspection.isRegularFile) {
        issueIds.add(`${row.candidateId}:evidence_not_regular_file`)
      }
      if (
        !isSha256Digest(inspection.sha256) ||
        inspection.sha256 !== row.simulatorScreenshotSha256ByPath[repoRelativePath]
      ) {
        issueIds.add(`${row.candidateId}:evidence_sha256_mismatch`)
      }
    }
  }

  let computedBundleSha256: string
  try {
    computedBundleSha256 = await inspector.sha256Text(
      createRoomV3UniversalCoreEvidenceBundlePayload(manifest)
    )
  } catch {
    issueIds.add("evidence_bundle_sha256_verification_failed")
    return { isValid: false, issueIds: [...issueIds] }
  }
  if (
    !isSha256Digest(computedBundleSha256) ||
    computedBundleSha256 !== manifest.evidenceBundleSha256
  ) {
    issueIds.add("evidence_bundle_sha256_mismatch")
  }

  return { isValid: issueIds.size === 0, issueIds: [...issueIds] }
}

export function createRoomV3UniversalCoreEvidenceBundlePayload(
  manifest: RoomV3UniversalCoreEvidenceManifest
): string {
  const rows = [...manifest.rows]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((row) => ({
      candidateId: row.candidateId,
      artifactManifestId: row.artifactManifestId,
      scaleSceneEvidenceId: row.scaleSceneEvidenceId,
      perspectiveProfile: row.perspectiveProfile,
      perspectiveEvidenceId: row.perspectiveEvidenceId,
      perspectiveResult: row.perspectiveResult,
      depthLaneEvidenceId: row.depthLaneEvidenceId,
      collisionEvidenceId: row.collisionEvidenceId,
      persistenceEvidenceId: row.persistenceEvidenceId,
      simulatorEvidenceId: row.simulatorEvidenceId,
      independentReviewId: row.independentReviewId,
      rotationsReviewed: [...row.rotationsReviewed],
      placementAction: row.placementAction,
      collisionResult: row.collisionResult,
      persistenceResult: row.persistenceResult,
      seatingEvidenceId: row.seatingEvidenceId ?? null,
      seatingResult: row.seatingResult ?? null,
      simulatorScreenshotsByRotation: Object.entries(
        row.simulatorScreenshotPathByRotation
      )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([rotation, path]) => ({ rotation, path })),
      simulatorScreenshots: [...row.simulatorScreenshotPaths]
        .sort()
        .map((path) => ({
          path,
          sha256: row.simulatorScreenshotSha256ByPath[path]
        }))
    }))

  return JSON.stringify({
    manifestVersion: manifest.manifestVersion,
    artifactManifestId: manifest.artifactManifestId,
    buildIdentity: manifest.buildIdentity,
    evidenceVerifierId: manifest.evidenceVerifierId,
    simulatorDevice: manifest.simulatorDevice,
    simulatorViewport: manifest.simulatorViewport,
    rows
  })
}

function validateEvidenceRow(
  row: Record<string, unknown>,
  candidateId: string,
  artifactManifestId: unknown,
  issueIds: Set<string>
) {
  const prefix = candidateId || "invalid_candidate_row"
  if (row.artifactManifestId !== artifactManifestId) {
    issueIds.add(`${prefix}:artifact_manifest_mismatch`)
  }

  for (const [field, value] of [
    ["scale_scene_evidence", row.scaleSceneEvidenceId],
    ["perspective_evidence", row.perspectiveEvidenceId],
    ["depth_lane_evidence", row.depthLaneEvidenceId],
    ["collision_evidence", row.collisionEvidenceId],
    ["persistence_evidence", row.persistenceEvidenceId],
    ["simulator_evidence", row.simulatorEvidenceId],
    ["independent_review", row.independentReviewId],
    ["placement_action", row.placementAction]
  ] as const) {
    if (!hasText(value)) issueIds.add(`${prefix}:missing_${field}`)
  }


  const perspectiveResult = isRecord(row.perspectiveResult)
    ? row.perspectiveResult
    : null
  if (row.perspectiveProfile !== ROOM_V3_LOCKED_PERSPECTIVE_PROFILE) {
    issueIds.add(`${prefix}:invalid_perspective_profile`)
  }
  if (
    perspectiveResult?.cameraAlignment !== "pass" ||
    perspectiveResult?.surfaceContact !== "pass" ||
    perspectiveResult?.avatarScale !== "pass" ||
    perspectiveResult?.depthOcclusion !== "pass"
  ) {
    issueIds.add(`${prefix}:invalid_perspective_result`)
  }

  if (
    row.collisionResult !== "pass" ||
    row.persistenceResult !== "pass" ||
    !Array.isArray(row.simulatorScreenshotPaths) ||
    row.simulatorScreenshotPaths.length === 0 ||
    row.simulatorScreenshotPaths.some(
      (path) => !isCandidateSimulatorEvidencePath(path, candidateId)
    )
  ) {
    issueIds.add(`${prefix}:invalid_runtime_result`)
  }
  const screenshotPaths = Array.isArray(row.simulatorScreenshotPaths)
    ? row.simulatorScreenshotPaths.filter(hasText)
    : []
  const screenshotHashes = isRecord(row.simulatorScreenshotSha256ByPath)
    ? row.simulatorScreenshotSha256ByPath
    : null
  if (
    !screenshotHashes ||
    Object.keys(screenshotHashes).length !== screenshotPaths.length ||
    screenshotPaths.some(
      (path) => !isSha256Digest(screenshotHashes[path])
    ) ||
    Object.keys(screenshotHashes ?? {}).some(
      (path) => !screenshotPaths.includes(path)
    )
  ) {
    issueIds.add(`${prefix}:invalid_screenshot_hashes`)
  }

  const categoryId = candidateId
    ? ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
        candidateId as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
      ]
    : undefined
  const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
  const requiredRotations = category?.requiresDirectionalAssets
    ? REQUIRED_ROTATIONS
    : new Set<RoomFurnitureRotation>(["front"])
  const reviewedRotations = Array.isArray(row.rotationsReviewed)
    ? row.rotationsReviewed
    : []
  if (
    reviewedRotations.length !== requiredRotations.size ||
    reviewedRotations.some(
      (rotation) =>
        typeof rotation !== "string" ||
        !requiredRotations.has(rotation as RoomFurnitureRotation)
    ) ||
    new Set(reviewedRotations).size !== reviewedRotations.length
  ) {
    issueIds.add(`${prefix}:invalid_rotation_coverage`)
  }

  const screenshotPathByRotation = isRecord(
    row.simulatorScreenshotPathByRotation
  )
    ? row.simulatorScreenshotPathByRotation
    : null
  const rotationEvidenceEntries = screenshotPathByRotation
    ? Object.entries(screenshotPathByRotation)
    : []
  const rotationEvidencePaths = rotationEvidenceEntries
    .map(([, value]) => value)
    .filter(hasText)
  const screenshotPathSet = new Set(screenshotPaths)
  if (
    !screenshotPathByRotation ||
    rotationEvidenceEntries.length !== requiredRotations.size ||
    rotationEvidencePaths.length !== requiredRotations.size ||
    new Set(rotationEvidencePaths).size !== rotationEvidencePaths.length ||
    rotationEvidenceEntries.some(
      ([rotation, path]) =>
        !requiredRotations.has(rotation as RoomFurnitureRotation) ||
        !isCandidateRotationSimulatorEvidencePath(
          path,
          candidateId,
          rotation as RoomFurnitureRotation
        )
    ) ||
    screenshotPathSet.size !== rotationEvidencePaths.length ||
    rotationEvidencePaths.some((path) => !screenshotPathSet.has(path))
  ) {
    issueIds.add(`${prefix}:invalid_rotation_simulator_evidence`)
  }

  if (category?.interactionType === "seat") {
    if (!hasText(row.seatingEvidenceId)) {
      issueIds.add(`${prefix}:missing_seating_evidence`)
    }
    const seatingResult = isRecord(row.seatingResult) ? row.seatingResult : null
    if (
      seatingResult?.contact !== "pass" ||
      seatingResult?.approach !== "pass" ||
      seatingResult?.exit !== "pass"
    ) {
      issueIds.add(`${prefix}:invalid_seating_result`)
    }
  }
}

function isCandidateRotationSimulatorEvidencePath(
  value: unknown,
  candidateId: unknown,
  rotation: RoomFurnitureRotation
): value is string {
  if (!isCandidateSimulatorEvidencePath(value, candidateId)) return false
  const fileName = value.slice(value.lastIndexOf("/") + 1).toLowerCase()
  const stem = fileName.replace(/\.(png|jpe?g)$/, "")
  const expectedPrefix = `${String(candidateId).trim().toLowerCase()}_${rotation}`
  return stem === expectedPrefix || stem.startsWith(`${expectedPrefix}_`)
}

function isCandidateSimulatorEvidencePath(
  value: unknown,
  candidateId: unknown
): value is string {
  if (!hasText(value) || !hasText(candidateId)) return false
  const normalized = value.trim()
  if (
    !normalized.startsWith("docs/room-v3-qa/") ||
    normalized.includes("\\") ||
    normalized.split("/").includes("..")
  ) {
    return false
  }

  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase()
  const extensionMatch = fileName.match(/\.(png|jpe?g)$/)
  if (!extensionMatch) return false
  const stem = fileName.slice(0, -extensionMatch[0].length)
  const expectedStem = candidateId.trim().toLowerCase()
  return stem === expectedStem || stem.startsWith(`${expectedStem}_`)
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isImmutableGitBuildIdentity(value: unknown): value is string {
  return typeof value === "string" && /^git:[0-9a-f]{40}$/.test(value)
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value)
}

function isEvidenceManifest(
  value: unknown
): value is RoomV3UniversalCoreEvidenceManifest {
  return isRecord(value) && Array.isArray(value.rows)
}
