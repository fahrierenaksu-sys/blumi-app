import type { ImageSourcePropType } from "react-native"

import { ROOM_PET_CAT_WHITE_SHEET_LAYOUT } from "./roomPetCatWhiteSheet"

/**
 * The owner-approved white cat sheet (one asset, P1 clips). It is drawn only
 * while the room pet flag is on and is not an item, shop entry or receipt.
 */
export const ROOM_PET_CAT_WHITE_SHEET = {
  source: require("../../../../assets/roomPet/catWhite/room_pet_cat_white_sheet.png") as ImageSourcePropType,
  layout: ROOM_PET_CAT_WHITE_SHEET_LAYOUT
}
