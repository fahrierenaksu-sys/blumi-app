import type { RoomShell } from "./roomV2.types"
import { isExplicitRoomV3QaRuntime } from "./roomV3QaRuntimeGate"

export const ROOM_V3_QA_SHELL_IDS = [
  "room_v3_shell_apricot_sky_social_loft",
  "room_v3_shell_blush_petal_cottage",
  "room_v3_shell_cocoa_navy_modern_studio",
  "room_v3_shell_sage_cloud_scandinavian",
  "room_v3_shell_forest_terracotta_creative_loft",
  "room_v3_shell_lavender_moon_atelier"
] as const

export interface RoomV3QaShellCatalogRuntimeInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawPreviewFlag: string | undefined
  productionCatalog: readonly RoomShell[]
  candidateCatalog: readonly RoomShell[]
}

export interface RoomV3QaShellCatalogRuntimeResult {
  enabled: boolean
  reason: "disabled" | "invalid_candidate_catalog" | "ready"
  catalog: RoomShell[]
}

/**
 * Exposes unpromoted shells only inside an explicit development QA runtime.
 * Any candidate or geometry drift returns the isolated production catalog.
 */
export function resolveRoomV3QaShellCatalogRuntime(
  input: RoomV3QaShellCatalogRuntimeInput
): RoomV3QaShellCatalogRuntimeResult {
  const productionCatalog = input.productionCatalog.map(cloneRoomShell)
  if (
    !isExplicitRoomV3QaRuntime(input) ||
    input.rawPreviewFlag?.trim() !== "1"
  ) {
    return { enabled: false, reason: "disabled", catalog: productionCatalog }
  }

  const baseShell = input.productionCatalog[0]
  if (!baseShell || !isValidCandidateCatalog(input.candidateCatalog, baseShell)) {
    return {
      enabled: false,
      reason: "invalid_candidate_catalog",
      catalog: productionCatalog
    }
  }

  return {
    enabled: true,
    reason: "ready",
    catalog: [
      ...productionCatalog,
      ...input.candidateCatalog.map(cloneRoomShell)
    ]
  }
}

function isValidCandidateCatalog(
  candidates: readonly RoomShell[],
  baseShell: RoomShell
): boolean {
  if (candidates.length !== ROOM_V3_QA_SHELL_IDS.length) return false
  const expectedIds = new Set<string>(ROOM_V3_QA_SHELL_IDS)
  const seenIds = new Set<string>()
  const seenAssetKeys = new Set<string>()

  for (const candidate of candidates) {
    if (
      !expectedIds.has(candidate.id) ||
      seenIds.has(candidate.id) ||
      seenAssetKeys.has(candidate.asset.key) ||
      candidate.sourceStatus !== "candidate" ||
      candidate.qaStatus !== "pending" ||
      !hasSourceLockedGeometry(candidate, baseShell)
    ) {
      return false
    }
    seenIds.add(candidate.id)
    seenAssetKeys.add(candidate.asset.key)
  }

  return seenIds.size === expectedIds.size
}

function hasSourceLockedGeometry(candidate: RoomShell, baseShell: RoomShell): boolean {
  return (
    candidate.canvasSize.width === baseShell.canvasSize.width &&
    candidate.canvasSize.height === baseShell.canvasSize.height &&
    stableGeometry(candidate) === stableGeometry(baseShell)
  )
}

function stableGeometry(shell: RoomShell): string {
  return JSON.stringify({
    geometryVersion: shell.geometryVersion,
    myRoomCamera: shell.myRoomCamera,
    miniRoomCamera: shell.miniRoomCamera,
    placeableArea: shell.placeableArea,
    surfacePlacementAreas: shell.surfacePlacementAreas,
    surfacePlacementExclusions: shell.surfacePlacementExclusions,
    walkablePolygon: shell.walkablePolygon,
    placementLanes: shell.placementLanes
  })
}

function cloneRoomShell(shell: RoomShell): RoomShell {
  return {
    ...shell,
    asset: { ...shell.asset },
    canvasSize: { ...shell.canvasSize },
    myRoomCamera: shell.myRoomCamera ? { ...shell.myRoomCamera } : undefined,
    miniRoomCamera: shell.miniRoomCamera ? { ...shell.miniRoomCamera } : undefined,
    placeableArea: shell.placeableArea ? { ...shell.placeableArea } : undefined,
    surfacePlacementAreas: shell.surfacePlacementAreas
      ? { ...shell.surfacePlacementAreas }
      : undefined,
    surfacePlacementExclusions: shell.surfacePlacementExclusions
      ? Object.fromEntries(
        Object.entries(shell.surfacePlacementExclusions).map(([surface, bounds]) => [
          surface,
          bounds?.map((bound) => ({ ...bound }))
        ])
      )
      : undefined,
    walkablePolygon: shell.walkablePolygon?.map((point) => ({ ...point })),
    placementLanes: shell.placementLanes?.map((lane) => ({ ...lane }))
  }
}
