import type { EconomyCatalogItem } from "./economyCatalog"

/**
 * Shared ownership boundary for the 45-piece neutral home wave. Mobile art,
 * Shop pricing, and the server purchase endpoint must all use this exact set.
 */
export const UNIVERSAL_CORE_ROOM_ITEM_IDS = [
  "universal_petal_side_table_a",
  "universal_cloud_loveseat_a",
  "universal_orbit_floor_lamp_a",
  "universal_tidy_work_desk_a",
  "universal_arc_coffee_table_b",
  "universal_cloud_accent_chair_b",
  "universal_round_dining_table_a",
  "universal_soft_media_console_b",
  "universal_open_bookshelf_a",
  "universal_table_lamp_a",
  "universal_wall_clock_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_bench_a",
  "universal_soft_floor_cushion_a",
  "universal_pet_bed_a",
  "universal_nightstand_a",
  "universal_laundry_basket_a",
  "universal_cushion_set_a",
  "universal_vanity_table_a",
  "universal_shoe_cabinet_a",
  "universal_long_sofa_a",
  "universal_lounge_armchair_a",
  "universal_cloud_bed_b",
  "universal_rounded_wardrobe_a",
  "universal_soft_coat_stand_a",
  "universal_soft_pouf_b",
  "universal_arch_wall_mirror_a",
  "universal_storage_cabinet_a",
  "universal_dresser_a",
  "universal_console_table_a",
  "universal_large_standing_plant_a",
  "universal_wall_artwork_a",
  "universal_ceiling_light_a",
  "universal_curtain_set_a",
  "universal_decorative_object_set_a",
  "universal_small_speaker_a",
  "universal_rug_a",
  "universal_full_length_mirror_a",
  "universal_open_display_shelf_a",
  "universal_room_divider_a"
] as const

export type UniversalCoreRoomItemId =
  (typeof UNIVERSAL_CORE_ROOM_ITEM_IDS)[number]

export const UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION =
  "room-v3-universal-core-promotion-v2"

export const UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID =
  "room-v3-evidence-files-sha256-v1"

export const UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID =
  "room-v3-universal-core-artifact-manifest-2026-07-18"

export const UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST =
  "sha256:1f7079f1b4259cbc8d792028cb94cd7a445bf6c97ecebe3f899ad5c3c702aadc"

export interface UniversalCoreRoomPromotionRecord {
  readonly schemaVersion: string
  readonly buildIdentity: string
  readonly evidenceManifestId: string
  readonly evidenceVerifierId: string
  readonly evidenceBundleSha256: string
  readonly artifactManifestId: string
  readonly candidateSetDigest: string
  readonly approvedItemIds: readonly string[]
}

const roomCandidate = (
  itemId: UniversalCoreRoomItemId,
  title: string,
  priceCoins: number
): EconomyCatalogItem => ({
  itemId,
  type: "room",
  title,
  priceCoins
})

/**
 * Product-ready pricing is prepared ahead of launch but is not part of the
 * live economy catalog until one complete immutable promotion record approves
 * the whole evidence-bound wave.
 */
export const UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES: readonly EconomyCatalogItem[] = [
  roomCandidate("universal_petal_side_table_a", "Petal Side Table", 220),
  roomCandidate("universal_cloud_loveseat_a", "Cloud Loveseat", 520),
  roomCandidate("universal_orbit_floor_lamp_a", "Orbit Floor Lamp", 280),
  roomCandidate("universal_tidy_work_desk_a", "Tidy Work Desk", 420),
  roomCandidate("universal_arc_coffee_table_b", "Arc Coffee Table", 320),
  roomCandidate("universal_cloud_accent_chair_b", "Cloud Accent Chair", 340),
  roomCandidate("universal_round_dining_table_a", "Universal Round Dining Table", 440),
  roomCandidate("universal_soft_media_console_b", "Soft Media Console", 420),
  roomCandidate("universal_open_bookshelf_a", "Open Display Bookshelf", 440),
  roomCandidate("universal_table_lamp_a", "Cloud Table Lamp", 170),
  roomCandidate("universal_wall_clock_a", "Pale Ash Wall Clock", 160),
  roomCandidate("universal_small_tabletop_plant_a", "Cloud Pot Plant", 120),
  roomCandidate("universal_ceramic_vase_set_a", "Neutral Ceramic Vase Set", 140),
  roomCandidate("universal_books_magazine_stack_a", "Quiet Book Stack", 100),
  roomCandidate("universal_tea_coffee_tray_a", "Neutral Tea Tray", 130),
  roomCandidate("universal_dining_chair_a", "Cloud Dining Chair", 240),
  roomCandidate("universal_desk_chair_a", "Quiet Desk Chair", 260),
  roomCandidate("universal_bench_a", "Soft Universal Bench", 330),
  roomCandidate("universal_soft_floor_cushion_a", "Soft Floor Cushion", 140),
  roomCandidate("universal_pet_bed_a", "Soft Pet Bed", 180),
  roomCandidate("universal_nightstand_a", "Quiet Nightstand", 240),
  roomCandidate("universal_laundry_basket_a", "Soft Laundry Basket", 150),
  roomCandidate("universal_cushion_set_a", "Cloud Cushion Set", 130),
  roomCandidate("universal_vanity_table_a", "Quiet Vanity Table", 390),
  roomCandidate("universal_shoe_cabinet_a", "Soft Shoe Cabinet", 340),
  roomCandidate("universal_long_sofa_a", "Cloud Long Sofa", 590),
  roomCandidate("universal_lounge_armchair_a", "Cloud Lounge Armchair", 360),
  roomCandidate("universal_cloud_bed_b", "Cloud Double Bed", 650),
  roomCandidate("universal_rounded_wardrobe_a", "Rounded Wardrobe", 620),
  roomCandidate("universal_soft_coat_stand_a", "Soft Coat Stand", 230),
  roomCandidate("universal_soft_pouf_b", "Soft Neutral Pouf", 210),
  roomCandidate("universal_arch_wall_mirror_a", "Rounded Arch Wall Mirror", 240),
  roomCandidate("universal_storage_cabinet_a", "Storage Cabinet", 460),
  roomCandidate("universal_dresser_a", "Soft-Neutral Dresser", 430),
  roomCandidate("universal_console_table_a", "Universal Console Table", 350),
  roomCandidate("universal_large_standing_plant_a", "Large Standing Plant", 240),
  roomCandidate("universal_wall_artwork_a", "Sage Cloud Wall Artwork", 180),
  roomCandidate("universal_ceiling_light_a", "Cloud Halo Ceiling Light", 260),
  roomCandidate("universal_curtain_set_a", "Cloud Window Curtain Set", 280),
  roomCandidate(
    "universal_decorative_object_set_a",
    "Neutral Decorative Object Set",
    150
  ),
  roomCandidate("universal_small_speaker_a", "Quiet Floor Speaker", 280),
  roomCandidate("universal_rug_a", "Soft Neutral Oval Rug", 260),
  roomCandidate(
    "universal_full_length_mirror_a",
    "Soft Arch Full-Length Mirror",
    300
  ),
  roomCandidate("universal_open_display_shelf_a", "Open Display Shelf", 380),
  roomCandidate("universal_room_divider_a", "Soft Panel Room Divider", 400)
]

/**
 * Intentionally empty until the 45-SKU live evidence manifest is bound to an
 * immutable build. Both mobile visibility and server purchases must stay
 * closed while this record is null.
 */
export const UNIVERSAL_CORE_ROOM_PROMOTION_RECORD:
  UniversalCoreRoomPromotionRecord | null = null

export function resolvePromotedUniversalCoreRoomEconomyItems(
  record: UniversalCoreRoomPromotionRecord | null =
    UNIVERSAL_CORE_ROOM_PROMOTION_RECORD
): EconomyCatalogItem[] {
  if (!isCompleteUniversalCoreRoomPromotionRecord(record)) return []

  return UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.map((item) => ({ ...item }))
}

function isCompleteUniversalCoreRoomPromotionRecord(
  record: UniversalCoreRoomPromotionRecord | null
): record is UniversalCoreRoomPromotionRecord {
  if (
    !record ||
    typeof record !== "object" ||
    record.schemaVersion !== UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION ||
    !isImmutableGitBuildIdentity(record.buildIdentity) ||
    !hasText(record.evidenceManifestId) ||
    record.evidenceVerifierId !== UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID ||
    !isSha256Digest(record.evidenceBundleSha256) ||
    record.artifactManifestId !== UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID ||
    record.candidateSetDigest !== UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST ||
    !Array.isArray(record.approvedItemIds) ||
    record.approvedItemIds.length !== UNIVERSAL_CORE_ROOM_ITEM_IDS.length
  ) {
    return false
  }

  const expectedIds = new Set<string>(UNIVERSAL_CORE_ROOM_ITEM_IDS)
  const approvedIds = new Set(record.approvedItemIds)
  return (
    approvedIds.size === expectedIds.size &&
    record.approvedItemIds.every((itemId) => expectedIds.has(itemId))
  )
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isImmutableGitBuildIdentity(value: unknown): value is string {
  return typeof value === "string" && /^git:[0-9a-f]{40}$/.test(value)
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value)
}
