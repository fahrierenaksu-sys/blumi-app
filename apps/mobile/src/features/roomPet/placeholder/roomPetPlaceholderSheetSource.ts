import type { ImageSourcePropType } from "react-native"

import { ROOM_PET_PLACEHOLDER_SHEET_LAYOUT } from "./roomPetPlaceholderSheet"

/**
 * The PLACEHOLDER pet sheet (one asset). It is drawn only while the room pet
 * flag is on and is never an item, shop entry or receipt.
 */
export const ROOM_PET_PLACEHOLDER_SHEET = {
  source: require("../../../../assets/roomPet/placeholder/room_pet_placeholder_sheet.png") as ImageSourcePropType,
  layout: ROOM_PET_PLACEHOLDER_SHEET_LAYOUT
}
