import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomV2AssetRef
} from "./roomV2.types"
import {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION
} from "./roomV3UniversalCoreArtifactRegistry"
import {
  createUniversalArcCoffeeTableBPilot,
  createUniversalBenchAPilot,
  createUniversalCloudAccentChairBPilot,
  createUniversalCloudBedBPilot,
  createUniversalCloudLoveseatAPilot,
  createUniversalConsoleTableAPilot,
  createUniversalDiningChairAPilot,
  createUniversalDeskChairAPilot,
  createUniversalDresserAPilot,
  createUniversalLaundryBasketAPilot,
  createUniversalLargeStandingPlantAPilot,
  createUniversalLongSofaAPilot,
  createUniversalLoungeArmchairAPilot,
  createUniversalNightstandAPilot,
  createUniversalOrbitFloorLampAPilot,
  createUniversalPetalSideTableAPilot,
  createUniversalPetBedAPilot,
  createUniversalRoundedWardrobeAPilot,
  createUniversalRoundDiningTableAPilot,
  createUniversalShoeCabinetAPilot,
  createUniversalSoftCoatStandAPilot,
  createUniversalSoftFloorCushionAPilot,
  createUniversalSoftMediaConsoleAPilot,
  createUniversalSoftPoufBPilot,
  createUniversalStorageCabinetAPilot,
  createUniversalTidyWorkDeskAPilot,
  createUniversalVanityTableAPilot
} from "./roomV3UniversalCorePilotFurniture"
import {
  createUniversalArchWallMirrorAPilot,
  createUniversalBooksMagazineStackAPilot,
  createUniversalCeramicVaseSetAPilot,
  createUniversalCeilingLightAPilot,
  createUniversalCushionSetAPilot,
  createUniversalCurtainSetAPilot,
  createUniversalDecorativeObjectSetAPilot,
  createUniversalFullLengthMirrorAPilot,
  createUniversalOpenDisplayShelfAPilot,
  createUniversalRoomDividerAPilot,
  createUniversalRugAPilot,
  createUniversalSmallSpeakerAPilot,
  createUniversalSmallTabletopPlantAPilot,
  createUniversalTableLampAPilot,
  createUniversalTeaCoffeeTrayAPilot,
  createUniversalWallArtworkAPilot,
  createUniversalWallClockAPilot
} from "./roomV3UniversalCoreSurfacePilotFurniture"
import {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreRuntimeCandidateId
} from "./roomV3UniversalCoreCandidateIds"
import {
  CANONICAL_ROOM_AVATAR_HEIGHT_METERS,
  CANONICAL_ROOM_AVATAR_RENDER_HEIGHT,
  getRoomV3PhysicalScaleProfile,
  type RoomV3PhysicalScaleCandidateId,
  getRoomV3ScenePhysicalFootprint,
  getRoomV3SceneRenderSize
} from "./roomV3PhysicalScaleContract"
export { ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID } from "./roomV3UniversalCoreArtifactRegistry"

export {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  type RoomV3UniversalCoreRuntimeCandidateId
} from "./roomV3UniversalCoreCandidateIds"

export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID =
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION

const REQUIRED_DIRECTIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

/** No canonical floor products remain front-only after the completed direction wave. */
export const ROOM_V3_UNIVERSAL_CORE_RUNTIME_INCOMPLETE_DIRECTIONAL_IDS = [] as const

export interface RoomV3UniversalCoreTrustedArtifactRegistry {
  verifierId: string
  artifactManifestId: string
  verifiedCandidateIds: readonly RoomV3UniversalCoreRuntimeCandidateId[]
  verifiedAssetHashesByCandidateId: Readonly<
    Record<string, Partial<Record<RoomFurnitureRotation, string>>>
  >
}

type UniversalCoreAssetBundle = Partial<
  Record<RoomFurnitureRotation, RoomV2AssetRef>
> & { front: RoomV2AssetRef }
type UniversalCoreDirectionalAssetBundle = Record<
  RoomFurnitureRotation,
  RoomV2AssetRef
>
type AssetFactory = () => UniversalCoreAssetBundle | RoomV2AssetRef
type ItemFactory = (assets: UniversalCoreAssetBundle) => FurnitureItem | null

const STATIC_SURFACE_CANDIDATE_IDS = new Set<RoomV3UniversalCoreRuntimeCandidateId>([
  "universal_table_lamp_a",
  "universal_wall_clock_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_arch_wall_mirror_a",
  "universal_wall_artwork_a",
  "universal_ceiling_light_a",
  "universal_curtain_set_a",
  "universal_decorative_object_set_a",
  "universal_cushion_set_a",
])

const ASSET_FACTORIES: Record<string, AssetFactory> = {
  universal_petal_side_table_a: () => ({
    front: assetRef("universal_petal_side_table_a_front_runtime_v1.png", require("./assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_front_runtime_v1.png")),
    back: assetRef("universal_petal_side_table_a_back_runtime_v1.png", require("./assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_back_runtime_v1.png")),
    left: assetRef("universal_petal_side_table_a_left_runtime_v1.png", require("./assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_left_runtime_v1.png")),
    right: assetRef("universal_petal_side_table_a_right_runtime_v1.png", require("./assets/runtime/candidates/universal_petal_side_table_a/universal_petal_side_table_a_right_runtime_v1.png"))
  }),
  universal_cloud_loveseat_a: () => ({
    front: assetRef("universal_cloud_loveseat_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_front_runtime_v2.png")),
    back: assetRef("universal_cloud_loveseat_a_back_runtime_v1.png", require("./assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_back_runtime_v1.png")),
    left: assetRef("universal_cloud_loveseat_a_left_runtime_v1.png", require("./assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_left_runtime_v1.png")),
    right: assetRef("universal_cloud_loveseat_a_right_runtime_v1.png", require("./assets/runtime/candidates/universal_cloud_loveseat_a/universal_cloud_loveseat_a_right_runtime_v1.png"))
  }),
  universal_orbit_floor_lamp_a: () => ({
    front: assetRef("universal_orbit_floor_lamp_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_front_runtime_v2.png")),
    back: assetRef("universal_orbit_floor_lamp_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_back_runtime_v2.png")),
    left: assetRef("universal_orbit_floor_lamp_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_left_runtime_v2.png")),
    right: assetRef("universal_orbit_floor_lamp_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_orbit_floor_lamp_a/universal_orbit_floor_lamp_a_right_runtime_v2.png"))
  }),
  universal_tidy_work_desk_a: () => ({
    front: assetRef("universal_tidy_work_desk_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_front_runtime_v2.png")),
    back: assetRef("universal_tidy_work_desk_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_back_runtime_v2.png")),
    left: assetRef("universal_tidy_work_desk_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_left_runtime_v2.png")),
    right: assetRef("universal_tidy_work_desk_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_tidy_work_desk_a/universal_tidy_work_desk_a_right_runtime_v2.png"))
  }),
  universal_arc_coffee_table_b: () => ({
    front: assetRef("universal_arc_coffee_table_b_front_runtime_v1.png", require("./assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_front_runtime_v1.png")),
    back: assetRef("universal_arc_coffee_table_b_back_runtime_v1.png", require("./assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_back_runtime_v1.png")),
    left: assetRef("universal_arc_coffee_table_b_left_runtime_v1.png", require("./assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_left_runtime_v1.png")),
    right: assetRef("universal_arc_coffee_table_b_right_runtime_v1.png", require("./assets/runtime/candidates/universal_arc_coffee_table_b/universal_arc_coffee_table_b_right_runtime_v1.png"))
  }),
  universal_cloud_accent_chair_b: () => ({
    front: assetRef("universal_cloud_accent_chair_b_front_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_front_runtime_v2.png")),
    back: assetRef("universal_cloud_accent_chair_b_back_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_back_runtime_v2.png")),
    left: assetRef("universal_cloud_accent_chair_b_left_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_left_runtime_v2.png")),
    right: assetRef("universal_cloud_accent_chair_b_right_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_accent_chair_b/universal_cloud_accent_chair_b_right_runtime_v2.png"))
  }),
  universal_round_dining_table_a: () => ({
    front: assetRef("universal_round_dining_table_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_front_runtime_v2.png")),
    back: assetRef("universal_round_dining_table_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_back_runtime_v2.png")),
    left: assetRef("universal_round_dining_table_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_left_runtime_v2.png")),
    right: assetRef("universal_round_dining_table_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_round_dining_table_a/universal_round_dining_table_a_right_runtime_v2.png"))
  }),
  universal_soft_media_console_b: () => ({
    front: assetRef("universal_soft_media_console_b_front_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_front_runtime_v2.png")),
    back: assetRef("universal_soft_media_console_b_back_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_back_runtime_v2.png")),
    left: assetRef("universal_soft_media_console_b_left_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_left_runtime_v2.png")),
    right: assetRef("universal_soft_media_console_b_right_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_media_console_b/universal_soft_media_console_b_right_runtime_v2.png"))
  }),
  universal_open_bookshelf_a: () => ({
    front: assetRef("universal_open_bookshelf_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_front_runtime_v2.png")),
    back: assetRef("universal_open_bookshelf_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_back_runtime_v2.png")),
    left: assetRef("universal_open_bookshelf_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_left_runtime_v2.png")),
    right: assetRef("universal_open_bookshelf_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_open_bookshelf_a/universal_open_bookshelf_a_right_runtime_v2.png"))
  }),
  universal_dining_chair_a: () => ({
    front: assetRef("universal_dining_chair_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_dining_chair_a/universal_dining_chair_a_front_runtime_v2.png")),
    back: assetRef("universal_dining_chair_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_dining_chair_a/universal_dining_chair_a_back_runtime_v2.png")),
    left: assetRef("universal_dining_chair_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_dining_chair_a/universal_dining_chair_a_left_runtime_v2.png")),
    right: assetRef("universal_dining_chair_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_dining_chair_a/universal_dining_chair_a_right_runtime_v2.png"))
  }),
  universal_desk_chair_a: () => ({
    front: assetRef("universal_desk_chair_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_desk_chair_a/universal_desk_chair_a_front_runtime_v2.png")),
    back: assetRef("universal_desk_chair_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_desk_chair_a/universal_desk_chair_a_back_runtime_v2.png")),
    left: assetRef("universal_desk_chair_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_desk_chair_a/universal_desk_chair_a_left_runtime_v2.png")),
    right: assetRef("universal_desk_chair_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_desk_chair_a/universal_desk_chair_a_right_runtime_v2.png"))
  }),
  universal_bench_a: () => ({
    front: assetRef("universal_bench_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_bench_a/universal_bench_a_front_runtime_v2.png")),
    back: assetRef("universal_bench_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_bench_a/universal_bench_a_back_runtime_v2.png")),
    left: assetRef("universal_bench_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_bench_a/universal_bench_a_left_runtime_v2.png")),
    right: assetRef("universal_bench_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_bench_a/universal_bench_a_right_runtime_v2.png"))
  }),
  universal_soft_floor_cushion_a: () => ({
    front: assetRef("universal_soft_floor_cushion_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_floor_cushion_a/universal_soft_floor_cushion_a_front_runtime_v2.png")),
    back: assetRef("universal_soft_floor_cushion_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_floor_cushion_a/universal_soft_floor_cushion_a_back_runtime_v2.png")),
    left: assetRef("universal_soft_floor_cushion_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_floor_cushion_a/universal_soft_floor_cushion_a_left_runtime_v2.png")),
    right: assetRef("universal_soft_floor_cushion_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_floor_cushion_a/universal_soft_floor_cushion_a_right_runtime_v2.png"))
  }),
  universal_pet_bed_a: () => ({
    front: assetRef("universal_pet_bed_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_pet_bed_a/universal_pet_bed_a_front_runtime_v2.png")),
    back: assetRef("universal_pet_bed_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_pet_bed_a/universal_pet_bed_a_back_runtime_v2.png")),
    left: assetRef("universal_pet_bed_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_pet_bed_a/universal_pet_bed_a_left_runtime_v2.png")),
    right: assetRef("universal_pet_bed_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_pet_bed_a/universal_pet_bed_a_right_runtime_v2.png"))
  }),
  universal_long_sofa_a: () => ({
    front: assetRef("universal_long_sofa_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_long_sofa_a/universal_long_sofa_a_front_runtime_v2.png")),
    back: assetRef("universal_long_sofa_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_long_sofa_a/universal_long_sofa_a_back_runtime_v2.png")),
    left: assetRef("universal_long_sofa_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_long_sofa_a/universal_long_sofa_a_left_runtime_v2.png")),
    right: assetRef("universal_long_sofa_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_long_sofa_a/universal_long_sofa_a_right_runtime_v2.png"))
  }),
  universal_lounge_armchair_a: () => ({
    front: assetRef("universal_lounge_armchair_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_lounge_armchair_a/universal_lounge_armchair_a_front_runtime_v2.png")),
    back: assetRef("universal_lounge_armchair_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_lounge_armchair_a/universal_lounge_armchair_a_back_runtime_v2.png")),
    left: assetRef("universal_lounge_armchair_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_lounge_armchair_a/universal_lounge_armchair_a_left_runtime_v2.png")),
    right: assetRef("universal_lounge_armchair_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_lounge_armchair_a/universal_lounge_armchair_a_right_runtime_v2.png"))
  }),
  universal_cloud_bed_b: () => ({
    front: assetRef("universal_cloud_bed_b_front_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_bed_b/universal_cloud_bed_b_front_runtime_v2.png")),
    back: assetRef("universal_cloud_bed_b_back_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_bed_b/universal_cloud_bed_b_back_runtime_v2.png")),
    left: assetRef("universal_cloud_bed_b_left_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_bed_b/universal_cloud_bed_b_left_runtime_v2.png")),
    right: assetRef("universal_cloud_bed_b_right_runtime_v2.png", require("./assets/runtime/candidates/universal_cloud_bed_b/universal_cloud_bed_b_right_runtime_v2.png"))
  }),
  universal_rounded_wardrobe_a: () => ({
    front: assetRef("universal_rounded_wardrobe_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_rounded_wardrobe_a/universal_rounded_wardrobe_a_front_runtime_v2.png")),
    back: assetRef("universal_rounded_wardrobe_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_rounded_wardrobe_a/universal_rounded_wardrobe_a_back_runtime_v2.png")),
    left: assetRef("universal_rounded_wardrobe_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_rounded_wardrobe_a/universal_rounded_wardrobe_a_left_runtime_v2.png")),
    right: assetRef("universal_rounded_wardrobe_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_rounded_wardrobe_a/universal_rounded_wardrobe_a_right_runtime_v2.png"))
  }),
  universal_soft_coat_stand_a: () => ({
    front: assetRef("universal_soft_coat_stand_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_coat_stand_a/universal_soft_coat_stand_a_front_runtime_v2.png")),
    back: assetRef("universal_soft_coat_stand_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_coat_stand_a/universal_soft_coat_stand_a_back_runtime_v2.png")),
    left: assetRef("universal_soft_coat_stand_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_coat_stand_a/universal_soft_coat_stand_a_left_runtime_v2.png")),
    right: assetRef("universal_soft_coat_stand_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_soft_coat_stand_a/universal_soft_coat_stand_a_right_runtime_v2.png"))
  }),
  universal_soft_pouf_b: () => ({
    front: assetRef("universal_soft_pouf_b_front_normalized_v3.png", require("./assets/runtime/candidates/universal_soft_pouf_b/universal_soft_pouf_b_front_runtime_v2_normalized_v3.png")),
    back: assetRef("universal_soft_pouf_b_back_normalized_v3.png", require("./assets/runtime/candidates/universal_soft_pouf_b/universal_soft_pouf_b_back_pilot_v1_normalized_v3.png")),
    left: assetRef("universal_soft_pouf_b_left_normalized_v3.png", require("./assets/runtime/candidates/universal_soft_pouf_b/universal_soft_pouf_b_left_pilot_v1_normalized_v3.png")),
    right: assetRef("universal_soft_pouf_b_right_normalized_v3.png", require("./assets/runtime/candidates/universal_soft_pouf_b/universal_soft_pouf_b_right_pilot_v1_normalized_v3.png"))
  }),
  universal_storage_cabinet_a: () => ({
    front: assetRef("universal_storage_cabinet_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_storage_cabinet_a/universal_storage_cabinet_a_front_runtime_v2.png")),
    back: assetRef("universal_storage_cabinet_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_storage_cabinet_a/universal_storage_cabinet_a_back_runtime_v2.png")),
    left: assetRef("universal_storage_cabinet_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_storage_cabinet_a/universal_storage_cabinet_a_left_runtime_v2.png")),
    right: assetRef("universal_storage_cabinet_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_storage_cabinet_a/universal_storage_cabinet_a_right_runtime_v2.png"))
  }),
  universal_nightstand_a: () => ({
    front: assetRef("universal_nightstand_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_nightstand_a/universal_nightstand_a_front_runtime_v2.png")),
    back: assetRef("universal_nightstand_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_nightstand_a/universal_nightstand_a_back_runtime_v2.png")),
    left: assetRef("universal_nightstand_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_nightstand_a/universal_nightstand_a_left_runtime_v2.png")),
    right: assetRef("universal_nightstand_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_nightstand_a/universal_nightstand_a_right_runtime_v2.png"))
  }),
  universal_laundry_basket_a: () => ({
    front: assetRef("universal_laundry_basket_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_laundry_basket_a/universal_laundry_basket_a_front_runtime_v2.png")),
    back: assetRef("universal_laundry_basket_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_laundry_basket_a/universal_laundry_basket_a_back_runtime_v2.png")),
    left: assetRef("universal_laundry_basket_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_laundry_basket_a/universal_laundry_basket_a_left_runtime_v2.png")),
    right: assetRef("universal_laundry_basket_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_laundry_basket_a/universal_laundry_basket_a_right_runtime_v2.png"))
  }),
  universal_vanity_table_a: () => ({
    front: assetRef("universal_vanity_table_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_vanity_table_a/universal_vanity_table_a_front_runtime_v2.png")),
    back: assetRef("universal_vanity_table_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_vanity_table_a/universal_vanity_table_a_back_runtime_v2.png")),
    left: assetRef("universal_vanity_table_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_vanity_table_a/universal_vanity_table_a_left_runtime_v2.png")),
    right: assetRef("universal_vanity_table_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_vanity_table_a/universal_vanity_table_a_right_runtime_v2.png"))
  }),
  universal_shoe_cabinet_a: () => ({
    front: assetRef("universal_shoe_cabinet_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_shoe_cabinet_a/universal_shoe_cabinet_a_front_runtime_v2.png")),
    back: assetRef("universal_shoe_cabinet_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_shoe_cabinet_a/universal_shoe_cabinet_a_back_runtime_v2.png")),
    left: assetRef("universal_shoe_cabinet_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_shoe_cabinet_a/universal_shoe_cabinet_a_left_runtime_v2.png")),
    right: assetRef("universal_shoe_cabinet_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_shoe_cabinet_a/universal_shoe_cabinet_a_right_runtime_v2.png"))
  }),
  universal_dresser_a: () => ({
    front: assetRef("universal_dresser_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_dresser_a/universal_dresser_a_front_runtime_v2.png")),
    back: assetRef("universal_dresser_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_dresser_a/universal_dresser_a_back_runtime_v2.png")),
    left: assetRef("universal_dresser_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_dresser_a/universal_dresser_a_left_runtime_v2.png")),
    right: assetRef("universal_dresser_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_dresser_a/universal_dresser_a_right_runtime_v2.png"))
  }),
  universal_console_table_a: () => ({
    front: assetRef("universal_console_table_a_front_normalized_v3.png", require("./assets/runtime/candidates/universal_console_table_a/universal_console_table_a_front_runtime_v2_normalized_v3.png")),
    back: assetRef("universal_console_table_a_back_normalized_v3.png", require("./assets/runtime/candidates/universal_console_table_a/universal_console_table_a_back_runtime_v2_normalized_v3.png")),
    left: assetRef("universal_console_table_a_left_normalized_v3.png", require("./assets/runtime/candidates/universal_console_table_a/universal_console_table_a_left_runtime_v2_normalized_v3.png")),
    right: assetRef("universal_console_table_a_right_normalized_v3.png", require("./assets/runtime/candidates/universal_console_table_a/universal_console_table_a_right_runtime_v2_normalized_v3.png"))
  }),
  universal_large_standing_plant_a: () => ({
    front: assetRef("universal_large_standing_plant_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_large_standing_plant_a/universal_large_standing_plant_a_front_runtime_v2.png")),
    back: assetRef("universal_large_standing_plant_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_large_standing_plant_a/universal_large_standing_plant_a_back_runtime_v2.png")),
    left: assetRef("universal_large_standing_plant_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_large_standing_plant_a/universal_large_standing_plant_a_left_runtime_v2.png")),
    right: assetRef("universal_large_standing_plant_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_large_standing_plant_a/universal_large_standing_plant_a_right_runtime_v2.png"))
  }),
  universal_table_lamp_a: () => assetRef("universal_table_lamp_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_table_lamp_a/universal_table_lamp_a_front_runtime_v2.png")),
  universal_wall_clock_a: () => assetRef("universal_wall_clock_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_wall_clock_a/universal_wall_clock_a_front_runtime_v2.png")),
  universal_small_tabletop_plant_a: () => assetRef("universal_small_tabletop_plant_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_small_tabletop_plant_a/universal_small_tabletop_plant_a_front_runtime_v2.png")),
  universal_ceramic_vase_set_a: () => assetRef("universal_ceramic_vase_set_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_ceramic_vase_set_a/universal_ceramic_vase_set_a_front_runtime_v2.png")),
  universal_books_magazine_stack_a: () => assetRef("universal_books_magazine_stack_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_books_magazine_stack_a/universal_books_magazine_stack_a_front_runtime_v2.png")),
  universal_tea_coffee_tray_a: () => assetRef("universal_tea_coffee_tray_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_tea_coffee_tray_a/universal_tea_coffee_tray_a_front_runtime_v2.png")),
  universal_arch_wall_mirror_a: () => assetRef("universal_arch_wall_mirror_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_arch_wall_mirror_a/universal_arch_wall_mirror_a_front_runtime_v2.png")),
  universal_wall_artwork_a: () => assetRef("universal_wall_artwork_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_wall_artwork_a/universal_wall_artwork_a_front_runtime_v2.png")),
  universal_ceiling_light_a: () => assetRef("universal_ceiling_light_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_ceiling_light_a/universal_ceiling_light_a_front_runtime_v2.png")),
  universal_curtain_set_a: () => assetRef("universal_curtain_set_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_curtain_set_a/universal_curtain_set_a_front_runtime_v2.png")),
  universal_decorative_object_set_a: () => assetRef("universal_decorative_object_set_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_decorative_object_set_a/universal_decorative_object_set_a_front_runtime_v2.png")),
  universal_small_speaker_a: () => ({
    front: assetRef("universal_small_speaker_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_small_speaker_a/universal_small_speaker_a_front_runtime_v2.png")),
    back: assetRef("universal_small_speaker_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_small_speaker_a/universal_small_speaker_a_back_runtime_v2.png")),
    left: assetRef("universal_small_speaker_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_small_speaker_a/universal_small_speaker_a_left_runtime_v2.png")),
    right: assetRef("universal_small_speaker_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_small_speaker_a/universal_small_speaker_a_right_runtime_v2.png"))
  }),
  universal_rug_a: () => ({
    front: assetRef("universal_rug_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_rug_a/universal_rug_a_front_runtime_v2.png")),
    back: assetRef("universal_rug_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_rug_a/universal_rug_a_back_runtime_v2.png")),
    left: assetRef("universal_rug_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_rug_a/universal_rug_a_left_runtime_v2.png")),
    right: assetRef("universal_rug_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_rug_a/universal_rug_a_right_runtime_v2.png"))
  }),
  universal_cushion_set_a: () => assetRef("universal_cushion_set_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_cushion_set_a/universal_cushion_set_a_front_runtime_v2.png")),
  universal_full_length_mirror_a: () => ({
    front: assetRef("universal_full_length_mirror_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_full_length_mirror_a/universal_full_length_mirror_a_front_runtime_v2.png")),
    back: assetRef("universal_full_length_mirror_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_full_length_mirror_a/universal_full_length_mirror_a_back_runtime_v2.png")),
    left: assetRef("universal_full_length_mirror_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_full_length_mirror_a/universal_full_length_mirror_a_left_runtime_v2.png")),
    right: assetRef("universal_full_length_mirror_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_full_length_mirror_a/universal_full_length_mirror_a_right_runtime_v2.png"))
  }),
  universal_open_display_shelf_a: () => ({
    front: assetRef("universal_open_display_shelf_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_open_display_shelf_a/universal_open_display_shelf_a_front_runtime_v2.png")),
    back: assetRef("universal_open_display_shelf_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_open_display_shelf_a/universal_open_display_shelf_a_back_runtime_v2.png")),
    left: assetRef("universal_open_display_shelf_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_open_display_shelf_a/universal_open_display_shelf_a_left_runtime_v2.png")),
    right: assetRef("universal_open_display_shelf_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_open_display_shelf_a/universal_open_display_shelf_a_right_runtime_v2.png"))
  }),
  universal_room_divider_a: () => ({
    front: assetRef("universal_room_divider_a_front_runtime_v2.png", require("./assets/runtime/candidates/universal_room_divider_a/universal_room_divider_a_front_runtime_v2.png")),
    back: assetRef("universal_room_divider_a_back_runtime_v2.png", require("./assets/runtime/candidates/universal_room_divider_a/universal_room_divider_a_back_runtime_v2.png")),
    left: assetRef("universal_room_divider_a_left_runtime_v2.png", require("./assets/runtime/candidates/universal_room_divider_a/universal_room_divider_a_left_runtime_v2.png")),
    right: assetRef("universal_room_divider_a_right_runtime_v2.png", require("./assets/runtime/candidates/universal_room_divider_a/universal_room_divider_a_right_runtime_v2.png"))
  })
}

const ITEM_FACTORIES: Record<string, ItemFactory> = {
  universal_petal_side_table_a: directionalFactory(createUniversalPetalSideTableAPilot),
  universal_cloud_loveseat_a: directionalFactory(createUniversalCloudLoveseatAPilot),
  universal_orbit_floor_lamp_a: directionalFactory(createUniversalOrbitFloorLampAPilot),
  universal_tidy_work_desk_a: directionalFactory(createUniversalTidyWorkDeskAPilot),
  universal_arc_coffee_table_b: directionalFactory(createUniversalArcCoffeeTableBPilot),
  universal_cloud_accent_chair_b: directionalFactory(createUniversalCloudAccentChairBPilot),
  universal_round_dining_table_a: directionalFactory(createUniversalRoundDiningTableAPilot),
  universal_soft_media_console_b: directionalFactory((assets) =>
    relabelFurnitureItem(createUniversalSoftMediaConsoleAPilot(assets), {
      id: "universal_soft_media_console_b",
      name: "Soft Media Console"
    })
  ),
  universal_open_bookshelf_a: directionalFactory((assets) =>
    relabelFurnitureItem(createUniversalRoundedWardrobeAPilot(assets), {
      id: "universal_open_bookshelf_a",
      name: "Open Display Bookshelf"
    })
  ),
  universal_dining_chair_a: directionalFactory(createUniversalDiningChairAPilot),
  universal_desk_chair_a: directionalFactory(createUniversalDeskChairAPilot),
  universal_bench_a: directionalFactory(createUniversalBenchAPilot),
  universal_soft_floor_cushion_a: directionalFactory(createUniversalSoftFloorCushionAPilot),
  universal_pet_bed_a: directionalFactory(createUniversalPetBedAPilot),
  universal_long_sofa_a: directionalFactory(createUniversalLongSofaAPilot),
  universal_lounge_armchair_a: directionalFactory(createUniversalLoungeArmchairAPilot),
  universal_cloud_bed_b: directionalFactory(createUniversalCloudBedBPilot),
  universal_rounded_wardrobe_a: directionalFactory(createUniversalRoundedWardrobeAPilot),
  universal_soft_coat_stand_a: directionalFactory(createUniversalSoftCoatStandAPilot),
  universal_soft_pouf_b: directionalFactory(createUniversalSoftPoufBPilot),
  universal_storage_cabinet_a: directionalFactory(createUniversalStorageCabinetAPilot),
  universal_nightstand_a: directionalFactory(createUniversalNightstandAPilot),
  universal_laundry_basket_a: directionalFactory(createUniversalLaundryBasketAPilot),
  universal_vanity_table_a: directionalFactory(createUniversalVanityTableAPilot),
  universal_shoe_cabinet_a: directionalFactory(createUniversalShoeCabinetAPilot),
  universal_dresser_a: directionalFactory(createUniversalDresserAPilot),
  universal_console_table_a: directionalFactory(createUniversalConsoleTableAPilot),
  universal_large_standing_plant_a: directionalFactory(
    createUniversalLargeStandingPlantAPilot
  ),
  universal_table_lamp_a: surfaceFactory(createUniversalTableLampAPilot),
  universal_wall_clock_a: surfaceFactory(createUniversalWallClockAPilot),
  universal_small_tabletop_plant_a: surfaceFactory(createUniversalSmallTabletopPlantAPilot),
  universal_ceramic_vase_set_a: surfaceFactory(createUniversalCeramicVaseSetAPilot),
  universal_books_magazine_stack_a: surfaceFactory(createUniversalBooksMagazineStackAPilot),
  universal_tea_coffee_tray_a: surfaceFactory(createUniversalTeaCoffeeTrayAPilot),
  universal_arch_wall_mirror_a: surfaceFactory(createUniversalArchWallMirrorAPilot),
  universal_wall_artwork_a: surfaceFactory(createUniversalWallArtworkAPilot),
  universal_ceiling_light_a: surfaceFactory(createUniversalCeilingLightAPilot),
  universal_curtain_set_a: surfaceFactory(createUniversalCurtainSetAPilot),
  universal_decorative_object_set_a: surfaceFactory(createUniversalDecorativeObjectSetAPilot),
  universal_small_speaker_a: directionalSurfaceFactory(createUniversalSmallSpeakerAPilot),
  universal_rug_a: directionalSurfaceFactory(createUniversalRugAPilot),
  universal_cushion_set_a: surfaceFactory((asset) =>
    relabelFurnitureItem(createUniversalCushionSetAPilot(asset), {
      id: "universal_cushion_set_a",
      name: "Cloud Cushion Set"
    })
  ),
  universal_full_length_mirror_a: directionalSurfaceFactory(createUniversalFullLengthMirrorAPilot),
  universal_open_display_shelf_a: directionalSurfaceFactory(createUniversalOpenDisplayShelfAPilot),
  universal_room_divider_a: directionalSurfaceFactory(createUniversalRoomDividerAPilot)
}

export function createRoomV3UniversalCoreRuntimeFurniture(
  registry?: RoomV3UniversalCoreTrustedArtifactRegistry | null
): FurnitureItem[] {
  if (!isTrustedArtifactRegistry(registry)) return []

  return ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => {
    const assetFactory = ASSET_FACTORIES[id]
    const itemFactory = ITEM_FACTORIES[id]
    if (!assetFactory || !itemFactory) return null
    const rawAssets = assetFactory()
    const assets = isAssetRef(rawAssets) ? { front: rawAssets } : rawAssets
    const item = itemFactory(assets)
    return item
      ? calibrateRoomV3UniversalCoreFurnitureForMobile(
        cloneFurnitureItem(ensureUniversalCoreMetadata(id, item))
      )
      : null
  }).filter((item): item is FurnitureItem => item !== null)
}

function isAssetRef(
  assets: UniversalCoreAssetBundle | RoomV2AssetRef
): assets is RoomV2AssetRef {
  return "source" in assets
}

function isTrustedArtifactRegistry(
  registry: RoomV3UniversalCoreTrustedArtifactRegistry | null | undefined
): registry is RoomV3UniversalCoreTrustedArtifactRegistry {
  if (
    !registry ||
    typeof registry !== "object" ||
    typeof registry.verifierId !== "string" ||
    typeof registry.artifactManifestId !== "string" ||
    !Array.isArray(registry.verifiedCandidateIds) ||
    !registry.verifiedAssetHashesByCandidateId ||
    typeof registry.verifiedAssetHashesByCandidateId !== "object" ||
    registry.verifierId !== ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID ||
    registry.artifactManifestId !== ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID ||
    registry.verifiedCandidateIds.length !== ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length
  ) {
    return false
  }

  const expectedIds = new Set(ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)
  if (
    new Set(registry.verifiedCandidateIds).size !== expectedIds.size ||
    registry.verifiedCandidateIds.some((id) => !expectedIds.has(id))
  ) return false

  return ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.every((id) => {
    const hashes = registry.verifiedAssetHashesByCandidateId[id]
    const expectedHashes = ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id]
    const rotations = STATIC_SURFACE_CANDIDATE_IDS.has(id)
      ? (["front"] as const)
      : REQUIRED_DIRECTIONS
    return rotations.every((rotation) => {
      const hash = hashes?.[rotation]
      const expectedHash = (
        expectedHashes as Partial<Record<RoomFurnitureRotation, string>> | undefined
      )?.[rotation]
      return (
        typeof hash === "string" &&
        /^[a-f0-9]{64}$/i.test(hash) &&
        typeof expectedHash === "string" &&
        hash.toLowerCase() === expectedHash.toLowerCase()
      )
    })
  })
}

function directionalFactory(
  factory: (assets: UniversalCoreDirectionalAssetBundle) => FurnitureItem
): ItemFactory {
  return (assets) => {
    const directionalAssets = asDirectionalAssets(assets)
    return directionalAssets ? factory(directionalAssets) : null
  }
}

function surfaceFactory(
  factory: (asset: RoomV2AssetRef) => FurnitureItem
): ItemFactory {
  return (assets) => factory(cloneAssetRef(assets.front))
}

function directionalSurfaceFactory(
  factory: (asset: RoomV2AssetRef) => FurnitureItem
): ItemFactory {
  return (assets) => {
    const directionalAssets = asDirectionalAssets(assets)
    if (!directionalAssets) return null
    return {
      ...factory(cloneAssetRef(directionalAssets.front)),
      asset: cloneAssetRef(directionalAssets.front),
      assetsByRotation: directionalAssets,
      rotationPolicy: "directional_assets_required"
    }
  }
}

function asDirectionalAssets(
  assets: UniversalCoreAssetBundle
): UniversalCoreDirectionalAssetBundle | null {
  if (!assets.back || !assets.left || !assets.right) {
    return null
  }
  return {
    front: cloneAssetRef(assets.front),
    back: cloneAssetRef(assets.back),
    left: cloneAssetRef(assets.left),
    right: cloneAssetRef(assets.right)
  }
}

function relabelFurnitureItem(
  item: FurnitureItem,
  overrides: {
    id: string
    name: string
    category?: FurnitureItem["category"]
    placementSurface?: FurnitureItem["placementSurface"]
  }
): FurnitureItem {
  return {
    ...item,
    id: overrides.id,
    name: overrides.name,
    ...(overrides.category ? { category: overrides.category } : {}),
    ...(overrides.placementSurface
      ? { placementSurface: overrides.placementSurface }
      : {})
  }
}

function ensureUniversalCoreMetadata(
  id: RoomV3UniversalCoreRuntimeCandidateId,
  item: FurnitureItem
): FurnitureItem {
  return {
    ...item,
    collectionId: "universal_core",
    homeTheme: "universal_core",
    // Keep runtime metadata aligned with the pilot factory contract. The
    // cushion set is a large floor prop, not a tabletop accessory.
    placementSurface: id === "universal_small_speaker_a"
      ? "floor"
      : item.placementSurface
  }
}

/**
 * The room camera needs a smaller, category-aware render envelope than the
 * source art. This is intentionally separate from the placement base: visual
 * scale, avatar collision, and furniture-to-furniture proximity are three
 * different product contracts.
 */
export function calibrateRoomV3UniversalCoreFurnitureForMobile(
  item: FurnitureItem
): FurnitureItem {
  return scaleUniversalCoreRuntimeFurniture(
    withUniversalCorePlacementBases(item)
  )
}

function withUniversalCorePlacementBases(item: FurnitureItem): FurnitureItem {
  if (item.placementSurface !== "floor" || item.blocksMovement !== true) {
    return item
  }

  const physicalFootprint = item.footprint ?? getUniversalCorePhysicalFootprint(item)
  const placementProfile = getUniversalCorePlacementBaseProfile(item)
  const shrink = (footprint: NonNullable<FurnitureItem["footprint"]>) => ({
    width: roundFurnitureCoordinate(footprint.width * placementProfile.width),
    height: roundFurnitureCoordinate(footprint.height * placementProfile.height)
  })
  const physicalByRotation = item.footprintByRotation

  return {
    ...item,
    footprint: physicalFootprint,
    placementFootprint: shrink(physicalFootprint),
    placementFootprintByRotation: physicalByRotation
      ? Object.fromEntries(
        Object.entries(physicalByRotation).map(([rotation, footprint]) => [
          rotation,
          footprint ? shrink(footprint) : footprint
        ])
      ) as FurnitureItem["placementFootprintByRotation"]
      : undefined
  }
}

function getUniversalCorePhysicalFootprint(
  item: FurnitureItem
): NonNullable<FurnitureItem["footprint"]> {
  return {
    width: roundFurnitureCoordinate(item.width * 0.78),
    height: roundFurnitureCoordinate(item.height * 0.62)
  }
}

function getUniversalCorePlacementBaseProfile(item: FurnitureItem): {
  width: number
  height: number
} {
  if (item.category === "seating") return { width: 0.84, height: 0.64 }
  if (item.category === "table") return { width: 0.78, height: 0.58 }
  if (item.category === "lighting") return { width: 0.68, height: 0.62 }
  if (item.category === "plant") return { width: 0.72, height: 0.62 }
  return { width: 0.78, height: 0.62 }
}

function scaleUniversalCoreRuntimeFurniture(item: FurnitureItem): FurnitureItem {
  const candidateId = item.id as RoomV3PhysicalScaleCandidateId
  const physicalProfile = getRoomV3PhysicalScaleProfile(candidateId)
  const rotations = REQUIRED_DIRECTIONS
  const renderSizeByRotation = Object.fromEntries(
    rotations.map((rotation) => [
      rotation,
      getRoomV3SceneRenderSize(candidateId, rotation)
    ])
  ) as NonNullable<FurnitureItem["renderSizeByRotation"]>
  const footprintByRotation = Object.fromEntries(
    rotations.map((rotation) => [
      rotation,
      getRoomV3ScenePhysicalFootprint(candidateId, rotation)
    ])
  ) as NonNullable<FurnitureItem["footprintByRotation"]>
  const frontRenderSize = renderSizeByRotation.front!
  const frontFootprint = footprintByRotation.front!
  const placementProfile = getUniversalCorePlacementBaseProfile(item)
  const placementFootprintByRotation = Object.fromEntries(
    Object.entries(footprintByRotation).map(([rotation, footprint]) => [
      rotation,
      {
        width: roundFurnitureCoordinate(footprint.width * placementProfile.width),
        height: roundFurnitureCoordinate(footprint.height * placementProfile.height)
      }
    ])
  ) as NonNullable<FurnitureItem["placementFootprintByRotation"]>
  const calibratedSeatHeight = physicalProfile.seatHeightMeters === undefined
    ? undefined
    : roundFurnitureCoordinate(
      physicalProfile.seatHeightMeters /
      CANONICAL_ROOM_AVATAR_HEIGHT_METERS *
      CANONICAL_ROOM_AVATAR_RENDER_HEIGHT
    )
  const scaleSeatPoint = (seat: NonNullable<FurnitureItem["seatSpec"]>["seatPoints"][number]) => ({
    ...seat,
    // These coordinates are local ratios, later multiplied by the resized
    // render box in getRoomV3SeatPoints. Scaling them here would apply the
    // 0.82 factor twice and pull an avatar too close to the seat center.
    seatHeight: seat.seatHeight === undefined
      ? undefined
      : calibratedSeatHeight ?? seat.seatHeight
  })

  return {
    ...item,
    width: frontRenderSize.width,
    height: frontRenderSize.height,
    renderSizeByRotation,
    footprint: item.placementSurface === "floor" && item.blocksMovement
      ? frontFootprint
      : item.footprint,
    footprintByRotation: item.placementSurface === "floor" && item.blocksMovement
      ? footprintByRotation
      : item.footprintByRotation,
    placementFootprint: item.placementSurface === "floor" && item.blocksMovement
      ? placementFootprintByRotation.front
      : item.placementFootprint,
    placementFootprintByRotation:
      item.placementSurface === "floor" && item.blocksMovement
        ? placementFootprintByRotation
        : item.placementFootprintByRotation,
    seatPoints: item.seatPoints?.map(scaleSeatPoint),
    seatSpec: item.seatSpec
      ? {
        ...item.seatSpec,
        seatPoints: item.seatSpec.seatPoints.map(scaleSeatPoint)
      }
      : undefined
  }
}

function roundFurnitureCoordinate(value: number): number {
  return Number(value.toFixed(4))
}

function cloneAssetRef(asset: RoomV2AssetRef): RoomV2AssetRef {
  return { key: asset.key, source: asset.source }
}

function assetRef(key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef {
  return { key, source }
}

function cloneFurnitureItem(item: FurnitureItem): FurnitureItem {
  const assetsByRotation = item.assetsByRotation
    ? Object.fromEntries(
        Object.entries(item.assetsByRotation).map(([rotation, asset]) => [
          rotation,
          cloneAssetRef(asset)
        ])
      ) as FurnitureItem["assetsByRotation"]
    : undefined

  return {
    ...item,
    asset: assetsByRotation?.front ?? cloneAssetRef(item.asset),
    assetsByRotation,
    anchor: item.anchor ? { ...item.anchor } : undefined,
    anchorByRotation: item.anchorByRotation
      ? Object.fromEntries(
          Object.entries(item.anchorByRotation).map(([rotation, anchor]) => [
            rotation,
            anchor ? { ...anchor } : anchor
          ])
        ) as FurnitureItem["anchorByRotation"]
      : undefined,
    renderSizeByRotation: item.renderSizeByRotation
      ? Object.fromEntries(
          Object.entries(item.renderSizeByRotation).map(([rotation, size]) => [
            rotation,
            size ? { ...size } : size
          ])
        ) as FurnitureItem["renderSizeByRotation"]
      : undefined,
    footprint: item.footprint ? { ...item.footprint } : undefined,
    footprintByRotation: item.footprintByRotation
      ? Object.fromEntries(
          Object.entries(item.footprintByRotation).map(([rotation, footprint]) => [
            rotation,
            footprint ? { ...footprint } : footprint
          ])
        ) as FurnitureItem["footprintByRotation"]
      : undefined,
    placementFootprint: item.placementFootprint ? { ...item.placementFootprint } : undefined,
    placementFootprintByRotation: item.placementFootprintByRotation
      ? Object.fromEntries(
        Object.entries(item.placementFootprintByRotation).map(([rotation, footprint]) => [
          rotation,
          footprint ? { ...footprint } : footprint
        ])
      ) as FurnitureItem["placementFootprintByRotation"]
      : undefined,
    surfaceSupports: item.surfaceSupports?.map((support) => ({
      ...support,
      localBounds: { ...support.localBounds },
      localBoundsByRotation: support.localBoundsByRotation
        ? Object.fromEntries(
            Object.entries(support.localBoundsByRotation).map(([rotation, bounds]) => [
              rotation,
              bounds ? { ...bounds } : bounds
            ])
          ) as typeof support.localBoundsByRotation
        : undefined
    })),
    seatPoints: item.seatPoints?.map((seat) => ({
      ...seat,
      approachPoint: seat.approachPoint ? { ...seat.approachPoint } : undefined,
      exitPoint: seat.exitPoint ? { ...seat.exitPoint } : undefined
    })),
    seatSpec: item.seatSpec ? cloneSeatSpec(item.seatSpec) : undefined
  }
}

function cloneSeatSpec(seatSpec: NonNullable<FurnitureItem["seatSpec"]>) {
  return {
    ...seatSpec,
    seatPoints: seatSpec.seatPoints.map((seat) => ({
      ...seat,
      approachPoint: seat.approachPoint ? { ...seat.approachPoint } : undefined,
      exitPoint: seat.exitPoint ? { ...seat.exitPoint } : undefined
    }))
  }
}
