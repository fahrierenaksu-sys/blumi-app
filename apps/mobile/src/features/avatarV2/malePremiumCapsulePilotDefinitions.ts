import { MALE_PREMIUM_CAPSULE_INVENTORY } from "./malePremiumCapsuleInventory"

export type MalePremiumCapsuleRuntimeType = "top" | "bottom" | "shoes" | "accessory" | "hairFront"

export interface MalePremiumCapsuleRuntimeDefinition {
  readonly slug: string
  readonly name: string
  readonly type: MalePremiumCapsuleRuntimeType
  readonly roomId: string
  readonly roomAssetKey: string
  readonly roomMotionAssetKey: string
  readonly accessoryGroup?: "headwear" | "eyewear" | "neck" | "bag"
}

export const MALE_PREMIUM_CAPSULE_RUNTIME: readonly MalePremiumCapsuleRuntimeDefinition[] =
  MALE_PREMIUM_CAPSULE_INVENTORY.map(({ id, name, type, accessoryGroup }) => {
    const roomType = type === "hairFront" ? "hair_front" : type
    return {
      slug: id,
      name,
      type,
      roomId: `room_avatar_${roomType}_male_${id}_v1`,
      roomAssetKey: id,
      roomMotionAssetKey: id,
      ...(accessoryGroup ? { accessoryGroup } : {})
    }
  })
