import type { FurnitureItem } from "./roomV2.types"
import {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION
} from "./roomV3UniversalCoreArtifactRegistry"
import {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreTrustedArtifactRegistry
} from "./roomV3UniversalCoreRuntimeFurniture"
import { resolveRoomV3UniversalCoreQaPreviewFurniture } from "./roomV3UniversalCoreQaPreview"

export interface RoomV3UniversalCoreQaInteractionCatalogInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawPreviewFlag: string | undefined
  artifactRegistry: RoomV3UniversalCoreTrustedArtifactRegistry | null | undefined
}

export interface RoomV3UniversalCoreQaInteractionCatalogResult {
  enabled: boolean
  catalog: FurnitureItem[]
  ownedItemIds: string[]
}

export interface RoomV2FurnitureCatalogRuntimeResolution
  extends RoomV3UniversalCoreQaInteractionCatalogResult {
  catalog: FurnitureItem[]
}

export type RoomV2DecorCommitMode =
  | "persist_to_provider"
  | "persist_to_qa_namespace"

export function createRoomV3UniversalCoreQaArtifactRegistry(): RoomV3UniversalCoreTrustedArtifactRegistry {
  return {
    verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((candidateId) => [
        candidateId,
        { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[candidateId] }
      ])
    )
  }
}

/**
 * Resolves an isolated, interactable QA catalog without changing the
 * production Room V2 catalog or economy inventory. The explicit preview gate
 * and trusted generated registry remain mandatory.
 */
export function resolveRoomV3UniversalCoreQaInteractionCatalog(
  input: RoomV3UniversalCoreQaInteractionCatalogInput
): RoomV3UniversalCoreQaInteractionCatalogResult {
  const preview = resolveRoomV3UniversalCoreQaPreviewFurniture(input)
  if (!preview.enabled) {
    return {
      enabled: false,
      catalog: [],
      ownedItemIds: []
    }
  }

  const catalog = preview.catalog.map((item) => ({
    ...item,
    ownedByDefault: true,
    locked: false
  }))
  return {
    enabled: catalog.length === ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length,
    catalog,
    ownedItemIds: catalog.map((item) => item.id)
  }
}

export function resolveRoomV2FurnitureCatalogForRuntime(input: {
  legacyCatalog: readonly FurnitureItem[]
} & RoomV3UniversalCoreQaInteractionCatalogInput): RoomV2FurnitureCatalogRuntimeResolution {
  const qaCatalog = resolveRoomV3UniversalCoreQaInteractionCatalog(input)
  if (!qaCatalog.enabled) {
    return {
      enabled: false,
      catalog: [...input.legacyCatalog],
      ownedItemIds: []
    }
  }
  return qaCatalog
}

/**
 * Universal Core QA placement must persist through the isolated RoomV2 QA
 * namespace while staying out of the production provider/storage namespace.
 */
export function resolveRoomV2DecorCommitModeForRuntime(input: {
  qaCatalogEnabled: boolean
}): RoomV2DecorCommitMode {
  return input.qaCatalogEnabled
    ? "persist_to_qa_namespace"
    : "persist_to_provider"
}
