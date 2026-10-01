import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo, useCallback } from "react"
import {
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View
} from "react-native"
import { getMaleRigLayerThumbnailPresentation } from "../../avatarV2/maleRigThumbnailPresentation"
import { getAvatarAutomationSlug } from "../../avatarV2/qa/avatarQaInventory"
import type { AppLocale } from "../../session/appLocale"
import { PressableScale } from "../../../ui/PressableScale"
import { uiTheme } from "../../../ui/theme"
import {
  getAvatarItemPreviewSource,
  getRoomProductThumbnailSource,
  getShopProductThumbnailBounds,
  getShopProductThumbnailSource,
  RIG_LAYER_THUMBNAIL_ITEM_IDS
} from "../shopAssets"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import { formatCoins } from "../shopFormatters"
import { getShopProductPresentation } from "../shopProductPresentation"
import { getShopThumbnailLayout } from "../shopThumbnailLayout"
import { ShopCardSelectionRing, ShopCardViewingBadge } from "./ShopCardSelection"
import { getAvatarIcon } from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"

export const ShopProductCard = memo(function ShopProductCard(props: {
  product: ShopCatalogItem
  selected: boolean
  selectedCompact?: boolean
  inventoryVerified: boolean
  pendingInventoryLabel: string
  cardWidth: number
  cardHeight?: number
  cardPadding: number
  thumbHeight: number
  metaLabel?: string
  locale: AppLocale
  onSelectProduct: (product: ShopCatalogItem) => void
}) {
  const {
    product,
    selected,
    selectedCompact,
    inventoryVerified,
    pendingInventoryLabel,
    cardWidth,
    cardHeight,
    cardPadding,
    thumbHeight,
    metaLabel,
    locale,
    onSelectProduct
  } = props
  const copy = getShopCopy(locale)
  const presentation = getShopProductPresentation(product, locale)
  const compactCardSizeStyle =
    selectedCompact && cardWidth
      ? {
          width: cardWidth,
          height: cardHeight,
          minHeight: cardHeight,
          padding: cardPadding
        }
      : undefined
  const visibleMetaLabel = !inventoryVerified
    ? pendingInventoryLabel
    : metaLabel
      ?? (selectedCompact && product.priceCoins !== null && !product.owned
        ? formatCoins(product.priceCoins, locale)
        : selectedCompact && product.previewType === "room" && product.owned
          ? copy.readyToPlace
          : selectedCompact && product.owned && product.previewType === "avatar"
            ? copy.ownedCompact
            : presentation.stateLabel)
  const avatarPreviewSource = product.avatarItem
    ? getShopProductThumbnailSource(product.sourceItemId)
      ?? getAvatarItemPreviewSource(product.avatarItem)
    : undefined
  const isRigLayerSource = product.avatarItem
    ? RIG_LAYER_THUMBNAIL_ITEM_IDS.has(product.sourceItemId)
    : false
  const roomPreviewSource = product.roomItem
    ? getRoomProductThumbnailSource(product.sourceItemId) ?? product.roomItem.asset.source
    : undefined
  const automationSlug = product.avatarItem
    ? getAvatarAutomationSlug(product.sourceItemId)
    : product.sourceItemId.replaceAll("_", "-")
  const handlePress = useCallback(() => {
    onSelectProduct(product)
  }, [onSelectProduct, product])
  return (
    <PressableScale
      testID={`shop-item-${automationSlug}`}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${visibleMetaLabel}`}
      accessibilityState={{ selected }}
      onPress={handlePress}
      pressedScale={0.97}
      style={[
        styles.productCard,
        selectedCompact ? styles.productCardCompact : null,
        compactCardSizeStyle,
        selected ? styles.productCardSelected : null
      ]}
    >
      <View style={[styles.productThumb, { height: thumbHeight }]}>
        {product.previewType === "avatar" && product.avatarItem ? (
          <AvatarProductThumbnail
            item={product.avatarItem}
            source={avatarPreviewSource}
            selected={selected}
            isRigLayerSource={isRigLayerSource}
            width={cardWidth - cardPadding * 2 - 2}
            height={thumbHeight}
          />
        ) : product.roomItem ? (
          <ExpoImage
            source={roomPreviewSource}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            style={styles.productImage}
          />
        ) : null}
        <ShopCardViewingBadge visible={selected} />
      </View>
      <Text style={styles.productTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.88}>
        {product.title}
      </Text>
      <View
        testID={`shop-item-${automationSlug}-price`}
        style={[
          styles.productMetaPill,
          inventoryVerified && product.owned ? styles.productMetaPillOwned : null
        ]}
      >
        {inventoryVerified && product.owned ? (
          <Ionicons name="checkmark-circle" size={12} color={uiTheme.colors.successInk} />
        ) : inventoryVerified && product.priceCoins !== null ? (
          <Ionicons name="diamond" size={12} color="#D79111" />
        ) : null}
        <Text style={styles.productMeta} numberOfLines={1}>
          {visibleMetaLabel}
        </Text>
      </View>
      <ShopCardSelectionRing selected={selected} />
    </PressableScale>
  )
})

function AvatarProductThumbnail(props: {
  item: NonNullable<ShopCatalogItem["avatarItem"]>
  source: ImageSourcePropType | undefined
  selected: boolean
  isRigLayerSource: boolean
  width: number
  height: number
}) {
  const { item, source, selected, isRigLayerSource, width, height } = props
  const bounds = getShopProductThumbnailBounds(item.id)
  const visibleLayout = getShopThumbnailLayout(bounds, width, height)
  if (!source) {
    return (
      <View
        style={[
          styles.productIconOrb,
          selected ? styles.productIconOrbSelected : null
        ]}
      >
        <Ionicons
          name={getAvatarIcon(item.type)}
          size={24}
          color={selected ? "#FFFFFF" : uiTheme.colors.primary}
        />
      </View>
    )
  }

  const rigLayerPresentation = isRigLayerSource
    ? getMaleRigLayerThumbnailPresentation(item.type, "shop")
    : undefined

  return (
    <View style={StyleSheet.absoluteFill}>
      <ExpoImage
        source={source}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        style={[
          isRigLayerSource
            ? styles.productWearableRigLayer
            : styles.productWearableImage,
          visibleLayout ? { position: "absolute", ...visibleLayout } : rigLayerPresentation
            ? {
                top: rigLayerPresentation.top,
                transform: [{ scale: rigLayerPresentation.scale }]
              }
            : null
        ]}
      />
    </View>
  )
}
