import type { RoomFurnitureRotation, RoomV2AssetRef } from "./roomV2.types"

const asset = (key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef => ({ key, source })

export interface RoomVNextFullWavePolishRuntimeAssetBundle {
  body: Record<RoomFurnitureRotation, RoomV2AssetRef>
  shadow: Record<RoomFurnitureRotation, RoomV2AssetRef>
  thumbnail: RoomV2AssetRef
}

/** Candidate-only v2 polish refs. Never use this map without the explicit QA polish flag. */
export const ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS: Readonly<Record<string, RoomVNextFullWavePolishRuntimeAssetBundle>> = {
  "universal_open_bookshelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_open_bookshelf_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_open_bookshelf_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_open_bookshelf_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_bookshelf_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_bookshelf_a/front_thumbnail.png")),
  },
  "universal_wall_clock_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_clock_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_wall_clock_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_wall_clock_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_wall_clock_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_clock_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_clock_a/front_thumbnail.png")),
  },
  "universal_ceramic_vase_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_ceramic_vase_set_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_ceramic_vase_set_a/front_thumbnail.png")),
  },
  "universal_books_magazine_stack_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_books_magazine_stack_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_books_magazine_stack_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_books_magazine_stack_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_books_magazine_stack_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_books_magazine_stack_a/front_thumbnail.png")),
  },
  "universal_tea_coffee_tray_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_tea_coffee_tray_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_tea_coffee_tray_a/front_thumbnail.png")),
  },
  "universal_soft_floor_cushion_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_floor_cushion_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_floor_cushion_a/front_thumbnail.png")),
  },
  "universal_nightstand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_nightstand_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_nightstand_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_nightstand_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_nightstand_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_nightstand_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_nightstand_a/front_thumbnail.png")),
  },
  "universal_laundry_basket_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_laundry_basket_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_laundry_basket_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_laundry_basket_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_laundry_basket_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_laundry_basket_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_laundry_basket_a/front_thumbnail.png")),
  },
  "universal_cushion_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_cushion_set_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_cushion_set_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_cushion_set_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_cushion_set_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_cushion_set_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_cushion_set_a/front_thumbnail.png")),
  },
  "universal_shoe_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_shoe_cabinet_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_shoe_cabinet_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_shoe_cabinet_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_shoe_cabinet_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_shoe_cabinet_a/front_thumbnail.png")),
  },
  "universal_rounded_wardrobe_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_rounded_wardrobe_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_rounded_wardrobe_a/front_thumbnail.png")),
  },
  "universal_soft_coat_stand_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_soft_coat_stand_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_soft_coat_stand_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_soft_coat_stand_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_soft_coat_stand_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_soft_coat_stand_a/front_thumbnail.png")),
  },
  "universal_storage_cabinet_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_storage_cabinet_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_storage_cabinet_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_storage_cabinet_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_storage_cabinet_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_storage_cabinet_a/front_thumbnail.png")),
  },
  "universal_dresser_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_dresser_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_dresser_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_dresser_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_dresser_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_dresser_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_dresser_a/front_thumbnail.png")),
  },
  "universal_wall_artwork_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_wall_artwork_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_wall_artwork_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_wall_artwork_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_wall_artwork_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_wall_artwork_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_wall_artwork_a/front_thumbnail.png")),
  },
  "universal_curtain_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_curtain_set_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_curtain_set_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_curtain_set_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_curtain_set_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_curtain_set_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_curtain_set_a/front_thumbnail.png")),
  },
  "universal_decorative_object_set_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_decorative_object_set_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_decorative_object_set_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_decorative_object_set_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_decorative_object_set_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_decorative_object_set_a/front_thumbnail.png")),
  },
  "universal_small_speaker_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_small_speaker_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_small_speaker_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_small_speaker_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_small_speaker_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_small_speaker_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_small_speaker_a/front_thumbnail.png")),
  },
  "universal_full_length_mirror_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_full_length_mirror_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_full_length_mirror_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_full_length_mirror_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_full_length_mirror_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_full_length_mirror_a/front_thumbnail.png")),
  },
  "universal_open_display_shelf_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_open_display_shelf_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_open_display_shelf_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_open_display_shelf_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_open_display_shelf_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_open_display_shelf_a/front_thumbnail.png")),
  },
  "universal_room_divider_a": {
    body: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/front_body.png")),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/right_body.png")),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/back_body.png")),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_body_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/left_body.png")),
    },
    shadow: {
      front: asset("room_vnext_full_wave_universal_room_divider_a_front_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/front_contact_shadow.png")),
      right: asset("room_vnext_full_wave_universal_room_divider_a_right_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/right_contact_shadow.png")),
      back: asset("room_vnext_full_wave_universal_room_divider_a_back_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/back_contact_shadow.png")),
      left: asset("room_vnext_full_wave_universal_room_divider_a_left_shadow_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/left_contact_shadow.png")),
    },
    thumbnail: asset("room_vnext_full_wave_universal_room_divider_a_front_thumbnail_v2", require("./assets/runtime/room-vnext/full-wave-v2-polish-final3/universal_room_divider_a/front_thumbnail.png")),
  },
} as const
