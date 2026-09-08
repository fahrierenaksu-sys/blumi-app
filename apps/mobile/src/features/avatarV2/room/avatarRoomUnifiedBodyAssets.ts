import type {
  RoomAvatarAppearance,
  RoomAvatarBodyPreset,
  RoomAvatarCatalogItem
} from "./avatarRoom.types"
import type { RoomV2AssetRef } from "../../roomV2/roomV2.types"
import { roomAvatarAsset, roomAvatarAssetSequence } from "./avatarRoomAssets"

type BodySurfaceDefinition = {
  baseId: string
  faceId: string
  bodyPreset: RoomAvatarBodyPreset
  name: string
  staticSource: ReturnType<typeof require>
  walkingSources: readonly [
    ReturnType<typeof require>,
    ReturnType<typeof require>,
    ReturnType<typeof require>,
    ReturnType<typeof require>
  ]
  sittingSource: ReturnType<typeof require>
}

const bodySurfaceKey = (baseId: string, faceId: string) => `${baseId}::${faceId}`

function createBodySurfaceItem(
  definition: BodySurfaceDefinition
): RoomAvatarCatalogItem {
  const walkingFrames = definition.walkingSources.map((source, index) =>
    roomAvatarAsset(`${definition.baseId}_walking_front_f0${index + 1}`, source)
  ) as [RoomV2AssetRef, ...RoomV2AssetRef[]]

  return {
    id: definition.baseId,
    type: "base",
    bodyPreset: definition.bodyPreset,
    name: definition.name,
    // The selector inherits the canonical base layer order and fit metadata.
    layerOrder: 0,
    asset: roomAvatarAsset(`${definition.baseId}_unified`, definition.staticSource),
    assetsByMotion: {
      walking: {
        front: roomAvatarAssetSequence(walkingFrames)
      },
      sitting: {
        front: roomAvatarAsset(
          `${definition.baseId}_sitting_front_f01`,
          definition.sittingSource
        )
      }
    }
  }
}

const BODY_SURFACE_DEFINITIONS: readonly BodySurfaceDefinition[] = [
  {
    baseId: "room_avatar_base_male_light_v1",
    faceId: "room_avatar_face_male_warm_friendly_v1",
    bodyPreset: "male",
    name: "Male Light Warm Friendly Unified Body Surface",
    staticSource: require("../assets/room/avatar_room_body_surface_male_light_warm_friendly_v1.png"),
    walkingSources: [
      require("../assets/room/motion/room_avatar_body_surface_male_light_warm_friendly_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_body_surface_male_light_warm_friendly_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_body_surface_male_light_warm_friendly_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_body_surface_male_light_warm_friendly_v1_walking_front_f04.png")
    ],
    sittingSource: require("../assets/room/motion/room_avatar_body_surface_male_light_warm_friendly_v1_sitting_front_f01.png")
  },
  {
    baseId: "room_avatar_base_female_v2",
    faceId: "room_avatar_face_female_soft_doll_foundation_v2",
    bodyPreset: "female",
    name: "Female Soft Doll Unified Body Surface",
    staticSource: require("../assets/room/avatar_room_body_surface_female_soft_doll_v2.png"),
    walkingSources: [
      require("../assets/room/motion/room_avatar_body_surface_female_soft_doll_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_soft_doll_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_soft_doll_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_soft_doll_v2_walking_front_f04.png")
    ],
    sittingSource: require("../assets/room/motion/room_avatar_body_surface_female_soft_doll_v2_sitting_front_f01.png")
  },
  {
    baseId: "room_avatar_base_female_v2",
    faceId: "room_avatar_face_female_warm_peach_foundation_v2",
    bodyPreset: "female",
    name: "Female Warm Peach Unified Body Surface",
    staticSource: require("../assets/room/avatar_room_body_surface_female_warm_peach_v2.png"),
    walkingSources: [
      require("../assets/room/motion/room_avatar_body_surface_female_warm_peach_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_warm_peach_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_warm_peach_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_warm_peach_v2_walking_front_f04.png")
    ],
    sittingSource: require("../assets/room/motion/room_avatar_body_surface_female_warm_peach_v2_sitting_front_f01.png")
  },
  {
    baseId: "room_avatar_base_female_v2",
    faceId: "room_avatar_face_female_rose_heart_foundation_v2",
    bodyPreset: "female",
    name: "Female Rose Heart Unified Body Surface",
    staticSource: require("../assets/room/avatar_room_body_surface_female_rose_heart_v2.png"),
    walkingSources: [
      require("../assets/room/motion/room_avatar_body_surface_female_rose_heart_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_rose_heart_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_rose_heart_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_body_surface_female_rose_heart_v2_walking_front_f04.png")
    ],
    sittingSource: require("../assets/room/motion/room_avatar_body_surface_female_rose_heart_v2_sitting_front_f01.png")
  }
]

const BODY_SURFACE_ITEMS = new Map(
  BODY_SURFACE_DEFINITIONS.map((definition) => [
    bodySurfaceKey(definition.baseId, definition.faceId),
    createBodySurfaceItem(definition)
  ])
)

export function resolveUnifiedRoomAvatarBody(
  appearance: RoomAvatarAppearance
): RoomAvatarCatalogItem | undefined {
  if (!appearance.faceId) return undefined
  return BODY_SURFACE_ITEMS.get(bodySurfaceKey(appearance.baseId, appearance.faceId))
}
