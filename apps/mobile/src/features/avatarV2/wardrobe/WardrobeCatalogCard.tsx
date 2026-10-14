import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo } from "react"
import { type ImageSourcePropType, Pressable, Text, View } from "react-native"
import { getShopThumbnailLayout } from "../../shop/shopThumbnailLayout"
import type { AvatarCatalogItem } from "../avatarV2.types"
import { getAvatarAutomationSlug } from "../qa/avatarQaInventory"
import { WARDROBE_ART_ASPECT } from "./wardrobeStageLayout"
import { CATEGORY_ICONS } from "./wardrobeCopy"
import { getAvatarItemPreviewBounds, isAvatarItemCutoutPreview } from "./wardrobePreviewSources"
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
  const artHeight = Math.round(width * WARDROBE_ART_ASPECT)
  // A cutout (2.5D thumbnail) is already cropped to the garment: contain it whole in an inset box.
  const isCutout = isAvatarItemCutoutPreview(item)
  const cutoutBox = {
    width: Math.max(0, width - 3 - CUTOUT_INSET * 2),
    height: Math.max(0, artHeight - 3 - CUTOUT_INSET * 2)
  }
  // The default feature portrait fits its visible pixels to the card art (1.5px border on each side).
  const portraitBounds = isCutout ? undefined : getAvatarItemPreviewBounds(item)
  const portraitLayout = portraitBounds
    ? getShopThumbnailLayout(portraitBounds, width - 3, artHeight - 3)
    : undefined
  const isBoxed = isCutout || Boolean(portraitLayout)

  const image = previewSource ? (
    <ExpoImage
      source={previewSource}
      contentFit="contain"
      cachePolicy="memory-disk"
      // WRD-2: static thumbnails never fade in after decoding (as in the Shop).
      transition={0}
      style={[
        portraitBounds ? styles.itemPreviewFeaturePortrait : styles.itemPreviewSquare,
        portraitLayout ? { position: "absolute", ...portraitLayout } : null
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
              <View style={[styles.itemThumbBox, isCutout ? cutoutBox : { width: width - 3, height: artHeight - 3 }]}>
                {image}
              </View>
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
