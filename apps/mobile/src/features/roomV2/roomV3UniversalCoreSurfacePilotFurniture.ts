import type {
  FurnitureItem,
  RoomPlacementSurface,
  RoomV2AssetRef
} from "./roomV2.types"

export function createUniversalTableLampAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_table_lamp_a",
    name: "Cloud Table Lamp",
    category: "lighting",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.08,
    height: 0.12
  })
}

export function createUniversalWallClockAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_wall_clock_a",
    name: "Pale Ash Wall Clock",
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    surfacePlacementPolicy: "avoid_openings",
    asset,
    width: 0.12,
    height: 0.12,
    anchor: { x: 0.5, y: 0.5 }
  })
}

export function createUniversalWallArtworkAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_wall_artwork_a",
    name: "Sage Cloud Wall Artwork",
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    surfacePlacementPolicy: "avoid_openings",
    asset,
    width: 0.14,
    height: 0.14,
    anchor: { x: 0.5, y: 0.5 }
  })
}

export function createUniversalArchWallMirrorAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_arch_wall_mirror_a",
    name: "Rounded Arch Wall Mirror",
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    surfacePlacementPolicy: "avoid_openings",
    asset,
    width: 0.14,
    height: 0.22,
    anchor: { x: 0.5, y: 0.5 }
  })
}

export function createUniversalCeilingLightAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_ceiling_light_a",
    name: "Cloud Halo Ceiling Light",
    category: "lighting",
    layer: "wall",
    placementSurface: "ceiling",
    asset,
    width: 0.24,
    height: 0.14,
    anchor: { x: 0.5, y: 0.5 }
  })
}

export function createUniversalCurtainSetAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_curtain_set_a",
    name: "Cloud Window Curtain Set",
    category: "wallDecor",
    layer: "wall",
    placementSurface: "wall",
    surfacePlacementPolicy: "opening",
    asset,
    width: 0.18,
    height: 0.22,
    anchor: { x: 0.5, y: 0.5 }
  })
}

export function createUniversalDecorativeObjectSetAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_decorative_object_set_a",
    name: "Neutral Decorative Object Set",
    category: "misc",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.11,
    height: 0.09
  })
}

export function createUniversalSmallTabletopPlantAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_small_tabletop_plant_a",
    name: "Cloud Pot Plant",
    category: "plant",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.07,
    height: 0.1
  })
}

export function createUniversalCeramicVaseSetAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_ceramic_vase_set_a",
    name: "Neutral Ceramic Vase Set",
    category: "misc",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.1,
    height: 0.1
  })
}

export function createUniversalBooksMagazineStackAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_books_magazine_stack_a",
    name: "Quiet Book Stack",
    category: "misc",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.09,
    height: 0.06
  })
}

export function createUniversalTeaCoffeeTrayAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_tea_coffee_tray_a",
    name: "Neutral Tea Tray",
    category: "misc",
    layer: "furniture",
    placementSurface: "tabletop",
    asset,
    width: 0.12,
    height: 0.06
  })
}

export function createUniversalSmallSpeakerAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_small_speaker_a",
    name: "Quiet Floor Speaker",
    category: "misc",
    layer: "furniture",
    placementSurface: "floor",
    asset,
    width: 0.14,
    height: 0.32,
    footprint: { width: 0.1, height: 0.08 },
    footprintByRotation: {
      front: { width: 0.1, height: 0.08 },
      back: { width: 0.1, height: 0.08 },
      left: { width: 0.08, height: 0.1 },
      right: { width: 0.08, height: 0.1 }
    },
    blocksMovement: true
  })
}

export function createUniversalRugAPilot(asset: RoomV2AssetRef): FurnitureItem {
  return createSurfacePilot({
    id: "universal_rug_a",
    name: "Soft Neutral Oval Rug",
    category: "rug",
    sceneProjection: "floor_plane",
    layer: "floor",
    placementSurface: "floor",
    asset,
    width: 0.42,
    height: 0.09,
    blocksMovement: false
  })
}

export function createUniversalCushionSetAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_cushion_set_a",
    name: "Cloud Cushion Set",
    category: "misc",
    layer: "furniture",
    // The artwork depicts three large floor cushions. Treating the set as a
    // tabletop prop made its physical width impossible to place on a support
    // surface and contradicted the intended customisation behavior.
    placementSurface: "floor",
    asset,
    width: 0.28,
    height: 0.12,
    blocksMovement: false
  })
}

export function createUniversalFullLengthMirrorAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_full_length_mirror_a",
    name: "Soft Arch Full-Length Mirror",
    category: "misc",
    layer: "furniture",
    placementSurface: "floor",
    asset,
    width: 0.14,
    height: 0.34,
    footprint: { width: 0.11, height: 0.08 },
    footprintByRotation: {
      front: { width: 0.11, height: 0.08 },
      back: { width: 0.11, height: 0.08 },
      left: { width: 0.08, height: 0.11 },
      right: { width: 0.08, height: 0.11 }
    },
    blocksMovement: true
  })
}

export function createUniversalOpenDisplayShelfAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_open_display_shelf_a",
    name: "Open Display Shelf",
    category: "misc",
    layer: "furniture",
    placementSurface: "floor",
    asset,
    width: 0.26,
    height: 0.34,
    footprint: { width: 0.22, height: 0.11 },
    footprintByRotation: {
      front: { width: 0.22, height: 0.11 },
      back: { width: 0.22, height: 0.11 },
      left: { width: 0.11, height: 0.22 },
      right: { width: 0.11, height: 0.22 }
    },
    blocksMovement: true,
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.12, maxX: 0.88, minY: 0.08, maxY: 0.16 }
    }]
  })
}

export function createUniversalRoomDividerAPilot(
  asset: RoomV2AssetRef
): FurnitureItem {
  return createSurfacePilot({
    id: "universal_room_divider_a",
    name: "Soft Panel Room Divider",
    category: "misc",
    layer: "furniture",
    placementSurface: "floor",
    asset,
    width: 0.32,
    height: 0.34,
    footprint: { width: 0.27, height: 0.11 },
    footprintByRotation: {
      front: { width: 0.27, height: 0.11 },
      back: { width: 0.27, height: 0.11 },
      left: { width: 0.11, height: 0.27 },
      right: { width: 0.11, height: 0.27 }
    },
    blocksMovement: true
  })
}

function createSurfacePilot(input: {
  id: string
  name: string
  category: FurnitureItem["category"]
  sceneProjection?: FurnitureItem["sceneProjection"]
  layer: FurnitureItem["layer"]
  placementSurface: RoomPlacementSurface
  surfacePlacementPolicy?: FurnitureItem["surfacePlacementPolicy"]
  asset: RoomV2AssetRef
  width: number
  height: number
  anchor?: FurnitureItem["anchor"]
  footprint?: FurnitureItem["footprint"]
  footprintByRotation?: FurnitureItem["footprintByRotation"]
  blocksMovement?: boolean
  surfaceSupports?: FurnitureItem["surfaceSupports"]
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: input.asset,
    category: input.category,
    sceneProjection: input.sceneProjection,
    layer: input.layer,
    placementSurface: input.placementSurface,
    surfacePlacementPolicy: input.surfacePlacementPolicy,
    width: input.width,
    height: input.height,
    anchor: input.anchor ?? { x: 0.5, y: 1 },
    footprint: input.footprint,
    footprintByRotation: input.footprintByRotation,
    blocksMovement: input.blocksMovement ?? false,
    surfaceSupports: input.surfaceSupports,
    interactionType: "decor",
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}
