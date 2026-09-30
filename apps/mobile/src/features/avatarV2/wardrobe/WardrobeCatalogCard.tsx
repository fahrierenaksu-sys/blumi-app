import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo } from "react"
import { type ImageSourcePropType, Pressable, Text, View } from "react-native"
import { getShopProductThumbnailBounds } from "../../shop/shopAssets"
import { getShopThumbnailLayout } from "../../shop/shopThumbnailLayout"
import { uiTheme } from "../../../ui/theme"
import { getGarmentThumbnailOverride } from "../garmentThumbnailOverrides"
import type { AvatarCatalogItem } from "../avatarV2.types"
import { getMaleRigLayerThumbnailPresentation } from "../maleRigThumbnailPresentation"
import { MALE_CAPSULE_PREVIEW_SOURCES } from "../maleCapsulePreviewSources"
import { getWardrobeThumbnailPresentation } from "../wardrobeThumbnailPresentation"
import { getAvatarAutomationSlug } from "../qa/avatarQaInventory"
import { getAvatarItemPreviewImageStyle } from "./wardrobeCatalogModel"
import { CATEGORY_ICONS } from "./wardrobeCopy"
import { WARDROBE_SQUARE_THUMBNAIL_SOURCES } from "./wardrobePreviewSources"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export const WardrobeCatalogCard = memo(function WardrobeCatalogCard(props: {
  item: AvatarCatalogItem
  equipped: boolean
  itemStateLabel: string
  wearingLabel: string
  locked: boolean
  onEquip: (item: AvatarCatalogItem) => void
  previewSource?: ImageSourcePropType
  thumbnailTransition: number
}) {
  const { item, equipped, itemStateLabel, wearingLabel, locked, onEquip, previewSource, thumbnailTransition } = props
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
  const visibleThumbnailLayout = thumbnailPresentation.frame === "square"
    ? getShopThumbnailLayout(getShopProductThumbnailBounds(item.id), 100, 68)
    : undefined
  const thumbnailLayout = visibleThumbnailLayout
    ? { ...visibleThumbnailLayout, left: visibleThumbnailLayout.left + 16, top: visibleThumbnailLayout.top + 10 }
    : undefined

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
        equipped ? styles.itemCardEquipped : null,
        locked ? styles.itemCardLocked : null,
        pressed ? styles.itemCardPressed : null
      ]}
    >
      <View style={styles.itemPreviewStage}>
        <View style={styles.itemPreviewHalo} />
        {previewSource ? (
          <ExpoImage
            source={previewSource}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={thumbnailTransition}
            style={[
              thumbnailPresentation.frame === "rig"
                ? styles.itemPreviewRigLayer
                : thumbnailPresentation.frame === "portrait"
                  ? styles.itemPreviewFeaturePortrait
                : thumbnailPresentation.frame === "square"
                  ? styles.itemPreviewSquare
                  : styles.itemPreviewImage,
              thumbnailLayout ? { position: "absolute", ...thumbnailLayout } : null,
              rigLayerPresentation
                ? {
                    top: rigLayerPresentation.top,
                    transform: [{ scale: rigLayerPresentation.scale }]
                  }
                : thumbnailPresentation.frame === "legacy"
                  ? getAvatarItemPreviewImageStyle(item)
                  : null
            ]}
          />
        ) : (
          <View
            style={[
              styles.itemIconShell,
              equipped ? styles.itemIconShellEquipped : null
            ]}
          >
            <Ionicons
              name={locked ? "lock-closed" : CATEGORY_ICONS[item.type]}
              size={20}
              color={equipped ? "#FFFFFF" : uiTheme.colors.primary}
            />
          </View>
        )}
        {equipped ? (
          <View style={styles.itemCheckBadge}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.itemName} numberOfLines={2}>
        {item.name}
      </Text>
      <View
        style={[
          styles.itemMetaPill,
          equipped ? styles.itemMetaPillEquipped : null,
          locked ? styles.itemMetaLocked : null
        ]}
      >
        <Text style={styles.itemMeta} numberOfLines={1}>
          {equipped ? wearingLabel : itemStateLabel}
        </Text>
      </View>
    </Pressable>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.equipped === next.equipped &&
  previous.itemStateLabel === next.itemStateLabel &&
  previous.wearingLabel === next.wearingLabel &&
  previous.locked === next.locked &&
  previous.onEquip === next.onEquip &&
  previous.previewSource === next.previewSource
)
