import type { FurnitureItem } from "./roomV2.types"
import {
  createRoomV3UniversalCoreRuntimeFurniture,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreTrustedArtifactRegistry
} from "./roomV3UniversalCoreRuntimeFurniture"
import { isExplicitRoomV3QaRuntime } from "./roomV3QaRuntimeGate"

export type RoomV3UniversalCoreQaPreviewResultReason =
  | "disabled"
  | "untrusted_registry"
  | "ready"

export interface RoomV3UniversalCoreQaPreviewInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawPreviewFlag: string | undefined
  artifactRegistry: RoomV3UniversalCoreTrustedArtifactRegistry | null | undefined
}

export interface RoomV3UniversalCoreQaPreviewResult {
  enabled: boolean
  reason: RoomV3UniversalCoreQaPreviewResultReason
  catalog: FurnitureItem[]
}

/**
 * Resolves an isolated Universal Core catalog for development QA only.
 *
 * This is deliberately not imported by the production room or inventory
 * catalogs. A missing gate or untrusted artifact registry returns an empty
 * catalog, while successful output remains candidate/blocked and unowned.
 */
export function resolveRoomV3UniversalCoreQaPreviewFurniture(
  input: RoomV3UniversalCoreQaPreviewInput
): RoomV3UniversalCoreQaPreviewResult {
  if (!isExplicitDevelopmentPreview(input)) {
    return {
      enabled: false,
      reason: "disabled",
      catalog: []
    }
  }

  const runtimeFurniture = createRoomV3UniversalCoreRuntimeFurniture(
    input.artifactRegistry
  )
  if (
    runtimeFurniture.length !==
    ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length
  ) {
    return {
      enabled: false,
      reason: "untrusted_registry",
      catalog: []
    }
  }

  return {
    enabled: true,
    reason: "ready",
    catalog: runtimeFurniture.map((item) => ({
      ...item,
      sourceStatus: "candidate",
      qaStatus: "blocked",
      ownedByDefault: false,
      locked: true
    }))
  }
}

function isExplicitDevelopmentPreview(
  input: RoomV3UniversalCoreQaPreviewInput
): boolean {
  return (
    isExplicitRoomV3QaRuntime(input) &&
    input.rawPreviewFlag?.trim() === "1"
  )
}
