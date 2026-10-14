import type { ImageSourcePropType } from "react-native"
import type { AvatarCatalogItem } from "../avatarV2.types"
import { getAvatarItemStillThumbnail } from "../../avatar/stills/stillThumbnail"

/**
 * The girl's default eyes, nose and mouth have no 2.5D picture (the rig draws one face), so their Avatar-tab cards
 * keep the one pre-2.5D portrait they always showed. Every other pre-2.5D card picture is retired.
 */
const DEFAULT_FEATURE_PORTRAIT: ImageSourcePropType = require("../assets/default_feature_portrait.png")
const DEFAULT_FEATURE_ITEM_IDS: ReadonlySet<string> = new Set([
  "avatar_v2_eyes_mocha_doe",
  "avatar_v2_nose_soft_button",
  "avatar_v2_mouth_peach_whisper_smile"
])
/** Visible-pixel bounds of that portrait: [canvas width, canvas height, x, y, visible width, visible height]. */
const DEFAULT_FEATURE_PORTRAIT_BOUNDS: readonly number[] = [220, 220, 0, 13, 220, 207]

/** The card picture of a wardrobe item: its baked 2.5D thumbnail, or none (the card shows its category icon). */
export function getAvatarItemPreviewSource(
  item: Pick<AvatarCatalogItem, "id">
): ImageSourcePropType | undefined {
  return getAvatarItemStillThumbnail(item.id)
    ?? (DEFAULT_FEATURE_ITEM_IDS.has(item.id) ? DEFAULT_FEATURE_PORTRAIT : undefined)
}

/** Bounds for a card picture that is not already cropped tight (only the default feature portrait). */
export function getAvatarItemPreviewBounds(item: Pick<AvatarCatalogItem, "id">): readonly number[] | undefined {
  return DEFAULT_FEATURE_ITEM_IDS.has(item.id) ? DEFAULT_FEATURE_PORTRAIT_BOUNDS : undefined
}

/**
 * True when the card's picture is a whole-garment cutout (the 2.5D thumbnails): it is fitted whole into the card,
 * never shifted like the old room-canvas layers, or a shoe falls out of the frame and a top shows only its hem.
 */
export function isAvatarItemCutoutPreview(item: Pick<AvatarCatalogItem, "id">): boolean {
  return Boolean(getAvatarItemStillThumbnail(item.id))
}
