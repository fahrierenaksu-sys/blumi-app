import {
  ROOM_V3_FURNITURE_CATEGORIES,
  type RoomV3FurnitureCategoryPlan
} from "./roomV3ProductionPlan"
import {
  ROOM_V3_FURNITURE_PILOT_CANDIDATES,
  validateRoomV3FurnitureCandidate,
  type RoomV3FurniturePilotCandidateId
} from "./roomV3FurnitureCandidateGate"

/**
 * Canonical category mapping for the active neutral wave. Keeping this map
 * explicit prevents a display label from silently changing inventory counts.
 */
export const ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID: Partial<
  Record<RoomV3FurniturePilotCandidateId, string>
> = {
  universal_petal_side_table_a: "side_table",
  universal_cloud_loveseat_a: "loveseat",
  universal_orbit_floor_lamp_a: "floor_lamp",
  universal_tidy_work_desk_a: "work_desk",
  universal_arc_coffee_table_b: "coffee_table",
  universal_cloud_accent_chair_b: "accent_chair",
  universal_round_dining_table_a: "dining_table",
  universal_soft_media_console_b: "media_console",
  universal_open_bookshelf_a: "bookshelf",
  universal_table_lamp_a: "table_lamp",
  universal_wall_clock_a: "wall_clock",
  universal_small_tabletop_plant_a: "small_tabletop_plant",
  universal_ceramic_vase_set_a: "ceramic_vase_set",
  universal_books_magazine_stack_a: "books_magazine_stack",
  universal_tea_coffee_tray_a: "tea_coffee_tray",
  universal_dining_chair_a: "dining_chair",
  universal_desk_chair_a: "desk_chair",
  universal_bench_a: "bench",
  universal_soft_floor_cushion_a: "soft_floor_cushion",
  universal_pet_bed_a: "pet_bed",
  universal_nightstand_a: "nightstand",
  universal_laundry_basket_a: "laundry_basket",
  universal_cushion_set_a: "cushion_set",
  universal_vanity_table_a: "vanity_table",
  universal_shoe_cabinet_a: "shoe_cabinet",
  universal_long_sofa_a: "long_sofa",
  universal_lounge_armchair_a: "lounge_armchair",
  universal_cloud_bed_b: "double_bed",
  universal_rounded_wardrobe_a: "wardrobe",
  universal_soft_media_console_a: "media_console",
  universal_soft_coat_stand_a: "coat_stand",
  universal_soft_pouf_b: "ottoman_pouf",
  universal_arch_wall_mirror_a: "wall_mirror",
  universal_storage_cabinet_a: "storage_cabinet",
  universal_dresser_a: "dresser",
  universal_console_table_a: "console_table",
  universal_large_standing_plant_a: "large_standing_plant",
  universal_wall_artwork_a: "wall_artwork",
  universal_ceiling_light_a: "ceiling_light",
  universal_curtain_set_a: "curtain_set",
  universal_decorative_object_set_a: "decorative_object_set",
  universal_small_speaker_a: "small_speaker",
  universal_rug_a: "rug",
  universal_full_length_mirror_a: "full_length_mirror",
  universal_open_display_shelf_a: "open_display_shelf",
  universal_room_divider_a: "room_divider"
}

export interface RoomV3UniversalCoreInventoryStatus {
  totalCategoryCount: number
  candidateRecordCount: number
  alternateCandidateCount: number
  alternateCandidateIds: string[]
  representedCategoryCount: number
  missingCategoryIds: string[]
  duplicateCategoryIds: string[]
  candidateIdsByCategory: Record<string, string[]>
  blockedCandidateCount: number
  runtimeReadyCandidateCount: number
}

export function getRoomV3UniversalCoreInventoryStatus(
  input: {
    categories?: readonly RoomV3FurnitureCategoryPlan[]
    candidates?: typeof ROOM_V3_FURNITURE_PILOT_CANDIDATES
  } = {}
): RoomV3UniversalCoreInventoryStatus {
  const categories = input.categories ?? ROOM_V3_FURNITURE_CATEGORIES
  const allCandidates = (input.candidates ?? ROOM_V3_FURNITURE_PILOT_CANDIDATES).filter(
    (candidate) => candidate.homeTheme === "universal_core"
  )
  const alternateCandidateIds = allCandidates
    .filter((candidate) => candidate.id === "universal_soft_media_console_a")
    .map((candidate) => candidate.id)
  const candidates = allCandidates.filter(
    (candidate) => !alternateCandidateIds.includes(candidate.id)
  )
  const candidateIdsByCategory = Object.fromEntries(
    categories.map((category) => [category.id, [] as string[]])
  ) as Record<string, string[]>

  for (const candidate of candidates) {
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[candidate.id]
    if (!categoryId) continue
    candidateIdsByCategory[categoryId] ??= []
    candidateIdsByCategory[categoryId].push(candidate.id)
  }

  const missingCategoryIds = categories
    .map((category) => category.id)
    .filter((categoryId) => candidateIdsByCategory[categoryId]?.length === 0)
  const duplicateCategoryIds = categories
    .map((category) => category.id)
    .filter((categoryId) => (candidateIdsByCategory[categoryId]?.length ?? 0) > 1)
  const validations = candidates.map(validateRoomV3FurnitureCandidate)

  return {
    totalCategoryCount: categories.length,
    candidateRecordCount: candidates.length,
    alternateCandidateCount: alternateCandidateIds.length,
    alternateCandidateIds,
    representedCategoryCount: categories.length - missingCategoryIds.length,
    missingCategoryIds,
    duplicateCategoryIds,
    candidateIdsByCategory,
    blockedCandidateCount: validations.filter((validation) => !validation.isReadyForRuntime)
      .length,
    runtimeReadyCandidateCount: validations.filter((validation) => validation.isReadyForRuntime)
      .length
  }
}
