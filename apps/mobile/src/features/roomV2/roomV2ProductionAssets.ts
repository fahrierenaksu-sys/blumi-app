import type { RoomV2AssetRef } from "./roomV2.types"

const image = (
  key: string,
  source: RoomV2AssetRef["source"]
): RoomV2AssetRef => ({ key, source })

/**
 * Production-only Room V2 asset registry.
 *
 * Historical QA and candidate waves intentionally live outside this module.
 * Keeping this registry closed prevents disabled feature flags from pulling
 * hundreds of rejected candidate sprites into the production Metro graph.
 */
export const roomV2ProductionAssets = {
  shells: {
    blumiWorldShellV1: image(
      "room_v2_shell_blumi_world_v1",
      require("./assets/runtime/room_shell_blumi_world_v1.webp")
    )
  },
  furniture: {
    blumiWorldChairV1: image(
      "room_v2_furniture_world_chair_v1",
      require("./assets/runtime/furniture_world_chair_v1.png")
    ),
    blumiWorldTableV1: image(
      "room_v2_furniture_world_table_v1",
      require("./assets/runtime/furniture_world_table_v1.png")
    ),
    blumiWorldDecorV1: image(
      "room_v2_furniture_world_decor_v1",
      require("./assets/runtime/furniture_world_decor_v1.png")
    ),
    blumiCozyBedV1: image(
      "room_v2_furniture_cozy_bed_v1",
      require("./assets/runtime/starter-pink-cloud-bed/pink_cloud_bed_front_v2.png")
    ),
    blumiCozyBedRightV2: image(
      "room_v2_furniture_cozy_bed_right_v2",
      require("./assets/runtime/starter-pink-cloud-bed/pink_cloud_bed_right_v2.png")
    ),
    blumiCozyBedBackV2: image(
      "room_v2_furniture_cozy_bed_back_v2",
      require("./assets/runtime/starter-pink-cloud-bed/pink_cloud_bed_back_v2.png")
    ),
    blumiCozyBedLeftV2: image(
      "room_v2_furniture_cozy_bed_left_v2",
      require("./assets/runtime/starter-pink-cloud-bed/pink_cloud_bed_left_v2.png")
    ),
    modeledPinkCloudBedFrontV29: image(
      "room_v2_modeled_pink_cloud_bed_front_body_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_front_body_v29.png")
    ),
    modeledPinkCloudBedRightV29: image(
      "room_v2_modeled_pink_cloud_bed_right_body_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_right_body_v29.png")
    ),
    modeledPinkCloudBedBackV29: image(
      "room_v2_modeled_pink_cloud_bed_back_body_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_back_body_v29.png")
    ),
    modeledPinkCloudBedLeftV29: image(
      "room_v2_modeled_pink_cloud_bed_left_body_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_left_body_v29.png")
    ),
    modeledPinkCloudBedFrontShadowV29: image(
      "room_v2_modeled_pink_cloud_bed_front_shadow_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_front_contact_shadow_v29.png")
    ),
    modeledPinkCloudBedRightShadowV29: image(
      "room_v2_modeled_pink_cloud_bed_right_shadow_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_right_contact_shadow_v29.png")
    ),
    modeledPinkCloudBedBackShadowV29: image(
      "room_v2_modeled_pink_cloud_bed_back_shadow_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_back_contact_shadow_v29.png")
    ),
    modeledPinkCloudBedLeftShadowV29: image(
      "room_v2_modeled_pink_cloud_bed_left_shadow_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_left_contact_shadow_v29.png")
    ),
    modeledPinkCloudBedThumbnailV29: image(
      "room_v2_modeled_pink_cloud_bed_thumbnail_v29",
      require("./assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_front_thumbnail_v29.png")
    ),
    blumiBookshelfV1: image(
      "room_v2_furniture_bookshelf_v1",
      require("./assets/runtime/furniture_bookshelf_v1.webp")
    ),
    blumiHeartRugV1: image(
      "room_v2_furniture_heart_rug_v1",
      require("./assets/runtime/furniture_heart_rug_v1.webp")
    ),
    blumiSideTableV1: image(
      "room_v2_furniture_side_table_v1",
      require("./assets/runtime/furniture_side_table_v1.png")
    )
  }
} as const
