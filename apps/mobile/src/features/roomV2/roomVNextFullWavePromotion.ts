import type { FurnitureItem } from "./roomV2.types"
import {
  createRoomVNextFullWaveCuteCandidateCatalog,
  ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS,
  ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_ARTIFACT_FINGERPRINT
} from "./roomVNextFullWaveCatalog"

export const ROOM_VNEXT_FULL_WAVE_PROMOTION_SCHEMA_VERSION =
  "room-vnext-full-wave-promotion-v1" as const
export const ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_BUILD_ID =
  "full-wave-v3-cute45-v21" as const
export const ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_MANIFEST_ID =
  "full-wave-v3-cute45-final-v3" as const
export const ROOM_VNEXT_FULL_WAVE_EVIDENCE_VERIFIER_ID =
  "blumi-room-vnext-full-wave-evidence-verifier-v1" as const

export interface RoomVNextFullWavePromotionRecord {
  schemaVersion: typeof ROOM_VNEXT_FULL_WAVE_PROMOTION_SCHEMA_VERSION
  candidateBuildId: string
  candidateManifestId: string
  candidateArtifactFingerprint: string
  evidenceManifestId: string
  simulatorEvidenceId: string
  independentReviewerEvidenceId: string
  collisionEvidenceId: string
  seatingEvidenceId: string
  persistenceEvidenceId: string
  buildIdentity: string
  evidenceBundleSha256: string
  finalUserApprovalId: string
  approvedItemIds: readonly string[]
}

export interface RoomVNextFullWavePromotionTrust {
  evidenceVerifierId: string
  buildIdentity: string
  evidenceBundleSha256: string
  finalUserApprovalId: string
}

/** Empty until the final user approval is recorded against an immutable build. */
export const ROOM_VNEXT_FULL_WAVE_PROMOTION_RECORDS:
  readonly RoomVNextFullWavePromotionRecord[] = []

/** Null keeps the production resolver fail-closed by default. */
export const ROOM_VNEXT_FULL_WAVE_TRUSTED_EVIDENCE_APPROVAL:
  RoomVNextFullWavePromotionTrust | null = null

export function resolveApprovedRoomVNextFullWaveFurniture(
  record?: RoomVNextFullWavePromotionRecord | null,
  trust: RoomVNextFullWavePromotionTrust | null =
    ROOM_VNEXT_FULL_WAVE_TRUSTED_EVIDENCE_APPROVAL
): FurnitureItem[] {
  if (!record || !hasCompletePromotionEvidence(record, trust)) return []

  const furniture = createRoomVNextFullWaveCuteCandidateCatalog()
  if (furniture.length !== ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.length) return []

  return furniture.map((item) => ({
    ...item,
    sourceStatus: "approved",
    qaStatus: "pass",
    ownedByDefault: false,
    locked: false
  }))
}

function hasCompletePromotionEvidence(
  record: RoomVNextFullWavePromotionRecord,
  trust: RoomVNextFullWavePromotionTrust | null
): boolean {
  if (
    record.schemaVersion !== ROOM_VNEXT_FULL_WAVE_PROMOTION_SCHEMA_VERSION ||
    record.candidateBuildId !== ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_BUILD_ID ||
    record.candidateManifestId !== ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_MANIFEST_ID ||
    record.candidateArtifactFingerprint !==
      ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_ARTIFACT_FINGERPRINT ||
    !trust ||
    trust.evidenceVerifierId !== ROOM_VNEXT_FULL_WAVE_EVIDENCE_VERIFIER_ID ||
    trust.buildIdentity !== record.buildIdentity ||
    trust.evidenceBundleSha256 !== record.evidenceBundleSha256 ||
    trust.finalUserApprovalId !== record.finalUserApprovalId
  ) {
    return false
  }

  const globalEvidence = [
    record.evidenceManifestId,
    record.simulatorEvidenceId,
    record.independentReviewerEvidenceId,
    record.collisionEvidenceId,
    record.seatingEvidenceId,
    record.persistenceEvidenceId,
    record.buildIdentity,
    record.evidenceBundleSha256,
    record.finalUserApprovalId
  ]
  if (globalEvidence.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    return false
  }

  return (
    record.approvedItemIds.length === ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.length &&
    record.approvedItemIds.every(
      (itemId, index) => itemId === ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS[index]
    )
  )
}
