import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomV2AssetRef
} from "./roomV2.types"

export type Focus12DirectionalAssets = Record<RoomFurnitureRotation, RoomV2AssetRef>

/**
 * Product-owner-selected Universal Core subset for the furniture-first wave.
 * This intentionally is not a production catalog: the new art stays a draft
 * until the normal visual, placement, collision and Simulator gates approve it.
 */
export const FOCUS_12_FURNITURE_IDS = [
  "universal_cloud_sectional_sofa_a",
  "universal_long_sofa_a",
  "universal_cloud_loveseat_a",
  "universal_lounge_armchair_a",
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_round_dining_table_a",
  "universal_tidy_work_desk_a",
  "universal_arc_coffee_table_b",
  "universal_petal_side_table_a",
  "universal_cozy_tv_media_unit_a",
  "universal_home_arcade_a"
] as const

export function createFocus12SectionalDraft(
  assets: Focus12DirectionalAssets
): FurnitureItem {
  return {
    ...createDirectionalFloorDraft({
      id: "universal_cloud_sectional_sofa_a",
      name: "Cloud L-Shaped Sectional",
      category: "seating",
      assets,
      width: 0.38,
      height: 0.24,
      // The painted silhouette carries a soft outer shadow. The prior
      // collision box included that empty halo and sealed the room's avatar
      // spawn lane whenever the Focus12 trio was arranged together.
      frontFootprint: { width: 0.22, height: 0.13 },
      sideFootprint: { width: 0.13, height: 0.22 }
    }),
    // This furniture-first wave intentionally does not ship sitting. Keeping
    // the sectional as decor prevents the generic seat system from placing an
    // avatar over an unsplit asset before body-fit and occlusion QA exist.
    interactionType: "decor"
  }
}

export function createFocus12TvMediaUnitDraft(
  assets: Focus12DirectionalAssets
): FurnitureItem {
  return createDirectionalFloorDraft({
    id: "universal_cozy_tv_media_unit_a",
    name: "Cozy TV Media Unit",
    category: "misc",
    assets,
    width: 0.3,
    height: 0.26,
    frontFootprint: { width: 0.23, height: 0.085 },
    sideFootprint: { width: 0.085, height: 0.23 }
  })
}

export function createFocus12ArcadeDraft(
  assets: Focus12DirectionalAssets
): FurnitureItem {
  return createDirectionalFloorDraft({
    id: "universal_home_arcade_a",
    name: "Home Arcade Cabinet",
    category: "misc",
    assets,
    width: 0.13,
    height: 0.29,
    frontFootprint: { width: 0.09, height: 0.075 },
    sideFootprint: { width: 0.075, height: 0.09 }
  })
}

function createDirectionalFloorDraft(input: {
  id: string
  name: string
  category: FurnitureItem["category"]
  assets: Focus12DirectionalAssets
  width: number
  height: number
  frontFootprint: { width: number; height: number }
  sideFootprint: { width: number; height: number }
}): FurnitureItem {
  return {
    id: input.id,
    name: input.name,
    asset: { ...input.assets.front },
    assetsByRotation: {
      front: { ...input.assets.front },
      back: { ...input.assets.back },
      left: { ...input.assets.left },
      right: { ...input.assets.right }
    },
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
    blocksMovement: true,
    interactionType: "decor",
    sourceStatus: "candidate",
    qaStatus: "pending"
  }
}
