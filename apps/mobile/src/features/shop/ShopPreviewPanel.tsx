import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useMemo, useState, useLayoutEffect } from "react"
import {
  useWindowDimensions,
  StyleSheet,
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
import type { ShopMode } from "./ShopNavigationControls"
import { getCombinationPage, getCombinationPageSize, getCombinationSelectionPage } from "./shopCombinationViewport"
import { shopPreviewStyles as styles } from "./shopPreviewStyles"
import { uiTheme } from "../../ui/theme"
import { PressableScale } from "../../ui/PressableScale"
import { ShopCombinationRow } from "./ShopCombinationRow"
import { useRetainedShopPreviewDrawing } from "./screen/shopRetainedPreviewModel"

export function ShopPreviewPanel(props: {
  mode: ShopMode
  product: ShopCatalogItem | undefined
  previewAvatar: UserAvatar
  /** Purchase flights landing on the avatar (useShopPurchaseFlight). */
  purchaseLandingFlightIds?: readonly string[]
  roomPreviewScene: ReturnType<typeof resolveRoomV2Scene> | null
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
  /** Outfit rows whose piece can leave the outfit (X or swipe), by source item id. */
  removableCombinationIds?: ReadonlySet<string>
  onRemoveCombinationItem?: (id: string) => boolean
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
    removableCombinationIds,
    onRemoveCombinationItem,
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
  const avatarPreview = product ? product.previewType === "avatar" : mode === "avatar"
  const roomPreview = !avatarPreview
  const avatarDrawingInput = useMemo(() => ({
    avatar: previewAvatar,
    avatarWidth: layoutMetrics.preview.avatarWidth
  }), [previewAvatar, layoutMetrics.preview.avatarWidth])
  const roomDrawingInput = useMemo(() => roomPreviewScene ? ({
    scene: roomPreviewScene,
    item: product?.roomItem
  }) : null, [roomPreviewScene, product?.roomItem])
  const avatarDrawing = useRetainedShopPreviewDrawing(avatarPreview, avatarDrawingInput)
  const roomDrawing = useRetainedShopPreviewDrawing(roomPreview, roomDrawingInput)

  const presentation = product ? getShopProductPresentation(product, locale) : undefined
  const disabled = (primaryActionDisabled ?? product?.actionType === "disabled") ||
    isPurchasing ||
    !isActionAvailable
  const actionLabel = supportsCombinationAction && combinationSummary?.total === null
    ? copy.combination.priceNeedsRefresh : primaryActionLabel ?? presentation?.actionLabel
  const isAvatarUnlock = product?.actionType === "avatarUnlock" &&
    primaryActionLabel === undefined &&
    product.priceCoins !== null
  const showCombination = product?.previewType === "avatar" && combinationItems.length > 1
  const actionPrice = supportsCombinationAction && combinationSummary?.purchaseCount
    ? combinationSummary.total
    : isAvatarUnlock ? product?.priceCoins ?? null : null
  const avatarActionAccessibilityLabel = isAvatarUnlock
    ? `${copy.unlock}, ${formatCoins(product?.priceCoins ?? 0, locale)} ${copy.coins}`
    : actionPrice !== null
      ? `${actionLabel}, ${formatCoins(actionPrice, locale)} ${copy.coins}`
      : actionLabel
  const previewGuide =
    product?.previewType === "avatar"
      ? copy.avatarPreviewGuide
      : product?.previewType === "room"
        ? copy.roomPreviewGuide
        : copy.genericPreviewGuide
  const stageHeight = avatarPreview
    ? layoutMetrics.preview.avatarStageHeight
    : layoutMetrics.preview.roomStageHeight

  return (
    <View
      testID={product ? "shop-selected-product-preview" : avatarPreview ? "shop-avatar-default-preview" : "shop-room-default-preview"}
      accessibilityLabel={product && presentation ? `${product.title}, ${presentation.stateLabel}` : avatarPreview ? copy.previewOnAvatar : copy.roomPreview}
      style={[
        styles.previewCard,
        product
          ? { gap: layoutMetrics.preview.cardGap, padding: layoutMetrics.preview.cardPadding }
          : { padding: layoutMetrics.preview.cardPadding }
      ]}
    >
      <View
        style={product ? [
          styles.previewHeroBody,
          {
            gap: layoutMetrics.preview.heroGap,
            minHeight: stageHeight
          }
        ] : undefined}
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
          {avatarDrawing ? (
            <View
              key="avatar-drawing"
              pointerEvents={avatarPreview ? "auto" : "none"}
              accessibilityElementsHidden={!avatarPreview}
              importantForAccessibility={avatarPreview ? "auto" : "no-hide-descendants"}
              style={[drawingSlotStyle, { opacity: avatarPreview ? 1 : 0 }]}
            >
              <ShopAvatarLivePreview
                {...avatarDrawing}
                active={avatarPreview}
                landingFlightIds={avatarPreview ? purchaseLandingFlightIds : undefined}
              />
            </View>
          ) : null}
          {roomDrawing ? (
            <View
              key="room-drawing"
              pointerEvents={roomPreview ? "auto" : "none"}
              accessibilityElementsHidden={!roomPreview}
              importantForAccessibility={roomPreview ? "auto" : "no-hide-descendants"}
              style={[drawingSlotStyle, { opacity: roomPreview ? 1 : 0 }]}
            >
              <ShopRoomItemPreview {...roomDrawing} active={roomPreview} locale={locale} />
            </View>
          ) : null}
          {product && presentation ? <View
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
                  {page.items.map((item) => <ShopCombinationRow key={item.id} item={item} locale={locale} selected={item.id === product.sourceItemId} onSelect={onSelectCombinationItem} removable={removableCombinationIds?.has(item.id) ?? false} onRemove={onRemoveCombinationItem} />)}
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
          </View> : avatarPreview ? (
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
          ) : null}
          {roomPreview && product ? (
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

const ShopAvatarLivePreview = memo(function ShopAvatarLivePreview(props: {
  active: boolean
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
  // Current Shop idle/front sources are still images. If animated idle art is
  // introduced, release its hidden renderer rather than running a hidden clock.
  if (!props.active && roomAvatarLayers.some((layer) => (layer.animation?.frames.length ?? 0) > 1)) return null

  return <ShopAvatarDrawing layers={roomAvatarLayers} avatarWidth={props.avatarWidth} landingFlightIds={props.landingFlightIds} />
})

const ShopAvatarDrawing = memo(function ShopAvatarDrawing(props: {
  layers: ReturnType<typeof getRoomAvatarRenderLayers>
  avatarWidth: number
  landingFlightIds?: readonly string[]
}) {
  const avatarHeight = props.avatarWidth / SHOP_AVATAR_WIDTH_TO_HEIGHT_RATIO
  return (
    <View style={styles.shopAvatarPreview}>
      <View style={[styles.shopAvatarFrame, { width: props.avatarWidth, height: avatarHeight }]}>
        {/* A try-on crossfades the old look out and the body hops. */}
        <AvatarTryOnTransition
          value={props.layers}
          style={tryOnFill}
          render={renderShopAvatarLayers}
        />
        {props.landingFlightIds?.map((flightId) => (
          <FlightTargetView key={flightId} flightId={flightId} style={purchaseLandingSpot} />
        ))}
      </View>
    </View>
  )
})

// Match the stage's child alignment; the extra slot owns no drawing geometry.
const drawingSlotStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center"
} as const

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

const ShopRoomItemPreview = memo(function ShopRoomItemPreview(props: {
  active: boolean
  item: FurnitureItem | undefined
  scene: ReturnType<typeof resolveRoomV2Scene> | null
  locale: AppLocale
}) {
  const scene = props.scene
  if (!scene) return null
  // Canonical Shop scenes contain furniture only. Do not retain a future
  // avatar-bearing room renderer while its mode is hidden.
  if (!props.active && scene.renderItems.some((item) => item.kind === "avatar")) return null
  return (
    <View
      style={styles.shopRoomScenePreview}
      testID="shop-room-preview"
      accessibilityLabel={props.item ? `${props.item.name}, ${getShopCopy(props.locale).roomPreview}` : getShopCopy(props.locale).roomPreview}
    >
      <ShopRoomRenderer2D
        shell={scene.shell}
        renderItems={scene.renderItems}
        style={styles.shopRoomSceneRenderer}
      />
    </View>
  )
})

// Hiding a retained slot changes its outer visibility, not its canonical scene.
const ShopRoomRenderer2D = memo(RoomRenderer2D)
