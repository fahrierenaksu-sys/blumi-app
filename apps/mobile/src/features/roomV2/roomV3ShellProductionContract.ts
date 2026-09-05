import {
  ROOM_V3_CANONICAL_SHELL_LANGUAGE,
  ROOM_V3_HOME_COLLECTIONS
} from "./roomV3ProductionPlan"
import {
  ROOM_V3_ACTIVE_MASTER_ASSET_SHA256,
  isTrustedRoomV3ShellArtifactReceipt,
  type RoomV3ShellArtifactReceipt
} from "./roomV3ShellArtifactReceipt"

export { ROOM_V3_CANONICAL_SHELL_LANGUAGE } from "./roomV3ProductionPlan"

export interface RoomV3ApprovedMasterGeometry {
  id: string
  sourceAssetKey: string
  canvasSize: { width: number; height: number }
  approvalEvidenceId: string
}

// The user-approved Room V2 shell is the geometric master. New art may vary
// doors, windows, parquet, trim, and palette, but never the camera, canvas,
// floor silhouette, avatar scale, or placement geometry.
export const ROOM_V3_ACTIVE_MASTER_GEOMETRY: RoomV3ApprovedMasterGeometry = {
  id: "room_v2_shell_blumi_world_v1",
  sourceAssetKey: "room_v2_shell_blumi_world_v1",
  canvasSize: { width: 1254, height: 714 },
  approvalEvidenceId: "room-v2-source-locked-user-direction"
}

export interface RoomV3ShellProductionBrief {
  collectionId: string
  collectionName: string
  geometryStatus: "source_locked"
  canvasSize: { width: number; height: number }
  requiredVisualLanguage: typeof ROOM_V3_CANONICAL_SHELL_LANGUAGE
  palette: readonly string[]
  materialDirection: string
}

export interface RoomV3ShellCandidateInput {
  masterGeometryId: string
  canvasSize: { width: number; height: number }
  assetSha256: string
  sourceProvenanceId: string
  geometryOverlayEvidenceId: string
  simulatorEvidenceId: string
  producerEvidenceId: string
  independentReviewerEvidenceId: string
  visualLanguageTags: readonly string[]
}

export type RoomV3ShellCandidateIssueId =
  | "missing_approved_master_geometry"
  | "invalid_master_geometry"
  | "invalid_canvas_size"
  | "missing_asset_provenance"
  | "missing_geometry_overlay_evidence"
  | "missing_simulator_evidence"
  | "missing_producer_evidence"
  | "missing_independent_reviewer_evidence"
  | "missing_canonical_visual_language"
  | "artifact_verifier_required"

export interface RoomV3ShellCandidateValidation {
  isValid: boolean
  issueIds: RoomV3ShellCandidateIssueId[]
}

export interface RoomV3ShellVerifiedArtifactBinding {
  shellId: string
  assetKey: string
  receipt: RoomV3ShellArtifactReceipt
}

export function createRoomV3ShellProductionBriefs(): RoomV3ShellProductionBrief[] {
  return ROOM_V3_HOME_COLLECTIONS.map((collection) => ({
    collectionId: collection.id,
    collectionName: collection.name,
    geometryStatus: "source_locked",
    canvasSize: { ...ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize },
    requiredVisualLanguage: collection.requiredVisualLanguage,
    palette: [...collection.palette],
    materialDirection: collection.materialDirection
  }))
}

export function validateRoomV3ShellCandidate(
  candidate: RoomV3ShellCandidateInput,
  masterGeometry: RoomV3ApprovedMasterGeometry | null = ROOM_V3_ACTIVE_MASTER_GEOMETRY,
  verifiedArtifact: RoomV3ShellVerifiedArtifactBinding | null = null
): RoomV3ShellCandidateValidation {
  if (!masterGeometry) {
    return {
      isValid: false,
      issueIds: ["missing_approved_master_geometry"]
    }
  }

  const issueIds: RoomV3ShellCandidateIssueId[] = []
  const { width, height } = candidate.canvasSize

  if (
    !isSourceLockedMasterGeometry(masterGeometry) ||
    candidate.masterGeometryId !== ROOM_V3_ACTIVE_MASTER_GEOMETRY.id
  ) {
    issueIds.push("invalid_master_geometry")
  }

  if (
    width !== ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.width ||
    height !== ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.height
  ) {
    issueIds.push("invalid_canvas_size")
  }

  if (!isEvidenceId(candidate.assetSha256) || !isEvidenceId(candidate.sourceProvenanceId)) {
    issueIds.push("missing_asset_provenance")
  }

  if (!isEvidenceId(candidate.geometryOverlayEvidenceId)) {
    issueIds.push("missing_geometry_overlay_evidence")
  }

  if (!isEvidenceId(candidate.simulatorEvidenceId)) {
    issueIds.push("missing_simulator_evidence")
  }

  if (!isEvidenceId(candidate.producerEvidenceId)) {
    issueIds.push("missing_producer_evidence")
  }

  if (!isEvidenceId(candidate.independentReviewerEvidenceId)) {
    issueIds.push("missing_independent_reviewer_evidence")
  }

  if (
    !ROOM_V3_CANONICAL_SHELL_LANGUAGE.every((tag) =>
      candidate.visualLanguageTags.includes(tag)
    )
  ) {
    issueIds.push("missing_canonical_visual_language")
  }

  // Metadata is never proof of visual QA or provenance. The receipt is valid
  // only when the build-time verifier bound the exact asset key, content hash,
  // evidence IDs, locked master, and immutable build identity together.
  if (!hasMatchingVerifiedArtifact(candidate, verifiedArtifact)) {
    issueIds.push("artifact_verifier_required")
  }

  return {
    isValid: issueIds.length === 0,
    issueIds
  }
}

function hasMatchingVerifiedArtifact(
  candidate: RoomV3ShellCandidateInput,
  verifiedArtifact: RoomV3ShellVerifiedArtifactBinding | null
): boolean {
  if (
    !verifiedArtifact ||
    !isTrustedRoomV3ShellArtifactReceipt(verifiedArtifact.receipt) ||
    verifiedArtifact.receipt.masterGeometryId !== ROOM_V3_ACTIVE_MASTER_GEOMETRY.id ||
    verifiedArtifact.receipt.masterAssetSha256 !== ROOM_V3_ACTIVE_MASTER_ASSET_SHA256
  ) {
    return false
  }

  const entry = verifiedArtifact.receipt.approvedShells.find(
    (candidateEntry) => candidateEntry.shellId === verifiedArtifact.shellId
  )
  return Boolean(
    entry &&
    entry.assetKey === verifiedArtifact.assetKey &&
    entry.assetSha256 === `sha256:${candidate.assetSha256}` &&
    entry.sourceProvenanceId === candidate.sourceProvenanceId &&
    entry.geometryOverlayEvidenceId === candidate.geometryOverlayEvidenceId &&
    entry.simulatorEvidenceId === candidate.simulatorEvidenceId &&
    entry.producerEvidenceId === candidate.producerEvidenceId &&
    entry.independentReviewerEvidenceId ===
      candidate.independentReviewerEvidenceId
  )
}

function isSourceLockedMasterGeometry(
  masterGeometry: RoomV3ApprovedMasterGeometry
): boolean {
  return (
    masterGeometry.id === ROOM_V3_ACTIVE_MASTER_GEOMETRY.id &&
    masterGeometry.sourceAssetKey === ROOM_V3_ACTIVE_MASTER_GEOMETRY.sourceAssetKey &&
    masterGeometry.canvasSize.width === ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.width &&
    masterGeometry.canvasSize.height === ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.height &&
    masterGeometry.approvalEvidenceId === ROOM_V3_ACTIVE_MASTER_GEOMETRY.approvalEvidenceId
  )
}

function isEvidenceId(value: string): boolean {
  return value.trim().length > 0
}
