import type { RoomFurnitureRotation, RoomV2AssetRef } from "./roomV2.types"

const asset = (key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef => ({ key, source })

export interface RoomVNextFullWaveRuntimeAssetBundle {
  body: Record<RoomFurnitureRotation, RoomV2AssetRef>
  shadow: Record<RoomFurnitureRotation, RoomV2AssetRef>
  thumbnail: RoomV2AssetRef
}

/**
 * Static Metro-safe refs for the 45 full-wave candidate renders.
 *
 * This module is intentionally consumed only by the explicit full-wave QA
 * resolver. Keeping every require literal prevents Metro from silently
 * dropping a candidate asset or inventing a dynamic path at runtime.
 */
export const ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS: Readonly<Record<string, RoomVNextFullWaveRuntimeAssetBundle>> = {
  "universal_petal_side_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_petal_side_table_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_petal_side_table_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_petal_side_table_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_petal_side_table_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_petal_side_table_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_petal_side_table_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_petal_side_table_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_petal_side_table_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_petal_side_table_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_petal_side_table_a/front_thumbnail.png")),
  },
  "universal_cloud_loveseat_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_cloud_loveseat_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_cloud_loveseat_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_cloud_loveseat_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_cloud_loveseat_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_cloud_loveseat_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_cloud_loveseat_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_loveseat_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_loveseat_a/front_thumbnail.png")),
  },
  "universal_orbit_floor_lamp_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_orbit_floor_lamp_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_orbit_floor_lamp_a/front_thumbnail.png")),
  },
  "universal_tidy_work_desk_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_tidy_work_desk_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_tidy_work_desk_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_tidy_work_desk_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_tidy_work_desk_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_tidy_work_desk_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_tidy_work_desk_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_tidy_work_desk_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tidy_work_desk_a/front_thumbnail.png")),
  },
  "universal_arc_coffee_table_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/front_body.png")),
      right: asset("room_vnext_full_wave_universal_arc_coffee_table_b_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/right_body.png")),
      back: asset("room_vnext_full_wave_universal_arc_coffee_table_b_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/back_body.png")),
      left: asset("room_vnext_full_wave_universal_arc_coffee_table_b_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_arc_coffee_table_b_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_arc_coffee_table_b_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_arc_coffee_table_b_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_arc_coffee_table_b_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arc_coffee_table_b/front_thumbnail.png")),
  },
  "universal_cloud_accent_chair_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/front_body.png")),
      right: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/right_body.png")),
      back: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/back_body.png")),
      left: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_accent_chair_b_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_accent_chair_b/front_thumbnail.png")),
  },
  "universal_round_dining_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_round_dining_table_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_round_dining_table_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_round_dining_table_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_round_dining_table_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_round_dining_table_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_round_dining_table_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_round_dining_table_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_round_dining_table_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_round_dining_table_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_round_dining_table_a/front_thumbnail.png")),
  },
  "universal_soft_media_console_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_media_console_b_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_media_console_b_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_media_console_b_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_media_console_b_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_media_console_b_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_media_console_b_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_media_console_b_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_media_console_b_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_media_console_b_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_media_console_b/front_thumbnail.png")),
  },
  "universal_open_bookshelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_bookshelf_a/front_thumbnail.png")),
  },
  "universal_table_lamp_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_table_lamp_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_table_lamp_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_table_lamp_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_table_lamp_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_table_lamp_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_table_lamp_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_table_lamp_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_table_lamp_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_table_lamp_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_table_lamp_a/front_thumbnail.png")),
  },
  "universal_wall_clock_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_clock_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_clock_a/front_thumbnail.png")),
  },
  "universal_small_tabletop_plant_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_small_tabletop_plant_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_tabletop_plant_a/front_thumbnail.png")),
  },
  "universal_ceramic_vase_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceramic_vase_set_a/front_thumbnail.png")),
  },
  "universal_books_magazine_stack_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_books_magazine_stack_a/front_thumbnail.png")),
  },
  "universal_tea_coffee_tray_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_tea_coffee_tray_a/front_thumbnail.png")),
  },
  "universal_dining_chair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_dining_chair_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_dining_chair_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_dining_chair_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_dining_chair_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_dining_chair_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_dining_chair_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_dining_chair_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_dining_chair_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_dining_chair_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dining_chair_a/front_thumbnail.png")),
  },
  "universal_desk_chair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_desk_chair_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_desk_chair_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_desk_chair_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_desk_chair_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_desk_chair_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_desk_chair_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_desk_chair_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_desk_chair_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_desk_chair_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_desk_chair_a/front_thumbnail.png")),
  },
  "universal_bench_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_bench_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_bench_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_bench_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_bench_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_bench_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_bench_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_bench_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_bench_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_bench_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_bench_a/front_thumbnail.png")),
  },
  "universal_soft_floor_cushion_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_floor_cushion_a/front_thumbnail.png")),
  },
  "universal_pet_bed_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_pet_bed_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_pet_bed_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_pet_bed_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_pet_bed_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_pet_bed_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_pet_bed_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_pet_bed_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_pet_bed_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_pet_bed_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_pet_bed_a/front_thumbnail.png")),
  },
  "universal_nightstand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_nightstand_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_nightstand_a/front_thumbnail.png")),
  },
  "universal_laundry_basket_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_laundry_basket_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_laundry_basket_a/front_thumbnail.png")),
  },
  "universal_cushion_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cushion_set_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cushion_set_a/front_thumbnail.png")),
  },
  "universal_vanity_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_vanity_table_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_vanity_table_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_vanity_table_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_vanity_table_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_vanity_table_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_vanity_table_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_vanity_table_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_vanity_table_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_vanity_table_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_vanity_table_a/front_thumbnail.png")),
  },
  "universal_shoe_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_shoe_cabinet_a/front_thumbnail.png")),
  },
  "universal_long_sofa_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_long_sofa_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_long_sofa_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_long_sofa_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_long_sofa_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_long_sofa_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_long_sofa_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_long_sofa_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_long_sofa_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_long_sofa_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_long_sofa_a/front_thumbnail.png")),
  },
  "universal_lounge_armchair_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_lounge_armchair_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_lounge_armchair_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_lounge_armchair_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_lounge_armchair_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_lounge_armchair_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_lounge_armchair_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_lounge_armchair_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_lounge_armchair_a/front_thumbnail.png")),
  },
  "universal_cloud_bed_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_cloud_bed_b_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/front_body.png")),
      right: asset("room_vnext_full_wave_universal_cloud_bed_b_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/right_body.png")),
      back: asset("room_vnext_full_wave_universal_cloud_bed_b_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/back_body.png")),
      left: asset("room_vnext_full_wave_universal_cloud_bed_b_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cloud_bed_b_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_cloud_bed_b_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_cloud_bed_b_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_cloud_bed_b_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cloud_bed_b_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_cloud_bed_b/front_thumbnail.png")),
  },
  "universal_rounded_wardrobe_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rounded_wardrobe_a/front_thumbnail.png")),
  },
  "universal_soft_coat_stand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_coat_stand_a/front_thumbnail.png")),
  },
  "universal_soft_pouf_b": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_pouf_b_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_pouf_b_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_pouf_b_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_pouf_b_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_pouf_b_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_pouf_b_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_pouf_b_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_pouf_b_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_pouf_b_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_soft_pouf_b/front_thumbnail.png")),
  },
  "universal_arch_wall_mirror_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_arch_wall_mirror_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_arch_wall_mirror_a/front_thumbnail.png")),
  },
  "universal_storage_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_storage_cabinet_a/front_thumbnail.png")),
  },
  "universal_dresser_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_dresser_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_dresser_a/front_thumbnail.png")),
  },
  "universal_console_table_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_console_table_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_console_table_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_console_table_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_console_table_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_console_table_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_console_table_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_console_table_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_console_table_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_console_table_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_console_table_a/front_thumbnail.png")),
  },
  "universal_large_standing_plant_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_large_standing_plant_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_large_standing_plant_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_large_standing_plant_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_large_standing_plant_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_large_standing_plant_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_large_standing_plant_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_large_standing_plant_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_large_standing_plant_a/front_thumbnail.png")),
  },
  "universal_wall_artwork_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_artwork_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_wall_artwork_a/front_thumbnail.png")),
  },
  "universal_ceiling_light_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_ceiling_light_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_ceiling_light_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_ceiling_light_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_ceiling_light_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_ceiling_light_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_ceiling_light_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_ceiling_light_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_ceiling_light_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_ceiling_light_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_ceiling_light_a/front_thumbnail.png")),
  },
  "universal_curtain_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_curtain_set_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_curtain_set_a/front_thumbnail.png")),
  },
  "universal_decorative_object_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_decorative_object_set_a/front_thumbnail.png")),
  },
  "universal_small_speaker_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_small_speaker_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_small_speaker_a/front_thumbnail.png")),
  },
  "universal_rug_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_rug_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_rug_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_rug_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_rug_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_rug_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_rug_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_rug_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_rug_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_rug_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_rug_a/front_thumbnail.png")),
  },
  "universal_full_length_mirror_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_full_length_mirror_a/front_thumbnail.png")),
  },
  "universal_open_display_shelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_open_display_shelf_a/front_thumbnail.png")),
  },
  "universal_room_divider_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_body_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_shadow_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_room_divider_a_front_thumbnail_v1", require("./assets/runtime/room-vnext/full-wave-v1/universal_room_divider_a/front_thumbnail.png")),
  },
} as const
