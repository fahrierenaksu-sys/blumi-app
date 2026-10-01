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
import { WARDROBE_SQUARE_THUMBNAIL_SOURCES } from "./wardrobePreviewSources"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export const WardrobeCatalogCard = memo(function WardrobeCatalogCard(props: {
  item: AvatarCatalogItem
  equipped: boolean
  itemStateLabel: string
  wearingLabel: string
  locked: boolean
  width: number
  onEquip: (item: AvatarCatalogItem) => void
  previewSource?: ImageSourcePropType
}) {
  const {
    item, equipped, itemStateLabel, wearingLabel, locked, width, onEquip,
    previewSource
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
      ["face", "eyes", "nose", "mouth"].includes(item.type)
  })
  const starterThumbnail = thumbnailPresentation.frame === "legacy"
    ? getStarterLayerThumbnail(item.id)
    : undefined
  const thumbnailBounds = thumbnailPresentation.frame === "square"
    ? getShopProductThumbnailBounds(item.id)
    : starterThumbnail?.bounds
  const thumbnailBox = starterThumbnail?.box ?? WARDROBE_THUMB_BOX
  const thumbnailLayout = thumbnailBounds
    ? getShopThumbnailLayout(thumbnailBounds, thumbnailBox.width, thumbnailBox.height)
    : undefined
  const isBoxed = Boolean(thumbnailLayout)

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
            : thumbnailPresentation.frame === "square" || thumbnailLayout
              ? styles.itemPreviewSquare
              : styles.itemPreviewImage,
        thumbnailLayout ? { position: "absolute", ...thumbnailLayout } : null,
        rigLayerPresentation
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
      accessibilityLabel={`${item.name}, ${equipped ? wearingLabel : itemStateLabel}`}
      accessibilityState={{
        disabled: locked,
        selected: equipped
      }}
      disabled={locked}
      onPress={() => onEquip(item)}
      style={({ pressed }) => [
        styles.itemCard,
        { width },
        pressed ? styles.itemCardPressed : null
      ]}
    >
      <View
        style={[
          styles.itemArt,
          { height: Math.round(width * WARDROBE_ART_ASPECT) },
          equipped ? styles.itemArtSelected : null,
          locked ? styles.itemArtLocked : null
        ]}
      >
        {previewSource ? (
          isBoxed
            ? (
              <View style={[styles.itemThumbBox, thumbnailBox]}>{image}</View>
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
        {item.name}
      </Text>
    </Pressable>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.equipped === next.equipped &&
  previous.itemStateLabel === next.itemStateLabel &&
  previous.wearingLabel === next.wearingLabel &&
  previous.locked === next.locked &&
  previous.width === next.width &&
  previous.onEquip === next.onEquip &&
  previous.previewSource === next.previewSource
)
