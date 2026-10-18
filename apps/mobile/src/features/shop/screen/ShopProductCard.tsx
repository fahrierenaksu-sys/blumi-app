import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo, useCallback, useState } from "react"
import {
  type AccessibilityActionEvent,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View
} from "react-native"
import { getAvatarAutomationSlug } from "../../avatarV2/qa/avatarQaInventory"
import type { AppLocale } from "../../session/appLocale"
import { PressableScale } from "../../../ui/PressableScale"
import { useScrollSafePress } from "../../../ui/MainTabPagerGestureOwnership"
import { uiTheme } from "../../../ui/theme"
import { getAvatarItemPreviewSource, getShopProductThumbnailSource } from "../shopAssets"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import { formatCoins } from "../shopFormatters"
import { getShopProductPresentation } from "../shopProductPresentation"
import { SHOP_ROOM_THUMBNAIL_BOUNDS } from "../shopRoomThumbnailBounds"
import { getShopThumbnailLayout } from "../shopThumbnailLayout"
import type { ShopCardRemoveAction } from "../shopCardRemoveModel"
import { ShopCardRemoveButton } from "./ShopCardRemoveButton"
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
  /** Shows the corner X (see shopCardRemoveModel); omitted or "none" hides it. */
  removeAction?: ShopCardRemoveAction
  onRemoveProduct?: (product: ShopCatalogItem) => void
  /** Registers the thumbnail as a purchase flight's starting point. */
  registerThumbnail?: (sourceItemId: string, view: View | null) => void
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
    onSelectProduct,
    removeAction,
    onRemoveProduct,
    registerThumbnail
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
        : selectedCompact && product.owned
          ? copy.ownedCompact
          : presentation.stateLabel)
  const avatarPreviewSource = product.avatarItem
    ? getShopProductThumbnailSource(product.sourceItemId)
      ?? getAvatarItemPreviewSource(product.avatarItem)
    : undefined
  const automationSlug = product.avatarItem
    ? getAvatarAutomationSlug(product.sourceItemId)
    : product.sourceItemId.replaceAll("_", "-")
  const handlePress = useCallback(() => {
    onSelectProduct(product)
  }, [onSelectProduct, product])
  const handleSafePress = useScrollSafePress(handlePress)
  const sourceItemId = product.sourceItemId
  const thumbnailRef = useCallback((view: View | null) => {
    registerThumbnail?.(sourceItemId, view)
  }, [registerThumbnail, sourceItemId])
  const canRemove = removeAction !== undefined && removeAction !== "none" && onRemoveProduct !== undefined
  const removeLabel = canRemove ? copy.removeFromAvatar(product.title) : undefined
  const handleRemove = useCallback(() => {
    onRemoveProduct?.(product)
  }, [onRemoveProduct, product])
  const handleSafeRemove = useScrollSafePress(handleRemove)
  // VoiceOver reads the card as one element, so the X is also a card action.
  const handleAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "remove") onRemoveProduct?.(product)
  }, [onRemoveProduct, product])
  return (
    <PressableScale
      testID={`shop-item-${automationSlug}`}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${visibleMetaLabel}`}
      accessibilityState={{ selected }}
      accessibilityActions={removeLabel ? [{ name: "remove", label: removeLabel }] : undefined}
      onAccessibilityAction={removeLabel ? handleAccessibilityAction : undefined}
      onPress={handleSafePress}
      pressedScale={0.97}
      style={[
        styles.productCard,
        selectedCompact ? styles.productCardCompact : null,
        compactCardSizeStyle
      ]}
    >
      <View ref={thumbnailRef} collapsable={false} style={[styles.productThumb, { height: thumbHeight }]}>
        {product.previewType === "avatar" && product.avatarItem ? (
          <AvatarProductThumbnail
            item={product.avatarItem}
            source={avatarPreviewSource}
            selected={selected}
          />
        ) : product.roomItem ? (
          <RoomProductThumbnail asset={product.roomItem.asset} />
        ) : null}
        <ShopCardViewingBadge visible={selected} />
      </View>
      <View style={styles.productTitleSlot}>
        <Text style={styles.productTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.88}>
          {product.title}
        </Text>
      </View>
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
      {removeLabel ? (
        <ShopCardRemoveButton
          testID={`shop-item-${automationSlug}-remove`}
          accessibilityLabel={removeLabel}
          onPress={handleSafeRemove}
        />
      ) : null}
    </PressableScale>
  )
})

/**
 * A room piece's picture, framed on its drawing rather than its canvas: every room canvas leaves a
 * different empty margin (room for its other rotations), so `contain` alone shrinks and shifts pieces unevenly.
 */
function RoomProductThumbnail({ asset }: { asset: NonNullable<ShopCatalogItem["roomItem"]>["asset"] }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) => current?.width === width && current.height === height ? current : { width, height })
  }, [])
  const frame = size ? getShopThumbnailLayout(SHOP_ROOM_THUMBNAIL_BOUNDS[asset.key], size.width, size.height) : undefined
  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      {frame ? (
        <ExpoImage
          source={asset.source}
          contentFit="fill"
          cachePolicy="memory-disk"
          transition={0}
          style={[styles.productRoomImage, frame]}
        />
      ) : size ? (
        <ExpoImage
          source={asset.source}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          style={styles.productImage}
        />
      ) : null}
    </View>
  )
}

function AvatarProductThumbnail(props: {
  item: NonNullable<ShopCatalogItem["avatarItem"]>
  source: ImageSourcePropType | undefined
  selected: boolean
}) {
  const { item, source, selected } = props
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <ExpoImage
        source={source}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        style={styles.productWearableImage}
      />
    </View>
  )
}
