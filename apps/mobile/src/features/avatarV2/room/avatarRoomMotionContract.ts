import femaleWardrobePromotionContract from "./femaleWardrobePromotionContract.json"

export const ROOM_AVATAR_FRAME_DURATION_MS =
  femaleWardrobePromotionContract.frameDurationMs

export const FEMALE_WARDROBE_QUARANTINED_ITEM_IDS = new Set<string>(
  femaleWardrobePromotionContract.quarantinedFemaleItemIds
)

export const FEMALE_PANTS_OVER_SHOE_UPPER_IDS = new Set<string>(
  femaleWardrobePromotionContract.pantsOverShoeUpperIds
)
