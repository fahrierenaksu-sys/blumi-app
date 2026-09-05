import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomPlacementSurface,
  RoomV2AssetRef
} from "../roomV2/roomV2.types"
import {
  ROOM_STUDIO_ASSET_MANIFEST,
  ROOM_STUDIO_ASSET_IDS
} from "./roomStudioAssetManifest"
import {
  getRoomStudioThemeOption,
  getRoomStudioThemePreset,
  type RoomStudioZoneId
} from "./roomStudioThemeMatrix"
import type { RoomStudioRuntimeGateResult } from "./roomStudioRuntimeGate"

export { ROOM_STUDIO_MODULE_ITEM_IDS } from "./roomStudioRecipes"

interface RoomStudioQaAssetEvidence {
  path: string
  sha256: string
  width: number
  height: number
}

export interface RoomStudioQaPlacementGeometry {
  footprint: { width: number; height: number }
  anchor: { x: number; y: number }
}

export interface RoomStudioQaFurnitureItem extends FurnitureItem {
  sourceStatus: "candidate"
  qaStatus: "blocked"
  locked: true
  qaAssetEvidence: RoomStudioQaAssetEvidence
  placementGeometry: RoomStudioQaPlacementGeometry
  availableDirections: RoomFurnitureRotation[]
  fourDirectionApproved: false
}

export interface RoomStudioQaCatalogResult {
  enabled: boolean
  catalog: RoomStudioQaFurnitureItem[]
  ownedItemIds: string[]
}

export type RoomStudioQaAssetBindings = Readonly<
  Record<string, RoomV2AssetRef["source"]>
>

const qaImage = (id: string, source: RoomV2AssetRef["source"]) => ({
  key: `${id}:front:candidate`,
  source
})

const candidate = (input: {
  id: string
  name: string
  placementSurface: RoomPlacementSurface
  category: FurnitureItem["category"]
  width: number
  height: number
  source: RoomV2AssetRef["source"]
  qaAssetEvidence: RoomStudioQaAssetEvidence
  placementGeometry: RoomStudioQaPlacementGeometry
}): RoomStudioQaFurnitureItem => {
  const asset = qaImage(input.id, input.source)
  return {
    id: input.id,
    name: input.name,
    asset,
    thumbnail: asset,
    category: input.category,
    layer: input.placementSurface === "wall" ? "wall" : "furniture",
    placementSurface: input.placementSurface,
    sceneProjection: "upright",
    width: input.width,
    height: input.height,
    anchor: { ...input.placementGeometry.anchor },
    footprint: { ...input.placementGeometry.footprint },
    placementFootprint: { ...input.placementGeometry.footprint },
    blocksMovement: input.placementSurface === "floor",
    interactionType: "decor",
    sourceStatus: "candidate",
    qaStatus: "blocked",
    locked: true,
    qaAssetEvidence: { ...input.qaAssetEvidence },
    placementGeometry: { ...input.placementGeometry, footprint: { ...input.placementGeometry.footprint }, anchor: { ...input.placementGeometry.anchor } },
    availableDirections: ["front"],
    fourDirectionApproved: false
  }
}

const ZONE_CONFIG: Readonly<Record<RoomStudioZoneId, Omit<Parameters<typeof candidate>[0], "id" | "name" | "source" | "qaAssetEvidence">>> = {
  sleep: {
    placementSurface: "floor",
    category: "misc",
    width: 0.37,
    height: 0.37,
    placementGeometry: { footprint: { width: 0.27, height: 0.13 }, anchor: { x: 0.5, y: 1 } }
  },
  cozyCorner: {
    placementSurface: "floor",
    category: "misc",
    width: 0.24,
    height: 0.24,
    placementGeometry: { footprint: { width: 0.17, height: 0.11 }, anchor: { x: 0.5, y: 1 } }
  },
  wallStory: {
    placementSurface: "wall",
    category: "wallDecor",
    width: 0.23,
    height: 0.23,
    placementGeometry: { footprint: { width: 0.12, height: 0.13 }, anchor: { x: 0.5, y: 0.5 } }
  },
  softAccents: {
    placementSurface: "floor",
    category: "misc",
    width: 0.14,
    height: 0.14,
    placementGeometry: { footprint: { width: 0.11, height: 0.075 }, anchor: { x: 0.5, y: 1 } }
  }
}

const REVIEWED_CANDIDATE_INPUTS: readonly Omit<Parameters<typeof candidate>[0], "source">[] =
  ROOM_STUDIO_ASSET_IDS.map((assetId) => {
    const evidence = ROOM_STUDIO_ASSET_MANIFEST[assetId]
    const themeLabel = getRoomStudioThemePreset(evidence.theme).label
    const zoneConfig = ZONE_CONFIG[evidence.zone]
    const zoneLabel = getRoomStudioThemeOption(evidence.theme, evidence.zone).label
    return {
      ...zoneConfig,
      id: evidence.id,
      name: `${themeLabel} · ${zoneLabel}`,
      qaAssetEvidence: {
        path: evidence.assetPath,
        sha256: evidence.sha256,
        width: evidence.width,
        height: evidence.height
      }
    }
  })

export function resolveRoomStudioQaCatalog(
  gate: RoomStudioRuntimeGateResult,
  assetBindings: RoomStudioQaAssetBindings
): RoomStudioQaCatalogResult {
  if (!gate.enabled || !gate.canPreview) {
    return { enabled: false, catalog: [], ownedItemIds: [] }
  }

  if (REVIEWED_CANDIDATE_INPUTS.some(
    (entry) => assetBindings[entry.id] === undefined
  )) {
    return { enabled: false, catalog: [], ownedItemIds: [] }
  }

  const catalog = REVIEWED_CANDIDATE_INPUTS.map((entry) => copyCandidate(
    candidate({ ...entry, source: assetBindings[entry.id]! })
  ))
  return {
    enabled: true,
    catalog,
    ownedItemIds: catalog.map((item) => item.id)
  }
}

function copyCandidate(
  item: RoomStudioQaFurnitureItem
): RoomStudioQaFurnitureItem {
  return {
    ...item,
    asset: { ...item.asset },
    ...(item.thumbnail ? { thumbnail: { ...item.thumbnail } } : {}),
    qaAssetEvidence: { ...item.qaAssetEvidence },
    placementGeometry: {
      footprint: { ...item.placementGeometry.footprint },
      anchor: { ...item.placementGeometry.anchor }
    },
    availableDirections: [...item.availableDirections]
  }
}
