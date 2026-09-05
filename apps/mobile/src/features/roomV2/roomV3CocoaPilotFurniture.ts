import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomV2AssetRef
} from "./roomV2.types"

export type CocoaPilotDirectionalAssets = Record<
  RoomFurnitureRotation,
  RoomV2AssetRef
>

// These are calibration inputs for the actual Room V2 scale/collision/sitting
// trial. They deliberately remain outside the user-visible catalog until the
// runtime and Simulator evidence gates are completed.
export function createCocoaDiningChairDPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaDiningChairPilot({
    id: "cocoa_dining_chair_d",
    name: "Cocoa Crest Dining Chair",
    assets
  })
}

export function createCocoaNavyDiningChairAPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaDiningChairPilot({
    id: "cocoa_navy_dining_chair_a",
    name: "Cocoa Navy Crest Dining Chair A",
    assets
  })
}

export function createCocoaNavyDiningChairBPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaDiningChairPilot({
    id: "cocoa_navy_dining_chair_b",
    name: "Cocoa Navy Loop Dining Chair B",
    assets
  })
}

function createCocoaDiningChairPilot(input: {
  id: string
  name: string
  assets: CocoaPilotDirectionalAssets
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: input.assets.front,
    assetsByRotation: { ...input.assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "cocoa_navy_modern_studio",
    homeTheme: "cocoa_navy_modern_studio",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.2,
    height: 0.22,
    anchor: { x: 0.5, y: 1 },
    footprint: { width: 0.105, height: 0.075 },
    footprintByRotation: {
      front: { width: 0.105, height: 0.075 },
      back: { width: 0.105, height: 0.075 },
      left: { width: 0.075, height: 0.105 },
      right: { width: 0.075, height: 0.105 }
    },
    blocksMovement: true,
    interactionType: "seat",
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "primary",
          x: 0,
          y: -0.38,
          seatHeight: 0.083,
          facing: "front",
          approachPoint: { x: 0, y: 0.27 },
          exitPoint: { x: 0, y: 0.32 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

export function createCocoaLoungeArmchairBPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaLoungeArmchairPilot({
    id: "cocoa_lounge_armchair_b",
    name: "Cocoa Crest Lounge Armchair",
    assets
  })
}

/**
 * The renamed Cocoa Navy themed-wave pilot keeps the same calibrated seat
 * contract while binding to the active candidate ID and v2 grounded assets.
 * It is still a candidate and must not enter the user-visible catalog until
 * live Room V2 fit, collision, sitting, and Simulator evidence pass.
 */
export function createCocoaNavyLoungeArmchairBPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaLoungeArmchairPilot({
    id: "cocoa_navy_lounge_armchair_b",
    name: "Cocoa Navy Frame Lounge Armchair",
    assets
  })
}

/**
 * The A lounge variant shares the calibrated floor, footprint, and one-seat
 * semantics with the B variant but remains a distinct catalog candidate.
 * Keeping the contract in one helper prevents a visual variant from silently
 * losing its seat approach/exit rules.
 */
export function createCocoaNavyLoungeArmchairAPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaLoungeArmchairPilot({
    id: "cocoa_navy_lounge_armchair_a",
    name: "Cocoa Navy Frame Lounge Armchair A",
    assets
  })
}

/**
 * The Cocoa Navy dining-table B pilot explicitly declares its tabletop
 * support so clock/tabletop semantics never get inferred from a broad table
 * category. The support bounds still need live Room V2 fit evidence.
 */
export function createCocoaNavyDiningTableBPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaDiningTablePilot({
    id: "cocoa_navy_dining_table_b",
    name: "Cocoa Navy Round Dining Table",
    assets
  })
}

export function createCocoaNavyDiningTableAPilot(
  assets: CocoaPilotDirectionalAssets
): FurnitureItem {
  return createCocoaDiningTablePilot({
    id: "cocoa_navy_dining_table_a",
    name: "Cocoa Navy Oval Dining Table A",
    assets
  })
}

function createCocoaDiningTablePilot(input: {
  id: string
  name: string
  assets: CocoaPilotDirectionalAssets
}): FurnitureItem {
  const tabletopBounds = {
    minX: 0.16,
    maxX: 0.84,
    minY: 0.18,
    maxY: 0.4
  }
  return {
    id: input.id,
    name: input.name,
    asset: input.assets.front,
    assetsByRotation: { ...input.assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "cocoa_navy_modern_studio",
    homeTheme: "cocoa_navy_modern_studio",
    category: "table",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.3,
    height: 0.24,
    anchor: { x: 0.5, y: 1 },
    anchorByRotation: {
      front: { x: 0.5, y: 1 },
      back: { x: 0.5, y: 1 },
      left: { x: 0.5, y: 1 },
      right: { x: 0.5, y: 1 }
    },
    footprint: { width: 0.3, height: 0.18 },
    footprintByRotation: {
      front: { width: 0.3, height: 0.18 },
      back: { width: 0.3, height: 0.18 },
      left: { width: 0.18, height: 0.3 },
      right: { width: 0.18, height: 0.3 }
    },
    surfaceSupports: [
      {
        surface: "tabletop",
        localBounds: tabletopBounds,
        localBoundsByRotation: {
          front: tabletopBounds,
          back: tabletopBounds,
          left: tabletopBounds,
          right: tabletopBounds
        }
      }
    ],
    blocksMovement: true,
    interactionType: "none",
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}

function createCocoaLoungeArmchairPilot(input: {
  id: string
  name: string
  assets: CocoaPilotDirectionalAssets
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: input.assets.front,
    assetsByRotation: { ...input.assets },
    rotationPolicy: "directional_assets_required",
    collectionId: "cocoa_navy_modern_studio",
    homeTheme: "cocoa_navy_modern_studio",
    category: "seating",
    layer: "furniture",
    placementSurface: "floor",
    width: 0.28,
    height: 0.24,
    anchor: { x: 0.5, y: 1 },
    anchorByRotation: {
      front: { x: 0.5, y: 1 },
      back: { x: 0.5, y: 1 },
      left: { x: 0.5, y: 1 },
      right: { x: 0.5, y: 1 }
    },
    footprint: { width: 0.15, height: 0.1 },
    footprintByRotation: {
      front: { width: 0.15, height: 0.1 },
      back: { width: 0.15, height: 0.1 },
      left: { width: 0.1, height: 0.15 },
      right: { width: 0.1, height: 0.15 }
    },
    blocksMovement: true,
    interactionType: "seat",
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "primary",
          x: 0,
          y: -0.34,
          seatHeight: 0.09,
          facing: "front",
          approachPoint: { x: 0, y: 0.29 },
          exitPoint: { x: 0, y: 0.34 }
        }
      ]
    },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}
