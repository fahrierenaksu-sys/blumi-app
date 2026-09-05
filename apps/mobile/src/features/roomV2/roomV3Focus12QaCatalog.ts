import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomV2AssetRef
} from "./roomV2.types"
import {
  createFocus12ArcadeDraft,
  createFocus12SectionalDraft,
  createFocus12TvMediaUnitDraft,
  type Focus12DirectionalAssets
} from "./roomV3FurnitureFocus12Draft"
import {
  ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS,
  type RoomV3Focus12QaCandidateId
} from "./roomV3Focus12CandidateIds"
import { calibrateRoomV3UniversalCoreFurnitureForMobile } from "./roomV3UniversalCoreRuntimeFurniture"
import { isExplicitRoomV3QaRuntime } from "./roomV3QaRuntimeGate"

export {
  ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS,
  type RoomV3Focus12QaCandidateId
} from "./roomV3Focus12CandidateIds"

export const ROOM_V3_FOCUS_12_QA_ARTIFACT_VERIFIER_ID =
  "room-v3-focus12-candidate-artifact-registry-v1"
export const ROOM_V3_FOCUS_12_QA_ARTIFACT_MANIFEST_ID =
  "room-v3-focus12-qa-candidate-assets-v1"

type Focus12AssetHashRegistry = Record<
  RoomV3Focus12QaCandidateId,
  Record<RoomFurnitureRotation, string>
>

const ROOM_V3_FOCUS_12_QA_ASSET_HASHES: Focus12AssetHashRegistry = {
  universal_cloud_sectional_sofa_a: {
    front: "71359d061c903fceee6839faccd41ed72d12a93170cc4be9d7e867f633e69fe7",
    back: "37ff535d9e60fb93d3fdc6b85661259da2df39321446bbe2bebdc5c543f6769c",
    left: "b5a76f4921c34ca9028f1cf1f250bafa89d01e9d98f2d55f5611367dced25f72",
    right: "ad72314338587c96185c22a5c352ceaa8d45a4af1bf6b34c0511aa60ed3af550"
  },
  universal_cozy_tv_media_unit_a: {
    front: "a81ccefff23491392791f0329f6bc7049b5a34b39082b848aa1bc66af9a075a5",
    back: "131eca68f6ff0ca25ca98aac3466b4a374a9763f92e7dcdb1a77489ab86f38f0",
    left: "50ec565e896a294794a58be60fda121679e0f2021c6c8bcfb3dfd2f73bade31c",
    right: "9f2ebe832ba4e2acd7d375f30d8105ea5170c00a53fe71ada7631ff87d4b679a"
  },
  universal_home_arcade_a: {
    front: "13391013c364e43a79709be154dbd588aa2bae598d0c9bdf9d1559e683d72b59",
    back: "b5cf6f42d9528bd440ea78aa8f752911ed3bb2bf410f143889e18afd886b36ba",
    left: "d5e8ff6d2bf6a5f333c39114382dddd9d6181561bde60c5ec7d2ddc826358d25",
    right: "16017ebd332cc34ffa00b8e306fa3dad73863b074e3500087943b070680b726c"
  }
}

export interface RoomV3Focus12QaArtifactRegistry {
  verifierId: string
  artifactManifestId: string
  verifiedCandidateIds: readonly RoomV3Focus12QaCandidateId[]
  verifiedAssetHashesByCandidateId: Readonly<
    Record<string, Partial<Record<RoomFurnitureRotation, string>>>
  >
}

export interface RoomV3Focus12QaCatalogInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawFocus12QaFlag: string | undefined
  artifactRegistry: RoomV3Focus12QaArtifactRegistry | null | undefined
}

export type RoomV3Focus12QaCatalogReason =
  | "disabled"
  | "untrusted_registry"
  | "ready"

export interface RoomV3Focus12QaCatalogResult {
  enabled: boolean
  reason: RoomV3Focus12QaCatalogReason
  catalog: FurnitureItem[]
  ownedItemIds: string[]
}

/**
 * Development-only candidate registry for the three Focus 12 renders. It is
 * deliberately isolated from production catalog and economy code. Candidate
 * output stays blocked and locked, so wiring this resolver can never promote
 * or grant any production/economy product by itself. When this isolated
 * channel is explicitly enabled, its three temporary QA item IDs are exposed
 * only to the separately namespaced QA provider for placement testing.
 */
export function createRoomV3Focus12QaArtifactRegistry(): RoomV3Focus12QaArtifactRegistry {
  return {
    verifierId: ROOM_V3_FOCUS_12_QA_ARTIFACT_VERIFIER_ID,
    artifactManifestId: ROOM_V3_FOCUS_12_QA_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: [...ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS],
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS.map((candidateId) => [
        candidateId,
        { ...ROOM_V3_FOCUS_12_QA_ASSET_HASHES[candidateId] }
      ])
    )
  }
}

export function resolveRoomV3Focus12QaCatalog(
  input: RoomV3Focus12QaCatalogInput
): RoomV3Focus12QaCatalogResult {
  if (!isExplicitFocus12DevelopmentQa(input)) {
    return disabledResult("disabled")
  }
  if (!isTrustedFocus12ArtifactRegistry(input.artifactRegistry)) {
    return disabledResult("untrusted_registry")
  }

  return {
    enabled: true,
    reason: "ready",
    catalog: createFocus12CandidateFurniture().map((item) => ({
      ...calibrateRoomV3UniversalCoreFurnitureForMobile(item),
      sourceStatus: "candidate",
      qaStatus: "blocked",
      ownedByDefault: false,
      locked: true
    })),
    ownedItemIds: [...ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS]
  }
}

function disabledResult(reason: Exclude<RoomV3Focus12QaCatalogReason, "ready">): RoomV3Focus12QaCatalogResult {
  return { enabled: false, reason, catalog: [], ownedItemIds: [] }
}

function isExplicitFocus12DevelopmentQa(input: RoomV3Focus12QaCatalogInput): boolean {
  return (
    isExplicitRoomV3QaRuntime(input) &&
    input.rawFocus12QaFlag?.trim() === "1"
  )
}

function isTrustedFocus12ArtifactRegistry(
  registry: RoomV3Focus12QaArtifactRegistry | null | undefined
): registry is RoomV3Focus12QaArtifactRegistry {
  if (
    !registry ||
    registry.verifierId !== ROOM_V3_FOCUS_12_QA_ARTIFACT_VERIFIER_ID ||
    registry.artifactManifestId !== ROOM_V3_FOCUS_12_QA_ARTIFACT_MANIFEST_ID ||
    !Array.isArray(registry.verifiedCandidateIds) ||
    !registry.verifiedAssetHashesByCandidateId ||
    typeof registry.verifiedAssetHashesByCandidateId !== "object"
  ) return false

  const expectedIds = new Set<string>(ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS)
  if (
    registry.verifiedCandidateIds.length !== expectedIds.size ||
    new Set(registry.verifiedCandidateIds).size !== expectedIds.size ||
    registry.verifiedCandidateIds.some((candidateId) => !expectedIds.has(candidateId))
  ) return false

  return ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS.every((candidateId) => (
    REQUIRED_ROTATIONS.every((rotation) => (
      registry.verifiedAssetHashesByCandidateId[candidateId]?.[rotation] ===
      ROOM_V3_FOCUS_12_QA_ASSET_HASHES[candidateId][rotation]
    ))
  ))
}

const REQUIRED_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

function createFocus12CandidateFurniture(): FurnitureItem[] {
  return [
    createFocus12SectionalDraft(createFocus12DirectionalAssets("universal_cloud_sectional_sofa_a")),
    createFocus12TvMediaUnitDraft(createFocus12DirectionalAssets("universal_cozy_tv_media_unit_a")),
    createFocus12ArcadeDraft(createFocus12DirectionalAssets("universal_home_arcade_a"))
  ]
}

function createFocus12DirectionalAssets(
  candidateId: RoomV3Focus12QaCandidateId
): Focus12DirectionalAssets {
  return {
    front: assetRef(candidateId, "front"),
    back: assetRef(candidateId, "back"),
    left: assetRef(candidateId, "left"),
    right: assetRef(candidateId, "right")
  }
}

function assetRef(
  candidateId: RoomV3Focus12QaCandidateId,
  rotation: RoomFurnitureRotation
): RoomV2AssetRef {
  const asset = FOCUS_12_ASSETS[candidateId][rotation]
  return {
    key: asset.key,
    source: asset.source
  }
}

// Metro must see every candidate image as a static require. Keep this mapping
// local to the QA channel so it cannot become a production catalog registry.
const FOCUS_12_ASSETS: Record<
  RoomV3Focus12QaCandidateId,
  Record<RoomFurnitureRotation, RoomV2AssetRef>
> = {
  universal_cloud_sectional_sofa_a: {
    front: focus12Asset("universal_cloud_sectional_sofa_a_front_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cloud_sectional_sofa_a_front_candidate_v1.png")),
    back: focus12Asset("universal_cloud_sectional_sofa_a_back_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cloud_sectional_sofa_a_back_candidate_v1.png")),
    left: focus12Asset("universal_cloud_sectional_sofa_a_left_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cloud_sectional_sofa_a_left_candidate_v1.png")),
    right: focus12Asset("universal_cloud_sectional_sofa_a_right_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cloud_sectional_sofa_a_right_candidate_v1.png"))
  },
  universal_cozy_tv_media_unit_a: {
    front: focus12Asset("universal_cozy_tv_media_unit_a_front_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cozy_tv_media_unit_a_front_candidate_v1.png")),
    back: focus12Asset("universal_cozy_tv_media_unit_a_back_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cozy_tv_media_unit_a_back_candidate_v1.png")),
    left: focus12Asset("universal_cozy_tv_media_unit_a_left_candidate_v2.png", require("./assets/runtime/candidates/focus12/universal_cozy_tv_media_unit_a_left_candidate_v2.png")),
    right: focus12Asset("universal_cozy_tv_media_unit_a_right_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_cozy_tv_media_unit_a_right_candidate_v1.png"))
  },
  universal_home_arcade_a: {
    front: focus12Asset("universal_home_arcade_a_front_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_home_arcade_a_front_candidate_v1.png")),
    back: focus12Asset("universal_home_arcade_a_back_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_home_arcade_a_back_candidate_v1.png")),
    left: focus12Asset("universal_home_arcade_a_left_candidate_v1.png", require("./assets/runtime/candidates/focus12/universal_home_arcade_a_left_candidate_v1.png")),
    right: focus12Asset("universal_home_arcade_a_right_candidate_v2.png", require("./assets/runtime/candidates/focus12/universal_home_arcade_a_right_candidate_v2.png"))
  }
}

function focus12Asset(
  key: string,
  source: RoomV2AssetRef["source"]
): RoomV2AssetRef {
  return { key, source }
}
