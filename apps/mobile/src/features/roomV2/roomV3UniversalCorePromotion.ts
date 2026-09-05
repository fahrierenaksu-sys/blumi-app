import type { FurnitureItem } from "./roomV2.types"
import {
  UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
  resolvePromotedUniversalCoreRoomEconomyItems,
  type UniversalCoreRoomPromotionRecord
} from "@blumi/domain"
import {
  createRoomV3UniversalCoreRuntimeFurniture,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreTrustedArtifactRegistry
} from "./roomV3UniversalCoreRuntimeFurniture"
import {
  validateRoomV3UniversalCoreEvidenceManifest,
  type RoomV3UniversalCoreEvidenceManifest
} from "./roomV3UniversalCoreEvidenceManifest"

export interface RoomV3UniversalCorePromotionRecord {
  artifactRegistry: RoomV3UniversalCoreTrustedArtifactRegistry
  evidenceManifestId: string
  simulatorEvidenceId: string
  independentReviewerEvidenceId: string
  collisionEvidenceId: string
  seatingEvidenceId: string
  persistenceEvidenceId: string
  skuEvidenceManifest: RoomV3UniversalCoreEvidenceManifest
  economyPromotion: UniversalCoreRoomPromotionRecord
}

export interface RoomV3UniversalCorePromotionTrust {
  buildIdentity: string
  evidenceVerifierId: string
  evidenceBundleSha256: string
}

/**
 * Empty by design until the complete 45-row SKU evidence manifest, a real
 * Simulator composite, and independent review approve the complete wave.
 * Keeping the record in code makes the runtime entry point explicit without
 * letting metadata or front-only art promote itself.
 */
export const ROOM_V3_UNIVERSAL_CORE_PROMOTION_RECORDS: readonly RoomV3UniversalCorePromotionRecord[] = []

/**
 * This remains null until the Node evidence verifier has checked every file,
 * produced the bundle digest, and bound it to an immutable Git commit.
 */
export const ROOM_V3_UNIVERSAL_CORE_TRUSTED_EVIDENCE_APPROVAL:
  RoomV3UniversalCorePromotionTrust | null = null

export function resolveApprovedRoomV3UniversalCoreFurniture(
  record?: RoomV3UniversalCorePromotionRecord | null,
  trust: RoomV3UniversalCorePromotionTrust | null =
    ROOM_V3_UNIVERSAL_CORE_TRUSTED_EVIDENCE_APPROVAL
): FurnitureItem[] {
  if (!record || !hasCompletePromotionEvidence(record, trust)) return []

  const furniture = createRoomV3UniversalCoreRuntimeFurniture(record.artifactRegistry)
  if (furniture.length !== ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length) return []

  return furniture.map((item) => ({
    ...item,
    sourceStatus: "approved",
    qaStatus: "pass"
  }))
}

function hasCompletePromotionEvidence(
  record: RoomV3UniversalCorePromotionRecord,
  trust: RoomV3UniversalCorePromotionTrust | null
): boolean {
  if (
    !trust ||
    trust.evidenceVerifierId !== UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID ||
    trust.buildIdentity !== record.skuEvidenceManifest?.buildIdentity ||
    trust.evidenceBundleSha256 !==
      record.skuEvidenceManifest?.evidenceBundleSha256
  ) {
    return false
  }

  const hasGlobalEvidence = [
    record.simulatorEvidenceId,
    record.evidenceManifestId,
    record.independentReviewerEvidenceId,
    record.collisionEvidenceId,
    record.seatingEvidenceId,
    record.persistenceEvidenceId
  ].every((value) => typeof value === "string" && value.trim().length > 0)
  if (!hasGlobalEvidence) return false
  if (
    !record.artifactRegistry ||
    !record.skuEvidenceManifest ||
    !record.economyPromotion
  ) return false

  if (
    record.artifactRegistry.artifactManifestId !==
    record.skuEvidenceManifest.artifactManifestId
  ) return false

  if (
    record.economyPromotion.buildIdentity !==
      record.skuEvidenceManifest.buildIdentity ||
    record.economyPromotion.evidenceManifestId !== record.evidenceManifestId ||
    record.economyPromotion.evidenceVerifierId !==
      record.skuEvidenceManifest.evidenceVerifierId ||
    record.economyPromotion.evidenceBundleSha256 !==
      record.skuEvidenceManifest.evidenceBundleSha256 ||
    record.economyPromotion.artifactManifestId !==
      record.artifactRegistry.artifactManifestId
  ) {
    return false
  }

  const economyItems = resolvePromotedUniversalCoreRoomEconomyItems(
    record.economyPromotion
  )
  if (
    economyItems.length !== ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length ||
    economyItems.some(
      (item, index) =>
        item.itemId !== ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS[index]
    )
  ) {
    return false
  }

  return validateRoomV3UniversalCoreEvidenceManifest(
    record.skuEvidenceManifest
  ).isValid
}
