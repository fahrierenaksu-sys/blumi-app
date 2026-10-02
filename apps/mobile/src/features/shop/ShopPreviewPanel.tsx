import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { useMemo, useState, useLayoutEffect } from "react"
import {
  useWindowDimensions,
  Pressable,
  Text,
  View
} from "react-native"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2Catalog"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoomCatalog"
import { RoomAvatarRenderer2D } from "../avatarV2/room/components/RoomAvatarRenderer2D"
import { AvatarTryOnTransition } from "../avatarV2/components/AvatarTryOnTransition"
import { FlightTargetView } from "../../ui/flight/FlightLayer"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import { RoomRenderer2D } from "../roomV2/components/RoomRenderer2D"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"
import type { FurnitureItem } from "../roomV2/roomV2.types"
import type { AppLocale } from "../session/appLocale"
import type { ShopCatalogItem } from "./shopCatalog"
import { SHOP_AVATAR_WIDTH_TO_HEIGHT_RATIO } from "./shopLayoutMetrics"
import { getShopCopy } from "./shopCopy"
import { getShopProductPresentation } from "./shopProductPresentation"
import { formatCoins } from "./shopFormatters"
import type { ShopLayoutMetrics } from "./shopLayoutMetrics"
import type { ShopCombinationItem, ShopCombinationSummary } from "./shopCombinationSummary"
import { getShopProductThumbnailBounds, getShopProductThumbnailSource } from "./shopAssets"
import type { ShopMode } from "./ShopNavigationControls"
import { getShopThumbnailLayout } from "./shopThumbnailLayout"
import { getCombinationPage, getCombinationPageSize, getCombinationSelectionPage } from "./shopCombinationViewport"
import { shopPreviewStyles as styles } from "./shopPreviewStyles"
import { uiTheme } from "../../ui/theme"
import { PressableScale } from "../../ui/PressableScale"

export function ShopPreviewPanel(props: {
  mode: ShopMode
  product: ShopCatalogItem | undefined
  previewAvatar: UserAvatar
  /** Purchase flights landing on the avatar (useShopPurchaseFlight). */
  purchaseLandingFlightIds?: readonly string[]
  roomPreviewScene: ReturnType<typeof resolveRoomV2Scene>
  layoutMetrics: ShopLayoutMetrics
  isPurchasing: boolean
  locale: AppLocale
  isActionAvailable: boolean
  primaryActionLabel?: string
  primaryActionDisabled?: boolean
  combinationSummary?: ShopCombinationSummary
  combinationItems?: readonly ShopCombinationItem[]
  supportsCombinationAction?: boolean
  onSelectCombinationItem?: (id: string) => void
  canRemovePreview?: boolean
  onRemovePreview?: () => void
  onPrimaryAction: () => void
}) {
  const {
    mode,
    isPurchasing,
    layoutMetrics,
    locale,
    isActionAvailable,
    product,
    primaryActionDisabled,
    primaryActionLabel,
    combinationSummary,
    combinationItems = [],
    supportsCombinationAction = false,
    onSelectCombinationItem,
    canRemovePreview = false,
    onRemovePreview,
    previewAvatar,
    purchaseLandingFlightIds,
    roomPreviewScene,
    onPrimaryAction
  } = props
  const copy = getShopCopy(locale)
  const { fontScale } = useWindowDimensions()
  const pageSize = getCombinationPageSize(layoutMetrics.preview.avatarStageHeight, fontScale, combinationItems.length)
  const [combinationPage, setCombinationPage] = useState(0)
  const selectionPage = getCombinationSelectionPage(combinationItems, product?.sourceItemId, pageSize)
  useLayoutEffect(() => { setCombinationPage(selectionPage) }, [selectionPage, product?.sourceItemId, pageSize])
  const page = getCombinationPage(combinationItems, pageSize, combinationPage)
  const navigateCombinationPage = (index: number) => {
    const target = getCombinationPage(combinationItems, pageSize, index)
    setCombinationPage(target.page)
    // Single-item checkout must never act on an item hidden on another page.
    if (!supportsCombinationAction && target.items[0]) onSelectCombinationItem?.(target.items[0].id)
  }
  if (!product) {
    if (mode === "home") {
      return (
        <View
          testID="shop-room-default-preview"
          accessibilityLabel={copy.roomPreview}
          style={[styles.previewCard, { padding: layoutMetrics.preview.cardPadding }]}
        >
          <View style={[styles.previewStage, styles.previewStageRoom, {
            height: layoutMetrics.preview.roomStageHeight,
            minHeight: layoutMetrics.preview.roomStageHeight
          }]}>
            <ShopRoomItemPreview item={undefined} scene={roomPreviewScene} locale={locale} />
          </View>
        </View>
      )
    }
    return (
      <View
        testID="shop-avatar-default-preview"
        accessibilityLabel={copy.previewOnAvatar}
        style={[styles.previewCard, { padding: layoutMetrics.preview.cardPadding }]}
      >
        <View style={[styles.previewStage, styles.previewStageAvatar, { height: layoutMetrics.preview.avatarStageHeight, minHeight: layoutMetrics.preview.avatarStageHeight }]}>
          <ShopAvatarLivePreview
            avatar={previewAvatar}
            avatarWidth={layoutMetrics.preview.avatarWidth}
            landingFlightIds={purchaseLandingFlightIds}
          />
          <View style={[styles.roomHeroTopOverlay, styles.avatarInfoOverlay, {
            left: undefined,
            right: layoutMetrics.preview.overlayInset,
            top: layoutMetrics.preview.overlayInset
          }]}>
            <View style={[styles.roomHeroTitleGlass, styles.avatarHeroTopPanel]}>
              <Text style={styles.roomHeroEyebrow}>{copy.avatarPreviewGuide}</Text>
              <Text style={styles.showcaseHeadline} numberOfLines={2}>
                {copy.showcaseTitle}
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  const presentation = getShopProductPresentation(product, locale)
  const disabled = (primaryActionDisabled ?? product.actionType === "disabled") ||
    isPurchasing ||
    !isActionAvailable
  const actionLabel = supportsCombinationAction && combinationSummary?.total === null
    ? copy.combination.priceNeedsRefresh : primaryActionLabel ?? presentation.actionLabel
  const isAvatarUnlock = product.actionType === "avatarUnlock" &&
    primaryActionLabel === undefined &&
    product.priceCoins !== null
  const showCombination = product.previewType === "avatar" && combinationItems.length > 1
  const actionPrice = supportsCombinationAction && combinationSummary?.purchaseCount
    ? combinationSummary.total
    : isAvatarUnlock ? product.priceCoins : null
  const avatarActionAccessibilityLabel = isAvatarUnlock
    ? `${copy.unlock}, ${formatCoins(product.priceCoins ?? 0, locale)} ${copy.coins}`
    : actionPrice !== null
      ? `${actionLabel}, ${formatCoins(actionPrice, locale)} ${copy.coins}`
      : actionLabel
  const previewGuide =
    product.previewType === "avatar"
      ? copy.avatarPreviewGuide
      : product.previewType === "room"
        ? copy.roomPreviewGuide
        : copy.genericPreviewGuide
  const avatarPreview = product.previewType === "avatar"
  const roomPreview = product.previewType === "room"
  const stageHeight = avatarPreview
    ? layoutMetrics.preview.avatarStageHeight
    : layoutMetrics.preview.roomStageHeight

  return (
    <View
      testID="shop-selected-product-preview"
      accessibilityLabel={`${product.title}, ${presentation.stateLabel}`}
      style={[
        styles.previewCard,
        {
          gap: layoutMetrics.preview.cardGap,
          padding: layoutMetrics.preview.cardPadding
        }
      ]}
    >
      <View
        style={[
          styles.previewHeroBody,
          {
            gap: layoutMetrics.preview.heroGap,
            minHeight: stageHeight
          }
        ]}
      >
        <View
          style={[
            styles.previewStage,
            avatarPreview
              ? styles.previewStageAvatar
              : styles.previewStageRoom,
            { height: stageHeight, minHeight: stageHeight }
          ]}
        >
          {avatarPreview ? (
            <ShopAvatarLivePreview
              avatar={previewAvatar}
              avatarWidth={layoutMetrics.preview.avatarWidth}
              landingFlightIds={purchaseLandingFlightIds}
            />
          ) : (
            <ShopRoomItemPreview item={product.roomItem} scene={roomPreviewScene} locale={locale} />
          )}
          <View
            style={[
              styles.roomHeroTopOverlay,
              avatarPreview ? styles.avatarInfoOverlay : null,
              showCombination ? styles.combinationOverlay : null,
              {
                left: avatarPreview ? undefined : layoutMetrics.preview.overlayInset,
                right: layoutMetrics.preview.overlayInset,
                top: showCombination ? 4 : layoutMetrics.preview.overlayInset,
                bottom: showCombination ? 4 : avatarPreview ? 10 : undefined
              }
            ]}
          >
            {showCombination ? (
              <>
                <View style={[styles.combinationPager, { height: page.pageCount === 1 ? Math.ceil(16 * Math.max(1, fontScale)) : Math.max(44, Math.ceil(16 * fontScale)) }]}>
                  {page.pageCount > 1 ? <PressableScale style={styles.combinationPageButton} disabled={page.page === 0} accessibilityRole="button" accessibilityLabel={copy.combination.previousPieces} accessibilityState={{ disabled: page.page === 0 }} onPress={() => navigateCombinationPage(page.page - 1)}><Ionicons name="chevron-back" size={17} color={page.page === 0 ? uiTheme.colors.textSecondary : uiTheme.colors.primary} /></PressableScale> : null}
                  <Text style={[styles.combinationHeading, styles.combinationPageLabel]} accessibilityLiveRegion="polite">
                    {page.pageCount > 1 ? `${page.start + 1}–${page.end} / ${combinationItems.length}` : copy.combination.lookTitle(combinationItems.length)}
                  </Text>
                  {page.pageCount > 1 ? <PressableScale style={styles.combinationPageButton} disabled={page.page + 1 === page.pageCount} accessibilityRole="button" accessibilityLabel={copy.combination.nextPieces} accessibilityState={{ disabled: page.page + 1 === page.pageCount }} onPress={() => navigateCombinationPage(page.page + 1)}><Ionicons name="chevron-forward" size={17} color={page.page + 1 === page.pageCount ? uiTheme.colors.textSecondary : uiTheme.colors.primary} /></PressableScale> : null}
                </View>
                <View style={styles.combinationRows}>
                  {page.items.map((item) => <CombinationRow key={item.id} item={item} locale={locale} selected={item.id === product.sourceItemId} onSelect={onSelectCombinationItem} />)}
                </View>
              </>
            ) : <View style={[
              styles.roomHeroTitleGlass,
              avatarPreview ? styles.avatarHeroTopPanel : null
            ]}>
              <View style={avatarPreview ? styles.avatarProductHeading : undefined}>
                <Text style={[styles.roomHeroEyebrow, avatarPreview ? styles.avatarProductEyebrow : null]} numberOfLines={2}>
                  {presentation.eyebrow}
                </Text>
                {avatarPreview && canRemovePreview && onRemovePreview ? (
                  <Pressable
                    testID="shop-preview-remove-preview"
                    accessibilityRole="button"
                    accessibilityLabel={copy.removePreview}
                    onPress={onRemovePreview}
                    style={({ pressed }) => [styles.avatarPreviewRemoveButton, pressed ? styles.avatarPreviewRemoveButtonPressed : null]}
                  >
                    <Ionicons name="close" size={17} color={uiTheme.colors.primary} />
                  </Pressable>
                ) : null}
              </View>
              <Text
                style={[
                  styles.roomHeroTitle,
                  avatarPreview ? styles.avatarProductTitle : null
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {product.title}
              </Text>
            </View>}
            {avatarPreview && !showCombination && combinationSummary?.total === null ? (
              <Text style={styles.combinationSummary} accessibilityLiveRegion="polite">
                {combinationSummary.total === null
                  ? copy.combination.priceNeedsRefresh
                  : copy.combination.selectionSummary(combinationSummary.selectedCount, combinationSummary.purchaseCount)}
              </Text>
            ) : null}
            {avatarPreview ? (
              <Pressable
                testID="shop-preview-primary-action"
                accessibilityRole="button"
                accessibilityLabel={disabled && !isActionAvailable ? copy.offline.actionUnavailable : avatarActionAccessibilityLabel}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={onPrimaryAction}
                style={({ pressed }) => [
                  styles.avatarHeroAction,
                  showCombination ? styles.combinationAction : null,
                  disabled ? styles.primaryActionDisabled : null,
                  pressed && !disabled ? styles.primaryActionPressed : null
                ]}
              >
                <View style={styles.avatarHeroActionContent}>
                  <Text style={styles.avatarHeroActionText} numberOfLines={1} adjustsFontSizeToFit>
                    {isPurchasing ? copy.saving : isAvatarUnlock ? copy.unlock : actionLabel}
                  </Text>
                  {!isPurchasing && actionPrice !== null ? (
                    <View style={styles.avatarHeroPricePill}>
                      <Ionicons name="diamond" size={12} color={uiTheme.colors.primary} />
                      <Text style={styles.avatarHeroPriceText}>{formatCoins(actionPrice, locale)}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : <View style={[
              styles.roomHeroStatusPill,
              avatarPreview ? styles.avatarHeroTopPanel : null
            ]}>
              <Ionicons
                name={product.owned ? "checkmark-circle" : "sparkles"}
                size={14}
                color={product.owned ? uiTheme.colors.success : uiTheme.colors.primary}
              />
              <Text style={styles.roomHeroStatusText} numberOfLines={1}>
                {product.owned
                  ? presentation.stateLabel
                  : product.priceCoins !== null
                    ? `${formatCoins(product.priceCoins, locale)} ${copy.coins}`
                    : previewGuide}
              </Text>
            </View>}
          </View>
          {roomPreview ? (
            <Pressable
              testID="shop-preview-primary-action"
              accessibilityRole="button"
              accessibilityLabel={disabled && !isActionAvailable ? copy.offline.actionUnavailable : actionLabel}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onPrimaryAction}
              style={({ pressed }) => [
                styles.roomHeroAction,
                {
                  right: layoutMetrics.preview.overlayInset,
                  bottom: layoutMetrics.preview.overlayInset
                },
                disabled ? styles.primaryActionDisabled : null,
                pressed && !disabled ? styles.primaryActionPressed : null
              ]}
            >
              <Text style={styles.roomHeroActionText} numberOfLines={1} adjustsFontSizeToFit>
                {isPurchasing ? copy.saving : actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>

      </View>
    </View>
  )
}

function CombinationRow({ item, locale, selected, onSelect }: { item: ShopCombinationItem; locale: AppLocale; selected: boolean; onSelect?: (id: string) => void }) {
  const copy = getShopCopy(locale)
  const source = getShopProductThumbnailSource(item.id)
  const bounds = getShopProductThumbnailBounds(item.id)
  const frame = getShopThumbnailLayout(bounds, 34, 34)
  return (
      <PressableScale
        style={[styles.combinationRow, selected ? styles.combinationRowSelected : null]}
        onPress={() => onSelect?.(item.id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.title ?? copy.combination.itemUnavailable}, ${item.owned ? copy.owned : item.price === null ? copy.combination.priceNeedsRefresh : `${formatCoins(item.price, locale)} ${copy.coins}`}`}
      >
        <View style={styles.combinationThumbnail}>
          {source ? <ExpoImage source={source} contentFit="contain" cachePolicy="memory-disk" priority={selected ? "high" : "normal"} transition={0} style={frame ? { position: "absolute", ...frame } : { width: 34, height: 34 }} /> : <Ionicons name="shirt-outline" size={18} color={uiTheme.colors.primary} />}
        </View>
        <View style={styles.combinationRowCopy}>
          <Text style={styles.combinationItemTitle} numberOfLines={1}>{item.title ?? copy.combination.itemUnavailable}</Text>
          <Text style={styles.combinationItemPrice} numberOfLines={1}>{item.owned ? `✓ ${copy.owned}` : item.price === null ? "—" : `◇ ${formatCoins(item.price, locale)}`}</Text>
        </View>
      </PressableScale>
  )
}

function ShopAvatarLivePreview(props: {
  avatar: UserAvatar
  avatarWidth: number
  landingFlightIds?: readonly string[]
}) {
  const roomAvatarLayers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar: props.avatar,
      avatarCatalog: AVATAR_V2_CATALOG,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    })
    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG,
      direction: "front",
      state: "idle"
    })
  }, [props.avatar])
  const avatarHeight = props.avatarWidth / SHOP_AVATAR_WIDTH_TO_HEIGHT_RATIO

  return (
    <View style={styles.shopAvatarPreview}>
      <View style={[styles.shopAvatarFrame, { width: props.avatarWidth, height: avatarHeight }]}>
        {/* A try-on crossfades the old look out and the body hops. */}
        <AvatarTryOnTransition
          value={roomAvatarLayers}
          style={tryOnFill}
          render={renderShopAvatarLayers}
        />
        {props.landingFlightIds?.map((flightId) => (
          <FlightTargetView key={flightId} flightId={flightId} style={purchaseLandingSpot} />
        ))}
      </View>
    </View>
  )
}

const tryOnFill = { width: "100%", height: "100%" } as const
/** Where a bought piece lands: the chest of the shop avatar. */
const purchaseLandingSpot = {
  position: "absolute",
  left: "30%",
  width: "40%",
  top: "34%",
  height: "26%"
} as const

function renderShopAvatarLayers(layers: ReturnType<typeof getRoomAvatarRenderLayers>) {
  return <RoomAvatarRenderer2D layers={layers} />
}

function ShopRoomItemPreview(props: {
  item: FurnitureItem | undefined
  scene: ReturnType<typeof resolveRoomV2Scene>
  locale: AppLocale
}) {
  return (
    <View
      style={styles.shopRoomScenePreview}
      testID="shop-room-preview"
      accessibilityLabel={props.item ? `${props.item.name}, ${getShopCopy(props.locale).roomPreview}` : getShopCopy(props.locale).roomPreview}
    >
      <RoomRenderer2D
        shell={props.scene.shell}
        renderItems={props.scene.renderItems}
        style={styles.shopRoomSceneRenderer}
      />
    </View>
  )
}
