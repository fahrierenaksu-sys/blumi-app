import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo } from "react"
import { type ImageSourcePropType, Pressable, Text, View } from "react-native"
import { getShopProductThumbnailBounds } from "../../shop/shopAssets"
import { getShopThumbnailLayout } from "../../shop/shopThumbnailLayout"
import { getGarmentThumbnailOverride } from "../garmentThumbnailOverrides"
import type { AvatarCatalogItem } from "../avatarV2.types"
import { getMaleRigLayerThumbnailPresentation } from "../maleRigThumbnailPresentation"
import { MALE_CAPSULE_PREVIEW_SOURCES } from "../maleCapsulePreviewSources"
import { getWardrobeThumbnailPresentation } from "../wardrobeThumbnailPresentation"
import { getAvatarAutomationSlug } from "../qa/avatarQaInventory"
import { getAvatarItemPreviewImageStyle, getStarterLayerThumbnail } from "./wardrobeCatalogModel"
import { WARDROBE_ART_ASPECT, WARDROBE_THUMB_BOX } from "./wardrobeStageLayout"
import { CATEGORY_ICONS } from "./wardrobeCopy"
import { WARDROBE_SQUARE_THUMBNAIL_SOURCES, isAvatarItemCutoutPreview } from "./wardrobePreviewSources"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/** Air between a whole-garment cutout and the card edge. */
const CUTOUT_INSET = 8

export const WardrobeCatalogCard = memo(function WardrobeCatalogCard(props: {
  item: AvatarCatalogItem
  /** The name shown on the card, in the app's language. */
  name: string
  equipped: boolean
  itemStateLabel: string
  wearingLabel: string
  locked: boolean
  /** A locked item currently tried on the stage (MICRO-3). */
  previewing: boolean
  lockedHint: string
  width: number
  onEquip: (item: AvatarCatalogItem) => void
  /** A locked card previews instead of equipping; ownership is never assumed. */
  onPreviewLocked: (item: AvatarCatalogItem) => void
  previewSource?: ImageSourcePropType
}) {
  const {
    item, name, equipped, itemStateLabel, wearingLabel, locked, previewing, lockedHint, width,
    onEquip, onPreviewLocked, previewSource
  } = props
  const rigLayerPresentation = item.id in MALE_CAPSULE_PREVIEW_SOURCES
    ? getMaleRigLayerThumbnailPresentation(item.type, "wardrobe")
    : undefined
  const thumbnailPresentation = getWardrobeThumbnailPresentation({
    type: item.type,
    isRigLayer: Boolean(rigLayerPresentation),
    isSquareAsset:
      item.id in WARDROBE_SQUARE_THUMBNAIL_SOURCES ||
      Boolean(getGarmentThumbnailOverride(item.id)) ||
      ["face", "eyes", "nose", "mouth"].includes(item.type),
    isCutoutAsset: isAvatarItemCutoutPreview(item)
  })
  const isCutout = thumbnailPresentation.frame === "cutout"
  const artHeight = Math.round(width * WARDROBE_ART_ASPECT)
  const starterThumbnail = thumbnailPresentation.frame === "legacy"
    ? getStarterLayerThumbnail(item.id)
    : undefined
  // Shop bounds describe these exact preview sources, including male room
  // layers. Fit their visible pixels rather than offsetting a scaled canvas.
  const usesShopBounds = thumbnailPresentation.frame !== "legacy" ||
    item.type === "hair" || item.type === "accessory"
  const thumbnailBounds = isCutout
    ? undefined
    : usesShopBounds ? getShopProductThumbnailBounds(item.id) : starterThumbnail?.bounds
  const preferredBox = thumbnailPresentation.frame === "portrait" || item.type === "hair"
    ? { width, height: artHeight }
    : starterThumbnail?.box ?? WARDROBE_THUMB_BOX
  // The artwork viewport includes a 1.5px border on each side.
  const thumbnailBox = {
    width: Math.min(preferredBox.width, width - 3),
    height: Math.min(preferredBox.height, artHeight - 3)
  }
  const thumbnailLayout = thumbnailBounds
    ? getShopThumbnailLayout(thumbnailBounds, thumbnailBox.width, thumbnailBox.height)
    : undefined
  // A cutout is already cropped to the garment: contain it whole in an inset box.
  const cutoutBox = {
    width: Math.max(0, width - 3 - CUTOUT_INSET * 2),
    height: Math.max(0, artHeight - 3 - CUTOUT_INSET * 2)
  }
  const isBoxed = Boolean(thumbnailLayout) || isCutout

  const image = previewSource ? (
    <ExpoImage
      source={previewSource}
      contentFit="contain"
      cachePolicy="memory-disk"
      // WRD-2: static thumbnails never fade in after decoding (as in the Shop).
      transition={0}
      style={[
        thumbnailPresentation.frame === "rig"
          ? styles.itemPreviewRigLayer
          : thumbnailPresentation.frame === "portrait"
            ? styles.itemPreviewFeaturePortrait
            : thumbnailPresentation.frame === "square" || isCutout || thumbnailLayout
              ? styles.itemPreviewSquare
              : styles.itemPreviewImage,
        thumbnailLayout ? { position: "absolute", ...thumbnailLayout } : null,
        rigLayerPresentation && !thumbnailLayout
          ? {
              top: rigLayerPresentation.top,
              transform: [{ scale: rigLayerPresentation.scale }]
            }
          : thumbnailPresentation.frame === "legacy" && !thumbnailLayout
            ? getAvatarItemPreviewImageStyle(item)
            : null
      ]}
    />
  ) : null

  return (
    <Pressable
      testID={`wardrobe-item-${getAvatarAutomationSlug(item.id)}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${equipped ? wearingLabel : itemStateLabel}`}
      accessibilityHint={locked ? lockedHint : undefined}
      accessibilityState={{ selected: equipped || previewing }}
      onPress={() => (locked ? onPreviewLocked(item) : onEquip(item))}
      style={({ pressed }) => [
        styles.itemCard,
        { width },
        pressed ? styles.itemCardPressed : null
      ]}
    >
      <View
        style={[
          styles.itemArt,
          { height: artHeight },
          equipped ? styles.itemArtSelected : null,
          locked ? styles.itemArtLocked : null,
          previewing ? styles.itemArtPreviewing : null
        ]}
      >
        {previewSource ? (
          isBoxed
            ? (
              <View style={[styles.itemThumbBox, isCutout ? cutoutBox : thumbnailBox]}>{image}</View>
            )
            : image
        ) : (
          <View style={styles.itemIconShell}>
            <Ionicons
              name={locked ? "lock-closed-outline" : CATEGORY_ICONS[item.type]}
              size={20}
              color={wardrobeTheme.muted}
            />
          </View>
        )}
        {equipped ? (
          <View style={styles.itemCheckBadge}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        ) : null}
        {locked && previewSource ? (
          <View style={styles.itemLock}>
            <Ionicons name="lock-closed-outline" size={14} color={wardrobeTheme.muted} />
          </View>
        ) : null}
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={2}
        style={styles.itemName}
      >
        {name}
      </Text>
    </Pressable>
  )
}, (previous, next) =>
  previous.item === next.item &&
  previous.name === next.name &&
  previous.equipped === next.equipped &&
  previous.itemStateLabel === next.itemStateLabel &&
  previous.wearingLabel === next.wearingLabel &&
  previous.locked === next.locked &&
  previous.previewing === next.previewing &&
  previous.lockedHint === next.lockedHint &&
  previous.onPreviewLocked === next.onPreviewLocked &&
  previous.width === next.width &&
  previous.onEquip === next.onEquip &&
  previous.previewSource === next.previewSource
)
