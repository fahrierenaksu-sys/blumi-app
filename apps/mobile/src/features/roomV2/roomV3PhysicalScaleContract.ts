import type { RoomFurnitureRotation } from "./roomV2.types"
import type { RoomV3UniversalCoreRuntimeCandidateId } from "./roomV3UniversalCoreCandidateIds"
import type { RoomV3Focus12QaCandidateId } from "./roomV3Focus12CandidateIds"

export type RoomV3PhysicalScaleCandidateId =
  | RoomV3UniversalCoreRuntimeCandidateId
  | RoomV3Focus12QaCandidateId

export const CANONICAL_ROOM_AVATAR_HEIGHT_METERS = 1.7 as const
export const CANONICAL_ROOM_AVATAR_RENDER_HEIGHT = 0.3 as const
const ROOM_HORIZONTAL_UNITS_PER_METER =
  CANONICAL_ROOM_AVATAR_RENDER_HEIGHT / CANONICAL_ROOM_AVATAR_HEIGHT_METERS
const ROOM_FLOOR_DEPTH_UNITS_PER_METER = 0.075
const ROOM_VERTICAL_UNITS_PER_METER = ROOM_HORIZONTAL_UNITS_PER_METER
const ROOM_PROJECTED_DEPTH_HEIGHT_UNITS_PER_METER = 0.055

export type RoomV3PhysicalFurnitureFamily =
  | "accent"
  | "armchair"
  | "bed"
  | "cabinet"
  | "chair"
  | "decor"
  | "divider"
  | "dresser"
  | "lamp"
  | "loveseat"
  | "mirror"
  | "plant"
  | "rug"
  | "shelf"
  | "sofa"
  | "storage"
  | "table"
  | "textile"

export interface RoomV3PhysicalScaleProfile {
  readonly family: RoomV3PhysicalFurnitureFamily
  readonly widthMeters: number
  readonly depthMeters: number
  readonly heightMeters: number
  readonly seatHeightMeters?: number
}

const physicalProfile = (
  family: RoomV3PhysicalFurnitureFamily,
  widthMeters: number,
  depthMeters: number,
  heightMeters: number,
  seatHeightMeters?: number
): RoomV3PhysicalScaleProfile =>
  Object.freeze({
    family,
    widthMeters,
    depthMeters,
    heightMeters,
    ...(seatHeightMeters === undefined ? {} : { seatHeightMeters })
  })

/**
 * Real-world dimensions for the locked My Room 2.5D scene. Values describe
 * the visible physical object, independently of source PNG canvas padding.
 * The canonical 1.70 m avatar is the single scale reference.
 */
export const ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID = Object.freeze({
  universal_petal_side_table_a: physicalProfile("table", 0.5, 0.5, 0.52),
  universal_cloud_loveseat_a: physicalProfile("loveseat", 1.65, 0.9, 0.88, 0.43),
  universal_orbit_floor_lamp_a: physicalProfile("lamp", 0.42, 0.42, 1.65),
  universal_tidy_work_desk_a: physicalProfile("table", 1.2, 0.6, 0.75),
  universal_arc_coffee_table_b: physicalProfile("table", 1.1, 0.6, 0.42),
  universal_cloud_accent_chair_b: physicalProfile("armchair", 0.82, 0.85, 0.88, 0.44),
  universal_round_dining_table_a: physicalProfile("table", 1.1, 1.1, 0.75),
  universal_soft_media_console_b: physicalProfile("cabinet", 1.5, 0.42, 0.58),
  universal_open_bookshelf_a: physicalProfile("shelf", 0.9, 0.35, 1.8),
  universal_table_lamp_a: physicalProfile("lamp", 0.32, 0.32, 0.55),
  universal_wall_clock_a: physicalProfile("decor", 0.45, 0.06, 0.45),
  universal_small_tabletop_plant_a: physicalProfile("plant", 0.28, 0.28, 0.4),
  universal_ceramic_vase_set_a: physicalProfile("decor", 0.35, 0.25, 0.4),
  universal_books_magazine_stack_a: physicalProfile("decor", 0.32, 0.24, 0.16),
  universal_tea_coffee_tray_a: physicalProfile("decor", 0.35, 0.3, 0.12),
  universal_dining_chair_a: physicalProfile("chair", 0.48, 0.55, 0.9, 0.46),
  universal_desk_chair_a: physicalProfile("chair", 0.62, 0.62, 1.05, 0.47),
  universal_bench_a: physicalProfile("chair", 1.2, 0.42, 0.48, 0.45),
  universal_soft_floor_cushion_a: physicalProfile("textile", 0.65, 0.65, 0.22),
  universal_pet_bed_a: physicalProfile("bed", 0.7, 0.55, 0.22),
  universal_nightstand_a: physicalProfile("cabinet", 0.5, 0.42, 0.58),
  universal_laundry_basket_a: physicalProfile("storage", 0.45, 0.45, 0.65),
  universal_cushion_set_a: physicalProfile("textile", 0.75, 0.55, 0.3),
  universal_vanity_table_a: physicalProfile("table", 1, 0.45, 0.75),
  universal_shoe_cabinet_a: physicalProfile("cabinet", 0.9, 0.35, 1.05),
  universal_long_sofa_a: physicalProfile("sofa", 2.25, 0.95, 0.9, 0.44),
  universal_lounge_armchair_a: physicalProfile("armchair", 0.9, 0.95, 0.9, 0.43),
  universal_cloud_bed_b: physicalProfile("bed", 1.65, 2.1, 1.05, 0.5),
  universal_rounded_wardrobe_a: physicalProfile("storage", 1.25, 0.6, 2),
  universal_soft_coat_stand_a: physicalProfile("storage", 0.5, 0.5, 1.75),
  universal_soft_pouf_b: physicalProfile("chair", 0.55, 0.55, 0.44, 0.42),
  universal_arch_wall_mirror_a: physicalProfile("mirror", 0.75, 0.06, 1.15),
  universal_storage_cabinet_a: physicalProfile("cabinet", 1, 0.45, 1.35),
  universal_dresser_a: physicalProfile("dresser", 1.2, 0.5, 0.82),
  universal_console_table_a: physicalProfile("table", 1.2, 0.35, 0.78),
  universal_large_standing_plant_a: physicalProfile("plant", 0.65, 0.65, 1.55),
  universal_wall_artwork_a: physicalProfile("decor", 1, 0.05, 0.7),
  universal_ceiling_light_a: physicalProfile("lamp", 0.55, 0.55, 0.3),
  universal_curtain_set_a: physicalProfile("textile", 0.8, 0.08, 0.95),
  universal_decorative_object_set_a: physicalProfile("decor", 0.35, 0.3, 0.35),
  universal_small_speaker_a: physicalProfile("accent", 0.25, 0.22, 0.4),
  universal_rug_a: physicalProfile("rug", 2, 1.4, 0.02),
  universal_full_length_mirror_a: physicalProfile("mirror", 0.55, 0.45, 1.7),
  universal_open_display_shelf_a: physicalProfile("shelf", 1, 0.35, 1.65),
  universal_room_divider_a: physicalProfile("divider", 1.5, 0.3, 1.8)
}) satisfies Readonly<
  Record<RoomV3UniversalCoreRuntimeCandidateId, RoomV3PhysicalScaleProfile>
>

export const ROOM_V3_FOCUS_12_PHYSICAL_SCALE_BY_CANDIDATE_ID = Object.freeze({
  universal_cloud_sectional_sofa_a: physicalProfile("sofa", 2.65, 2.05, 0.9, 0.44),
  universal_cozy_tv_media_unit_a: physicalProfile("cabinet", 1.8, 0.45, 0.62),
  universal_home_arcade_a: physicalProfile("accent", 0.78, 0.9, 1.75)
}) satisfies Readonly<
  Record<RoomV3Focus12QaCandidateId, RoomV3PhysicalScaleProfile>
>

export function getRoomV3PhysicalScaleProfile(
  candidateId: RoomV3PhysicalScaleCandidateId
): RoomV3PhysicalScaleProfile {
  return (
    ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID[
      candidateId as RoomV3UniversalCoreRuntimeCandidateId
    ] ??
    ROOM_V3_FOCUS_12_PHYSICAL_SCALE_BY_CANDIDATE_ID[
      candidateId as RoomV3Focus12QaCandidateId
    ]
  )
}

const roundScale = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10_000) / 10_000

const isSideRotation = (rotation: RoomFurnitureRotation): boolean =>
  rotation === "left" || rotation === "right"

export interface RoomV3NormalizedPhysicalFootprint {
  /** Width in canonical-avatar-height units. */
  readonly width: number
  /** Depth in canonical-avatar-height units. */
  readonly depth: number
}

export function getRoomV3NormalizedPhysicalFootprint(
  candidateId: RoomV3PhysicalScaleCandidateId,
  rotation: RoomFurnitureRotation
): RoomV3NormalizedPhysicalFootprint {
  const profile = getRoomV3PhysicalScaleProfile(candidateId)
  const widthMeters = isSideRotation(rotation)
    ? profile.depthMeters
    : profile.widthMeters
  const depthMeters = isSideRotation(rotation)
    ? profile.widthMeters
    : profile.depthMeters

  return Object.freeze({
    width: roundScale(widthMeters / CANONICAL_ROOM_AVATAR_HEIGHT_METERS),
    depth: roundScale(depthMeters / CANONICAL_ROOM_AVATAR_HEIGHT_METERS)
  })
}

export interface RoomV3ProjectedRenderSize {
  /** Visible horizontal span relative to the canonical avatar render height. */
  readonly widthInAvatarHeights: number
  /** Physical vertical span relative to the canonical avatar render height. */
  readonly heightInAvatarHeights: number
}

export function getRoomV3ProjectedRenderSize(
  candidateId: RoomV3PhysicalScaleCandidateId,
  rotation: RoomFurnitureRotation
): RoomV3ProjectedRenderSize {
  const profile = getRoomV3PhysicalScaleProfile(candidateId)
  const projectedWidthMeters = isSideRotation(rotation)
    ? profile.depthMeters
    : profile.widthMeters

  return Object.freeze({
    widthInAvatarHeights: roundScale(
      projectedWidthMeters / CANONICAL_ROOM_AVATAR_HEIGHT_METERS
    ),
    heightInAvatarHeights: roundScale(
      profile.heightMeters / CANONICAL_ROOM_AVATAR_HEIGHT_METERS
    )
  })
}

export interface RoomV3SceneSize {
  readonly width: number
  readonly height: number
}

/**
 * Converts declared real-world dimensions into the locked 2.5D room plane.
 * Horizontal, floor-depth and vertical axes intentionally use different
 * projection factors; treating a floor meter as a screen-height meter is what
 * previously made beds consume the room while sofas looked miniature.
 */
export function getRoomV3ScenePhysicalFootprint(
  candidateId: RoomV3PhysicalScaleCandidateId,
  rotation: RoomFurnitureRotation
): RoomV3SceneSize {
  const profile = getRoomV3PhysicalScaleProfile(candidateId)
  const side = isSideRotation(rotation)
  const widthMeters = side ? profile.depthMeters : profile.widthMeters
  const depthMeters = side ? profile.widthMeters : profile.depthMeters
  return Object.freeze({
    width: roundScale(widthMeters * ROOM_HORIZONTAL_UNITS_PER_METER),
    height: roundScale(depthMeters * ROOM_FLOOR_DEPTH_UNITS_PER_METER)
  })
}

export function getRoomV3SceneRenderSize(
  candidateId: RoomV3PhysicalScaleCandidateId,
  rotation: RoomFurnitureRotation
): RoomV3SceneSize {
  const profile = getRoomV3PhysicalScaleProfile(candidateId)
  const side = isSideRotation(rotation)
  const widthMeters = side ? profile.depthMeters : profile.widthMeters
  const projectedDepthMeters = side
    ? profile.widthMeters
    : profile.depthMeters
  return Object.freeze({
    width: roundScale(widthMeters * ROOM_HORIZONTAL_UNITS_PER_METER),
    height: roundScale(
      profile.heightMeters * ROOM_VERTICAL_UNITS_PER_METER +
      projectedDepthMeters * ROOM_PROJECTED_DEPTH_HEIGHT_UNITS_PER_METER
    )
  })
}
