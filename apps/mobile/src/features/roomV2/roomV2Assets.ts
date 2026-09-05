import type { RoomV2AssetRef } from "./roomV2.types"

const image = (
  key: string,
  source: RoomV2AssetRef["source"]
): RoomV2AssetRef => ({
  key,
  source
})

// Blumi Room World contract: close mobile 2D/2.5D room stage,
// warm pastel palette, medium-soft outlines, shared contact shadows, and
// bottom-center anchors for floor furniture/avatar placement.
// RoomV2 runtime furniture assets should be tight-bound transparent PNGs so
// anchor/width/height placement stays honest. MiniRoom full-canvas prop reuse
// is legacy/temporary only and should not be used for editor/drag work.
export const roomV2Assets = {
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
    // QA-only Room Cohesion VNext proof. The catalog resolver selects these
    // four body/shadow pairs only when the explicit development flag is set;
    // production and existing user rooms keep the legacy contract untouched.
    roomVNextPinkCloudBedFrontV0_12: image(
      "room_vnext_pink_cloud_bed_front_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/front_body.png")
    ),
    roomVNextPinkCloudBedRightV0_12: image(
      "room_vnext_pink_cloud_bed_right_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/right_body.png")
    ),
    roomVNextPinkCloudBedBackV0_12: image(
      "room_vnext_pink_cloud_bed_back_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/back_body.png")
    ),
    roomVNextPinkCloudBedLeftV0_12: image(
      "room_vnext_pink_cloud_bed_left_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/left_body.png")
    ),
    roomVNextPinkCloudBedFrontShadowV0_12: image(
      "room_vnext_pink_cloud_bed_front_shadow_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/front_contact_shadow.png")
    ),
    roomVNextPinkCloudBedFrontThumbnailV0_12: image(
      "room_vnext_pink_cloud_bed_front_thumbnail_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/front_thumbnail.png")
    ),
    roomVNextPinkCloudBedRightShadowV0_12: image(
      "room_vnext_pink_cloud_bed_right_shadow_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/right_contact_shadow.png")
    ),
    roomVNextPinkCloudBedRightThumbnailV0_12: image(
      "room_vnext_pink_cloud_bed_right_thumbnail_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/right_thumbnail.png")
    ),
    roomVNextPinkCloudBedBackShadowV0_12: image(
      "room_vnext_pink_cloud_bed_back_shadow_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/back_contact_shadow.png")
    ),
    roomVNextPinkCloudBedBackThumbnailV0_12: image(
      "room_vnext_pink_cloud_bed_back_thumbnail_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/back_thumbnail.png")
    ),
    roomVNextPinkCloudBedLeftShadowV0_12: image(
      "room_vnext_pink_cloud_bed_left_shadow_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/left_contact_shadow.png")
    ),
    roomVNextPinkCloudBedLeftThumbnailV0_12: image(
      "room_vnext_pink_cloud_bed_left_thumbnail_v0_12",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.12/left_thumbnail.png")
    ),
    // Candidate-only v0.23 art pass. Its four directions retain the v2.3
    // true-3D master footprint/pivot and are never resolved without the
    // explicit development QA gate.
    roomVNextPinkCloudBedFrontV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_front_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/front_body.png")
    ),
    roomVNextPinkCloudBedRightV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_right_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/right_body.png")
    ),
    roomVNextPinkCloudBedBackV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_back_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/back_body.png")
    ),
    roomVNextPinkCloudBedLeftV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_left_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/left_body.png")
    ),
    roomVNextPinkCloudBedFrontShadowV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_front_shadow_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/front_contact_shadow.png")
    ),
    roomVNextPinkCloudBedRightShadowV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_right_shadow_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/right_contact_shadow.png")
    ),
    roomVNextPinkCloudBedBackShadowV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_back_shadow_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/back_contact_shadow.png")
    ),
    roomVNextPinkCloudBedLeftShadowV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_left_shadow_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/left_contact_shadow.png")
    ),
    roomVNextPinkCloudBedFrontThumbnailV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_front_thumbnail_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/front_thumbnail.png")
    ),
    roomVNextPinkCloudBedRightThumbnailV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_right_thumbnail_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/right_thumbnail.png")
    ),
    roomVNextPinkCloudBedBackThumbnailV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_back_thumbnail_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/back_thumbnail.png")
    ),
    roomVNextPinkCloudBedLeftThumbnailV0_23Candidate: image(
      "room_vnext_pink_cloud_bed_left_thumbnail_v0_23_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.23-candidate/left_thumbnail.png")
    ),
    // QA-only v0.34 clean-master proof. This is a real Blender master rendered
    // through the locked Room camera; production resolution remains blocked.
    roomVNextPinkCloudBedFrontV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_front_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/front_body.png")
    ),
    roomVNextPinkCloudBedRightV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_right_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/right_body.png")
    ),
    roomVNextPinkCloudBedBackV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_back_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/back_body.png")
    ),
    roomVNextPinkCloudBedLeftV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_left_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/left_body.png")
    ),
    roomVNextPinkCloudBedFrontShadowV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_front_shadow_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/front_contact_shadow.png")
    ),
    roomVNextPinkCloudBedRightShadowV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_right_shadow_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/right_contact_shadow.png")
    ),
    roomVNextPinkCloudBedBackShadowV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_back_shadow_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/back_contact_shadow.png")
    ),
    roomVNextPinkCloudBedLeftShadowV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_left_shadow_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/left_contact_shadow.png")
    ),
    roomVNextPinkCloudBedFrontThumbnailV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_front_thumbnail_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/front_thumbnail.png")
    ),
    roomVNextPinkCloudBedRightThumbnailV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_right_thumbnail_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/right_thumbnail.png")
    ),
    roomVNextPinkCloudBedBackThumbnailV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_back_thumbnail_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/back_thumbnail.png")
    ),
    roomVNextPinkCloudBedLeftThumbnailV0_34Candidate: image(
      "room_vnext_pink_cloud_bed_left_thumbnail_v0_34_candidate",
      require("./assets/runtime/room-vnext/pink-cloud-bed-v0.34-candidate/left_thumbnail.png")
    ),
    roomVNextPilotLoungeChair: {
      front: image("room_vnext_lounge_chair_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/front_body.png")),
      right: image("room_vnext_lounge_chair_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/right_body.png")),
      back: image("room_vnext_lounge_chair_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/back_body.png")),
      left: image("room_vnext_lounge_chair_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/left_body.png"))
    },
    roomVNextPilotLoungeChairShadow: {
      front: image("room_vnext_lounge_chair_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/front_contact_shadow.png")),
      right: image("room_vnext_lounge_chair_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/right_contact_shadow.png")),
      back: image("room_vnext_lounge_chair_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/back_contact_shadow.png")),
      left: image("room_vnext_lounge_chair_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/left_contact_shadow.png"))
    },
    roomVNextPilotLoungeChairOcclusion: {
      front: image("room_vnext_lounge_chair_front_occlusion_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/front_foreground_occlusion.png")),
      right: image("room_vnext_lounge_chair_right_occlusion_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/right_foreground_occlusion.png")),
      back: image("room_vnext_lounge_chair_back_occlusion_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/back_foreground_occlusion.png")),
      left: image("room_vnext_lounge_chair_left_occlusion_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/left_foreground_occlusion.png"))
    },
    roomVNextPilotLoungeChairThumbnail: image("room_vnext_lounge_chair_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lounge_chair/front_thumbnail.png")),
    roomVNextPilotRoundTable: {
      front: image("room_vnext_round_table_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/front_body.png")),
      right: image("room_vnext_round_table_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/right_body.png")),
      back: image("room_vnext_round_table_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/back_body.png")),
      left: image("room_vnext_round_table_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/left_body.png"))
    },
    roomVNextPilotRoundTableShadow: {
      front: image("room_vnext_round_table_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/front_contact_shadow.png")),
      right: image("room_vnext_round_table_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/right_contact_shadow.png")),
      back: image("room_vnext_round_table_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/back_contact_shadow.png")),
      left: image("room_vnext_round_table_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/left_contact_shadow.png"))
    },
    roomVNextPilotRoundTableThumbnail: image("room_vnext_round_table_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_round_table/front_thumbnail.png")),
    roomVNextPilotSideTable: {
      front: image("room_vnext_side_table_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/front_body.png")),
      right: image("room_vnext_side_table_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/right_body.png")),
      back: image("room_vnext_side_table_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/back_body.png")),
      left: image("room_vnext_side_table_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/left_body.png"))
    },
    roomVNextPilotSideTableShadow: {
      front: image("room_vnext_side_table_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/front_contact_shadow.png")),
      right: image("room_vnext_side_table_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/right_contact_shadow.png")),
      back: image("room_vnext_side_table_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/back_contact_shadow.png")),
      left: image("room_vnext_side_table_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/left_contact_shadow.png"))
    },
    roomVNextPilotSideTableThumbnail: image("room_vnext_side_table_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_side_table/front_thumbnail.png")),
    roomVNextPilotLamp: {
      front: image("room_vnext_lamp_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/front_body.png")),
      right: image("room_vnext_lamp_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/right_body.png")),
      back: image("room_vnext_lamp_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/back_body.png")),
      left: image("room_vnext_lamp_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/left_body.png"))
    },
    roomVNextPilotLampShadow: {
      front: image("room_vnext_lamp_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/front_contact_shadow.png")),
      right: image("room_vnext_lamp_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/right_contact_shadow.png")),
      back: image("room_vnext_lamp_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/back_contact_shadow.png")),
      left: image("room_vnext_lamp_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/left_contact_shadow.png"))
    },
    roomVNextPilotLampThumbnail: image("room_vnext_lamp_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_lamp/front_thumbnail.png")),
    roomVNextPilotBookshelf: {
      front: image("room_vnext_bookshelf_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/front_body.png")),
      right: image("room_vnext_bookshelf_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/right_body.png")),
      back: image("room_vnext_bookshelf_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/back_body.png")),
      left: image("room_vnext_bookshelf_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/left_body.png"))
    },
    roomVNextPilotBookshelfShadow: {
      front: image("room_vnext_bookshelf_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/front_contact_shadow.png")),
      right: image("room_vnext_bookshelf_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/right_contact_shadow.png")),
      back: image("room_vnext_bookshelf_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/back_contact_shadow.png")),
      left: image("room_vnext_bookshelf_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/left_contact_shadow.png"))
    },
    roomVNextPilotBookshelfThumbnail: image("room_vnext_bookshelf_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_bookshelf/front_thumbnail.png")),
    roomVNextPilotRug: {
      front: image("room_vnext_rug_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/front_body.png")),
      right: image("room_vnext_rug_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/right_body.png")),
      back: image("room_vnext_rug_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/back_body.png")),
      left: image("room_vnext_rug_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/left_body.png"))
    },
    roomVNextPilotRugShadow: {
      front: image("room_vnext_rug_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/front_contact_shadow.png")),
      right: image("room_vnext_rug_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/right_contact_shadow.png")),
      back: image("room_vnext_rug_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/back_contact_shadow.png")),
      left: image("room_vnext_rug_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/left_contact_shadow.png"))
    },
    roomVNextPilotRugThumbnail: image("room_vnext_rug_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_rug/front_thumbnail.png")),
    roomVNextPilotTabletopPlant: {
      front: image("room_vnext_tabletop_plant_front_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/front_body.png")),
      right: image("room_vnext_tabletop_plant_right_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/right_body.png")),
      back: image("room_vnext_tabletop_plant_back_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/back_body.png")),
      left: image("room_vnext_tabletop_plant_left_body_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/left_body.png"))
    },
    roomVNextPilotTabletopPlantShadow: {
      front: image("room_vnext_tabletop_plant_front_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/front_contact_shadow.png")),
      right: image("room_vnext_tabletop_plant_right_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/right_contact_shadow.png")),
      back: image("room_vnext_tabletop_plant_back_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/back_contact_shadow.png")),
      left: image("room_vnext_tabletop_plant_left_shadow_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/left_contact_shadow.png"))
    },
    roomVNextPilotTabletopPlantThumbnail: image("room_vnext_tabletop_plant_thumbnail_v17", require("./assets/runtime/room-vnext/pilot-v17/room_vnext_tabletop_plant/front_thumbnail.png")),
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
