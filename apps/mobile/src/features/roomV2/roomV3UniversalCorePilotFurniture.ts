import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomV2AssetRef
} from "./roomV2.types"

export type UniversalCorePilotDirectionalAssets = Record<
  RoomFurnitureRotation,
  RoomV2AssetRef
>

// Only the lower cushion lip and seat rail belong in front of a seated avatar.
// Starting this crop at the middle of the cushion hid the avatar from the hips
// down and made the pose look perched on the armrest instead of seated.
const UNIVERSAL_SEAT_FRONT_OCCLUSION = {
  front: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
  back: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
  left: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
  right: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 }
} as const

// The v2 front loveseat art has a deeper cushion lip than the original
// directional set. Repaint that lip from its real visual boundary while
// retaining the independently authored crops for the other rotations.
const UNIVERSAL_CLOUD_LOVESEAT_FRONT_OCCLUSION = {
  ...UNIVERSAL_SEAT_FRONT_OCCLUSION,
  front: { left: 0.02, top: 0.58, width: 0.96, height: 0.39 }
} as const

// The dining-chair art has a visible cushion lip halfway down its canvas.
// Replaying only the lower legs (the generic 0.68 crop) leaves the sitting
// sprite painted over the cushion. The front crop begins at the real lip so
// the knees remain readable while the lower body tucks behind the seat rail.
const UNIVERSAL_DINING_CHAIR_FRONT_OCCLUSION = {
  ...UNIVERSAL_SEAT_FRONT_OCCLUSION,
  front: { left: 0.02, top: 0.5, width: 0.96, height: 0.47 }
} as const

// The bed's tall footboard must cover dangling legs without swallowing the
// avatar at the waist. Its foreground crop therefore starts below the generic
// seat rail while preserving the actual painted footboard as the mask.
const UNIVERSAL_CLOUD_BED_FRONT_OCCLUSION = {
  ...UNIVERSAL_SEAT_FRONT_OCCLUSION,
  front: { left: 0.02, top: 0.75, width: 0.96, height: 0.22 }
} as const

// These items are calibration drafts for the universal asset wave. They are
// deliberately not imported by the Room V2 catalog: placement, collisions,
// seat poses, persistence, and iOS Simulator review must be evidenced first.
export function createUniversalCloudLoveseatAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    id: "universal_cloud_loveseat_a",
    name: "Cloud Loveseat",
    asset: assets.front,
    assetsByRotation: { ...assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    // Calibrated against the compact iPhone room stage: the first pilot was
    // visually oversized beside the avatar, so keep the render box closer to
    // the approved furniture-to-avatar ratio.
    width: 0.34,
    height: 0.23,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.205, height: 0.105 },
    footprintByRotation: {
      front: { width: 0.205, height: 0.105 },
      back: { width: 0.205, height: 0.105 },
      left: { width: 0.105, height: 0.205 },
      right: { width: 0.105, height: 0.205 }
    },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: UNIVERSAL_CLOUD_LOVESEAT_FRONT_OCCLUSION,
    seatSpec: {
      capacity: 2,
      seatPoints: [
        {
          id: "left",
          x: -0.12,
          y: -0.02,
          seatHeight: 0.085,
          facing: "front",
          approachPoint: { x: -0.12, y: 0.28 },
          exitPoint: { x: -0.12, y: 0.34 }
        },
        {
          id: "right",
          x: 0.12,
          y: -0.02,
          seatHeight: 0.085,
          facing: "front",
          approachPoint: { x: 0.12, y: 0.28 },
          exitPoint: { x: 0.12, y: 0.34 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

export function createUniversalLongSofaAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    id: "universal_long_sofa_a",
    name: "Cloud Long Sofa",
    asset: assets.front,
    assetsByRotation: { ...assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.48,
    height: 0.3,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.32, height: 0.14 },
    footprintByRotation: {
      front: { width: 0.32, height: 0.14 },
      back: { width: 0.32, height: 0.14 },
      left: { width: 0.14, height: 0.32 },
      right: { width: 0.14, height: 0.32 }
    },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: UNIVERSAL_SEAT_FRONT_OCCLUSION,
    seatSpec: {
      capacity: 2,
      seatPoints: [
        {
          id: "left",
          x: -0.2,
          y: -0.38,
          seatHeight: 0.1,
          facing: "front",
          approachPoint: { x: -0.2, y: 0.3 },
          exitPoint: { x: -0.2, y: 0.37 }
        },
        {
          id: "right",
          x: 0.2,
          y: -0.38,
          seatHeight: 0.1,
          facing: "front",
          approachPoint: { x: 0.2, y: 0.3 },
          exitPoint: { x: 0.2, y: 0.37 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

export function createUniversalLoungeArmchairAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalSeatPilot({
    id: "universal_lounge_armchair_a",
    name: "Cloud Lounge Armchair",
    assets,
    width: 0.24,
    height: 0.27,
    footprint: { width: 0.15, height: 0.1 },
    seatHeight: 0.095
  })
}

export function createUniversalCloudBedBPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    id: "universal_cloud_bed_b",
    name: "Cloud Double Bed",
    asset: assets.front,
    assetsByRotation: { ...assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.46,
    height: 0.32,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.3, height: 0.22 },
    footprintByRotation: {
      front: { width: 0.3, height: 0.22 },
      back: { width: 0.3, height: 0.22 },
      left: { width: 0.22, height: 0.3 },
      right: { width: 0.22, height: 0.3 }
    },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: UNIVERSAL_CLOUD_BED_FRONT_OCCLUSION,
    seatSpec: {
      capacity: 2,
      seatPoints: [
        {
          id: "left_edge",
          x: -0.1,
          y: 0.02,
          seatHeight: 0.08,
          facing: "front",
          approachPoint: { x: -0.1, y: 0.31 },
          exitPoint: { x: -0.1, y: 0.38 }
        },
        {
          id: "right_edge",
          x: 0.1,
          y: 0.02,
          seatHeight: 0.08,
          facing: "front",
          approachPoint: { x: 0.1, y: 0.31 },
          exitPoint: { x: 0.1, y: 0.38 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

export function createUniversalRoundedWardrobeAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_rounded_wardrobe_a",
    name: "Rounded Wardrobe",
    category: "misc",
    assets,
    width: 0.26,
    height: 0.42,
    frontFootprint: { width: 0.18, height: 0.1 },
    sideFootprint: { width: 0.1, height: 0.18 }
  })
}

export function createUniversalSoftMediaConsoleAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_soft_media_console_a",
    name: "Soft Media Console",
    category: "misc",
    assets,
    width: 0.38,
    height: 0.18,
    frontFootprint: { width: 0.28, height: 0.12 },
    sideFootprint: { width: 0.12, height: 0.28 },
    supportsTabletop: true
  })
}

export function createUniversalSoftCoatStandAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_soft_coat_stand_a",
    name: "Soft Coat Stand",
    category: "misc",
    assets,
    width: 0.12,
    height: 0.36,
    frontFootprint: { width: 0.08, height: 0.07 },
    sideFootprint: { width: 0.07, height: 0.08 }
  })
}

export function createUniversalSoftPoufBPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    ...createUniversalSeatPilot({
      id: "universal_soft_pouf_b",
      name: "Soft Neutral Pouf",
      assets,
      width: 0.2,
      height: 0.14,
      footprint: { width: 0.14, height: 0.1 },
      seatHeight: 0.07
    }),
    category: "seating"
  }
}

export function createUniversalCloudAccentChairBPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    id: "universal_cloud_accent_chair_b",
    name: "Cloud Accent Chair",
    asset: assets.front,
    assetsByRotation: { ...assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.22,
    height: 0.24,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.13, height: 0.09 },
    footprintByRotation: {
      front: { width: 0.13, height: 0.09 },
      back: { width: 0.13, height: 0.09 },
      left: { width: 0.09, height: 0.13 },
      right: { width: 0.09, height: 0.13 }
    },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: UNIVERSAL_SEAT_FRONT_OCCLUSION,
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "primary",
          x: 0,
          y: -0.16,
          seatHeight: 0.092,
          facing: "front",
          approachPoint: { x: 0, y: 0.28 },
          exitPoint: { x: 0, y: 0.33 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

export function createUniversalDiningChairAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  const chair = createUniversalSeatPilot({
    id: "universal_dining_chair_a",
    name: "Cloud Dining Chair",
    assets,
    width: 0.16,
    height: 0.26,
    footprint: { width: 0.11, height: 0.08 },
    seatHeight: 0.092
  })
  return {
    ...chair,
    frontOcclusionByRotation: UNIVERSAL_DINING_CHAIR_FRONT_OCCLUSION,
    seatSpec: chair.seatSpec
      ? {
          ...chair.seatSpec,
          seatPoints: chair.seatSpec.seatPoints.map((seat) => ({
            ...seat,
            y: -0.16
          }))
        }
      : undefined
  }
}

export function createUniversalDeskChairAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalSeatPilot({
    id: "universal_desk_chair_a",
    name: "Quiet Desk Chair",
    assets,
    width: 0.17,
    height: 0.25,
    footprint: { width: 0.11, height: 0.08 },
    seatHeight: 0.09
  })
}

export function createUniversalBenchAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return {
    ...createUniversalSeatPilot({
      id: "universal_bench_a",
      name: "Soft Universal Bench",
      assets,
      width: 0.3,
      height: 0.17,
      footprint: { width: 0.22, height: 0.09 },
      seatHeight: 0.088
    }),
    seatSpec: {
      capacity: 2,
      seatPoints: [
        {
          id: "left",
          x: -0.2,
          y: -0.34,
          seatHeight: 0.088,
          facing: "front",
          approachPoint: { x: -0.2, y: 0.24 },
          exitPoint: { x: -0.2, y: 0.3 }
        },
        {
          id: "right",
          x: 0.2,
          y: -0.34,
          seatHeight: 0.088,
          facing: "front",
          approachPoint: { x: 0.2, y: 0.24 },
          exitPoint: { x: 0.2, y: 0.3 }
        }
      ]
    }
  }
}

export function createUniversalSoftFloorCushionAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_soft_floor_cushion_a",
    name: "Soft Floor Cushion",
    category: "misc",
    assets,
    width: 0.2,
    height: 0.12,
    frontFootprint: { width: 0.15, height: 0.08 },
    sideFootprint: { width: 0.08, height: 0.15 }
  })
}

export function createUniversalPetBedAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_pet_bed_a",
    name: "Soft Pet Bed",
    category: "misc",
    assets,
    width: 0.22,
    height: 0.14,
    frontFootprint: { width: 0.16, height: 0.08 },
    sideFootprint: { width: 0.08, height: 0.16 }
  })
}

export function createUniversalPetalSideTableAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_petal_side_table_a",
    name: "Petal Side Table",
    category: "table",
    assets,
    width: 0.16,
    height: 0.16,
    frontFootprint: { width: 0.11, height: 0.08 },
    sideFootprint: { width: 0.08, height: 0.11 },
    supportsTabletop: true
  })
}

export function createUniversalTidyWorkDeskAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_tidy_work_desk_a",
    name: "Tidy Work Desk",
    category: "table",
    assets,
    width: 0.26,
    height: 0.24,
    frontFootprint: { width: 0.19, height: 0.1 },
    sideFootprint: { width: 0.1, height: 0.19 },
    supportsTabletop: true
  })
}

export function createUniversalRoundDiningTableAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_round_dining_table_a",
    name: "Universal Round Dining Table",
    category: "table",
    assets,
    width: 0.26,
    height: 0.24,
    // A round top keeps one physical contact ellipse in every view. Swapping
    // the desk's rectangular base on side rotations made the table jump.
    frontFootprint: { width: 0.15, height: 0.11 },
    sideFootprint: { width: 0.15, height: 0.11 },
    supportsTabletop: true
  })
}

export function createUniversalArcCoffeeTableBPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_arc_coffee_table_b",
    name: "Arc Coffee Table",
    category: "table",
    assets,
    width: 0.25,
    height: 0.16,
    frontFootprint: { width: 0.16, height: 0.1 },
    sideFootprint: { width: 0.1, height: 0.16 },
    supportsTabletop: true
  })
}

export function createUniversalOrbitFloorLampAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_orbit_floor_lamp_a",
    name: "Orbit Floor Lamp",
    category: "lighting",
    assets,
    width: 0.085,
    height: 0.32,
    frontFootprint: { width: 0.055, height: 0.045 },
    sideFootprint: { width: 0.045, height: 0.055 }
  })
}

export function createUniversalLargeStandingPlantAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_large_standing_plant_a",
    name: "Large Standing Plant",
    category: "plant",
    assets,
    width: 0.085,
    height: 0.32,
    frontFootprint: { width: 0.055, height: 0.045 },
    sideFootprint: { width: 0.045, height: 0.055 }
  })
}

export function createUniversalStorageCabinetAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_storage_cabinet_a",
    name: "Storage Cabinet",
    category: "misc",
    assets,
    width: 0.3,
    height: 0.26,
    frontFootprint: { width: 0.22, height: 0.11 },
    sideFootprint: { width: 0.11, height: 0.22 },
    supportsTabletop: true
  })
}

export function createUniversalConsoleTableAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_console_table_a",
    name: "Universal Console Table",
    category: "table",
    assets,
    width: 0.3,
    height: 0.26,
    frontFootprint: { width: 0.22, height: 0.11 },
    sideFootprint: { width: 0.11, height: 0.22 },
    supportsTabletop: true
  })
}

export function createUniversalDresserAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_dresser_a",
    name: "Soft-Neutral Dresser",
    category: "misc",
    assets,
    width: 0.34,
    height: 0.24,
    frontFootprint: { width: 0.25, height: 0.11 },
    sideFootprint: { width: 0.11, height: 0.25 },
    supportsTabletop: true
  })
}

export function createUniversalNightstandAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_nightstand_a",
    name: "Quiet Nightstand",
    category: "misc",
    assets,
    width: 0.2,
    height: 0.2,
    frontFootprint: { width: 0.14, height: 0.09 },
    sideFootprint: { width: 0.09, height: 0.14 },
    supportsTabletop: true
  })
}

export function createUniversalLaundryBasketAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_laundry_basket_a",
    name: "Soft Laundry Basket",
    category: "misc",
    assets,
    width: 0.18,
    height: 0.24,
    frontFootprint: { width: 0.12, height: 0.08 },
    sideFootprint: { width: 0.08, height: 0.12 }
  })
}

export function createUniversalVanityTableAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_vanity_table_a",
    name: "Quiet Vanity Table",
    category: "table",
    assets,
    width: 0.28,
    height: 0.24,
    frontFootprint: { width: 0.2, height: 0.1 },
    sideFootprint: { width: 0.1, height: 0.2 },
    supportsTabletop: true
  })
}

export function createUniversalShoeCabinetAPilot(
  assets: UniversalCorePilotDirectionalAssets
): FurnitureItem {
  return createUniversalCoreDecorPilot({
    id: "universal_shoe_cabinet_a",
    name: "Soft Shoe Cabinet",
    category: "misc",
    assets,
    width: 0.3,
    height: 0.24,
    frontFootprint: { width: 0.22, height: 0.11 },
    sideFootprint: { width: 0.11, height: 0.22 },
    supportsTabletop: true
  })
}

function createUniversalCoreDecorPilot(input: {
  id: string
  name: string
  category: FurnitureItem["category"]
  assets: UniversalCorePilotDirectionalAssets
  width: number
  height: number
  frontFootprint: { width: number; height: number }
  sideFootprint: { width: number; height: number }
  supportsTabletop?: boolean
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: input.assets.front,
    assetsByRotation: { ...input.assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: input.category,
    layer: "furniture",
    placementSurface: "floor",
    width: input.width,
    height: input.height,
    anchor: { x: 0.5, y: 1 },
    footprint: { ...input.frontFootprint },
    footprintByRotation: {
      front: { ...input.frontFootprint },
      back: { ...input.frontFootprint },
      left: { ...input.sideFootprint },
      right: { ...input.sideFootprint }
    },
    ...(input.supportsTabletop
      ? {
          surfaceSupports: [{
            surface: "tabletop" as const,
            localBounds: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
            localBoundsByRotation: {
              front: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
              back: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
              left: { minX: 0.16, maxX: 0.84, minY: 0.1, maxY: 0.3 },
              right: { minX: 0.16, maxX: 0.84, minY: 0.1, maxY: 0.3 }
            }
          }]
        }
      : {}),
    blocksMovement: true,
    interactionType: "decor",
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

function createUniversalSeatPilot(input: {
  id: string
  name: string
  assets: UniversalCorePilotDirectionalAssets
  width: number
  height: number
  footprint: { width: number; height: number }
  seatHeight: number
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: input.assets.front,
    assetsByRotation: { ...input.assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "universal_core",
    homeTheme: "universal_core",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: input.width,
    height: input.height,
    anchor: { x: 0.5, y: 1 },
    footprint: { ...input.footprint },
    footprintByRotation: {
      front: { ...input.footprint },
      back: { ...input.footprint },
      left: { width: input.footprint.height, height: input.footprint.width },
      right: { width: input.footprint.height, height: input.footprint.width }
    },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: UNIVERSAL_SEAT_FRONT_OCCLUSION,
    seatSpec: {
      capacity: 1,
      seatPoints: [{
        id: "primary",
        x: 0,
        y: -0.34,
        facing: "front",
        seatHeight: input.seatHeight,
        approachPoint: { x: 0, y: 0.28 },
        exitPoint: { x: 0, y: 0.34 }
      }]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}
