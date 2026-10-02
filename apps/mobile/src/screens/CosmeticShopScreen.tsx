import Ionicons from "@expo/vector-icons/Ionicons"
import { publishSelectedShopPreviewWarmup } from "../features/performance/sceneAssetWarmupModel"
import { useNavigationState } from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native"
import Reanimated from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useReducedMotion } from "../ui/animations"
import { IS_BLUMI_PAID_COINS_ENABLED } from "../config/env"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { CoinPackWalletPanel } from "../features/commerce/CoinPackWalletPanel"
import { getCoinPackCopy } from "../features/commerce/coinPackCopy"
import { useCoinPackWallet } from "../features/commerce/useCoinPackWallet"
import {
  useInventoryStore
} from "../features/inventory/inventoryStore"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import type { SessionActor } from "../features/session/sessionModel"
import type { FurnitureItem } from "../features/roomV2/roomV2.types"
import { ShopPreviewPanel } from "../features/shop/ShopPreviewPanel"
import { getShopLayoutMetrics } from "../features/shop/shopLayoutMetrics"
import { formatCoins } from "../features/shop/shopFormatters"
import { getShopCopy } from "../features/shop/shopCopy"
import { resolveShopCatalogRuntime } from "../features/shop/shopCatalogRuntime"
import {
  getShopPresentationState,
  type ShopPresentationState
} from "../features/shop/shopPresentationModel"
import {
  ShopModeDock,
  ShopOfflineNotice,
  ShopStatusCard,
  type ShopMode
} from "../features/shop/ShopNavigationControls"
import { getAppLocale } from "../features/session/authLocale"
import {
  canMerchandiseSemanticOutfits,
  isShopMultiItemApplyEnabled
} from "../features/shop/shopCapabilityPolicy"
import { ClosetBrowser } from "../features/shop/screen/ClosetBrowser"
import { ShopCheckoutSheet } from "../features/shop/screen/ShopCheckoutSheet"
import { ShopCoinBalance } from "../features/shop/screen/ShopCoinBalance"
import { ShopShelfSkeleton, useShopContentEntrance } from "../features/shop/screen/ShopShelfSkeleton"
import {
  getDefaultShopCategoryId,
  getShopSurfacePolicy,
  shouldShowShopBackButton
} from "../features/shop/screen/shopScreenModel"
import { shopScreenStyles as styles } from "../features/shop/screen/shopScreenStyles"
import { useShopCardRemoval } from "../features/shop/screen/useShopCardRemoval"
import { useShopCatalogProducts } from "../features/shop/screen/useShopCatalogProducts"
import { useShopCombinationSession } from "../features/shop/screen/useShopCombinationSession"
import { useShopPreviewModel } from "../features/shop/screen/useShopPreviewModel"
import { useShopPreviewSelection } from "../features/shop/screen/useShopPreviewSelection"
import { useShopProductFocus } from "../features/shop/screen/useShopProductFocus"
import { useShopPurchaseActions } from "../features/shop/screen/useShopPurchaseActions"
import { useShopScrollToTop } from "../features/shop/screen/useShopScrollToTop"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { hapticSelection } from "../ui/haptics"
import { useNetworkStatus } from "../features/network/networkStore"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { useAppViewportMetrics } from "../ui/layout/useAppViewportMetrics"

type CosmeticShopScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "CosmeticShop"
> & {
  sessionActor: SessionActor
  roomFurnitureCatalog?: FurnitureItem[]
  qaOnlyOwnedRoomItemIds?: readonly string[]
  /** A local, development-only room catalog must never wait on live inventory. */
  isRoomCatalogQaPreview?: boolean
  /** Explicit local QA mode may inspect the full catalog without publishing it. */
  isFullShopCatalogQaPreview?: boolean
  initialShopMode?: ShopMode
}

/**
 * Composes the Shop surface. Catalog derivation, the combination session,
 * preview state, selection handlers and the purchase path live in
 * features/shop/screen; this screen owns runtime wiring, mode/category
 * selection, inventory hydration and the rendered tree.
 */
export function CosmeticShopScreen(props: CosmeticShopScreenProps) {
  const { navigation, sessionActor } = props
  const locale = getAppLocale()
  const copy = getShopCopy(locale)
  const coinPackCopy = getCoinPackCopy(locale)
  const viewportMetrics = useAppViewportMetrics({ bottomNavVisible: true })
  const reduceMotion = useReducedMotion()
  const { isConnected } = useNetworkStatus()
  const avatarV2 = useAvatarV2()
  const shopCatalogRuntime = resolveShopCatalogRuntime({
    sessionMode: sessionActor.session.mode,
    isRoomCatalogQaPreview: props.isRoomCatalogQaPreview === true,
    isFullShopCatalogQaPreview: props.isFullShopCatalogQaPreview === true
  })
  const { requiresServerInventory } = shopCatalogRuntime
  const inventoryStore = useInventoryStore(
    sessionActor.profile.userId,
    requiresServerInventory
  )
  const coinPackWallet = useCoinPackWallet({
    isConnected,
    isProductionSession: IS_BLUMI_PAID_COINS_ENABLED && sessionActor.session.mode === "production",
    sessionToken: sessionActor.session.sessionToken,
    userId: sessionActor.session.userId,
    inventoryStore
  })
  const roomV2 = useRoomV2()
  const multiItemApplyEnabled = isShopMultiItemApplyEnabled(
    sessionActor.session.mode,
    avatarV2.resolvedCapabilities
  )
  const semanticOutfitMerchandisingEnabled = canMerchandiseSemanticOutfits(
    sessionActor.session.mode,
    avatarV2.resolvedCapabilities,
    { fullCatalogQaPreview: props.isFullShopCatalogQaPreview === true }
  )
  const initialShopMode = props.route.params?.initialShopMode ?? props.initialShopMode ?? "avatar"
  const [selectedId, setSelectedId] = useState("")
  const [previewSelectionOrder, setPreviewSelectionOrder] = useState<string[]>([])
  const [shopMode, setShopMode] = useState<ShopMode>(initialShopMode)
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    getDefaultShopCategoryId(initialShopMode)
  )
  const [isCoinWalletOpen, setIsCoinWalletOpen] = useState(false)
  const hydratedSessionTokenRef = useRef<string | null>(null)
  const shopScrollRef = useShopScrollToTop()
  const routeKey = props.route.key
  const routeNameBelow = useNavigationState((state) => {
    const index = state?.routes.findIndex((route) => route.key === routeKey) ?? -1
    return index > 0 ? state?.routes[index - 1]?.name : undefined
  })
  const showBackButton = shouldShowShopBackButton(routeNameBelow)
  const shopLayoutMetrics = useMemo(
    () => getShopLayoutMetrics({
      width: viewportMetrics.safeWidth,
      height: viewportMetrics.contentHeight,
      fontScale: viewportMetrics.fontScale,
      horizontalInset: viewportMetrics.horizontalGutter,
      minimumTouchTarget: viewportMetrics.minTouchTarget
    }),
    [
      viewportMetrics.contentHeight,
      viewportMetrics.fontScale,
      viewportMetrics.horizontalGutter,
      viewportMetrics.minTouchTarget,
      viewportMetrics.safeWidth
    ]
  )

  useEffect(() => {
    const requestedShopMode = props.route.params?.initialShopMode
    if (!requestedShopMode) return
    publishSelectedShopPreviewWarmup([])
    setShopMode(requestedShopMode)
    setSelectedCategoryId(getDefaultShopCategoryId(requestedShopMode))
    setSelectedId("")
  }, [props.route.params?.initialShopMode])

  useEffect(() => {
    if (!requiresServerInventory) return
    if (sessionActor.session.mode !== "production") return
    const { sessionToken } = sessionActor.session
    if (hydratedSessionTokenRef.current === sessionToken) return
    hydratedSessionTokenRef.current = sessionToken
    void inventoryStore.hydrateFromServer(sessionToken)
  }, [inventoryStore, requiresServerInventory, sessionActor.session])

  // Registers the beforeRemove and blur listeners after the two effects
  // above, preserving the original effect order.
  const {
    combinationState,
    setCombinationState,
    combinationStateRef,
    dispatchCombination,
    shopExitLocked,
    handleCloseShop
  } = useShopCombinationSession({
    navigation,
    avatar: avatarV2.avatar,
    ownedAvatarItemIds: inventoryStore.inventory.ownedAvatarItemIds,
    avatarRevision: sessionActor.profile.avatar.revision ?? 0
  })

  const {
    avatarProducts,
    roomProducts,
    activeProducts,
    categoryOptions,
    activeCategoryId,
    filteredProducts
  } = useShopCatalogProducts({
    enforcePublishedCatalog: shopCatalogRuntime.enforcePublishedCatalog,
    inventory: inventoryStore.inventory,
    avatar: avatarV2.avatar,
    roomDecor: roomV2.userRoomDecor,
    roomFurnitureCatalog: props.roomFurnitureCatalog,
    qaOnlyOwnedRoomItemIds: props.qaOnlyOwnedRoomItemIds,
    semanticOutfitMerchandisingEnabled,
    shopMode,
    selectedCategoryId,
    locale
  })
  const shopPresentationState = getShopPresentationState({
    isProduction: requiresServerInventory,
    isConnected,
    isReady: inventoryStore.isReady,
    hydrationStatus: inventoryStore.hydrationStatus,
    productCount: activeProducts.length
  })
  const shopSurfacePolicy = getShopSurfacePolicy({
    requiresServerInventory,
    isConnected,
    isReady: inventoryStore.isReady,
    hydrationStatus: inventoryStore.hydrationStatus,
    state: shopPresentationState,
    productCount: activeProducts.length
  })
  const {
    showShopContent,
    inventoryVerified,
    canPerformShopActions
  } = shopSurfacePolicy
  const shopStatusState: Exclude<ShopPresentationState, "ready"> =
    shopPresentationState === "ready" ? "loading" : shopPresentationState
  // SHOP-5: the first load draws the shelf's shape, then crossfades into it.
  const showSkeleton = !showShopContent && shopStatusState === "loading"
  const contentEntering = useShopContentEntrance({ showSkeleton, reduceMotion })
  const isActionAvailable = !requiresServerInventory || isConnected
  const inventoryGateLabel = shopPresentationState === "error"
    ? copy.error.title
    : shopPresentationState === "offline"
      ? copy.offline.title
      : copy.loading.title

  const {
    selectedProduct,
    presentationProduct,
    previewTransition,
    previewAvatar,
    hasCombinationChanges,
    combinationSummary,
    canRemoveAvatarPreview,
    combinationItems,
    roomPreviewScene
  } = useShopPreviewModel({
    shopMode,
    selectedId,
    filteredProducts,
    activeProducts,
    avatarProducts,
    inventoryVerified,
    inventoryGateLabel,
    combinationState,
    previewSelectionOrder,
    avatar: avatarV2.avatar,
    ownedAvatarItemIds: inventoryStore.inventory.ownedAvatarItemIds,
    roomDecor: roomV2.userRoomDecor,
    roomFurnitureCatalog: props.roomFurnitureCatalog
  })

  const { handleRemoveAvatarPreview, handleSelectProduct } = useShopPreviewSelection({
    selectedProduct,
    avatar: avatarV2.avatar,
    catalog: avatarV2.catalog,
    shopMode,
    combinationStateRef,
    dispatchCombination,
    setShopMode,
    setSelectedCategoryId,
    setPreviewSelectionOrder,
    setSelectedId
  })

  const shelfRevealRequest = useShopProductFocus({
    focusProductId: props.route.params?.focusProductId,
    focusRequestId: props.route.params?.focusRequestId,
    avatarProducts,
    setShopMode,
    setSelectedCategoryId,
    selectProduct: handleSelectProduct
  })

  const handleSelectMode = useCallback((nextMode: ShopMode): void => {
    hapticSelection()
    publishSelectedShopPreviewWarmup([])
    setShopMode(nextMode)
    setSelectedCategoryId(getDefaultShopCategoryId(nextMode))
    setSelectedId("")
  }, [])

  const handleSelectCategory = useCallback((categoryId: string): void => {
    hapticSelection()
    setSelectedCategoryId(categoryId)
  }, [])

  const handleRetryShop = useCallback((): void => {
    if (!requiresServerInventory) return
    if (sessionActor.session.mode !== "production") return
    void inventoryStore.hydrateFromServer(sessionActor.session.sessionToken)
  }, [inventoryStore, requiresServerInventory, sessionActor.session])

  const {
    isPurchasing,
    handlePrimaryAction,
    checkout,
    confirmCheckout,
    closeCheckout,
    retryCheckout
  } = useShopPurchaseActions({
    navigation,
    sessionActor,
    inventoryStore,
    avatarV2,
    avatarProducts,
    copy,
    combinationStateRef,
    setCombinationState,
    dispatchCombination,
    inventoryVerified,
    isActionAvailable,
    canPerformShopActions,
    shopMode,
    multiItemApplyEnabled,
    selectedProduct
  })

  const { removeActionById, onRemoveProduct, isRemoving } = useShopCardRemoval({
    products: filteredProducts,
    previewAvatar,
    avatar: avatarV2.avatar,
    catalog: avatarV2.catalog,
    inventoryVerified,
    canSave: canPerformShopActions && !isPurchasing && combinationState.phase === "editing",
    combinationStateRef,
    setCombinationState,
    dispatchCombination,
    ownedAvatarItemIds: inventoryStore.inventory.ownedAvatarItemIds,
    equipAndSaveItem: avatarV2.equipAndSaveItem,
    copy
  })

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="homeLiquid" />
      <SafeAreaView
        contentGutter
        style={styles.safe}
        edges={["top", "left", "right"]}
      >
        <ScrollView
          ref={shopScrollRef}
          scrollEnabled={shopLayoutMetrics.catalog.accessibilityLayout || (IS_BLUMI_PAID_COINS_ENABLED && isCoinWalletOpen) || shopPresentationState === "offline"}
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.shopContent,
            {
              gap: shopLayoutMetrics.sectionGap,
              paddingBottom: 4
            }
          ]}
          style={[styles.shopScroller, { marginBottom: viewportMetrics.bottomContentInset }]}
        >
        <View style={[styles.header, shopLayoutMetrics.catalog.accessibilityLayout && styles.headerAccessibility]}>
          <View style={styles.headerLeft}>
            {showBackButton ? (
              <ActionButtonCircle
                accessibilityLabel={copy.back}
                accessibilityState={{ disabled: shopExitLocked }}
                disabled={shopExitLocked}
                onPress={handleCloseShop}
                size={44}
              >
                <Ionicons name="chevron-back" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
            ) : null}
            <View style={styles.headerCopy}>
              <Text
                accessibilityRole="header"
                testID="shop-header-brand"
                style={styles.headerEyebrow}
              >
                {copy.brand}
              </Text>
              <Text testID="shop-header-title" style={styles.headerTitle}>
                {shopMode === "home" ? copy.homeCollection : copy.liveCloset}
              </Text>
            </View>
          </View>
            <Pressable
              testID="shop-coin-balance"
              accessibilityRole="button"
              accessibilityLabel={`${inventoryVerified ? formatCoins(inventoryStore.inventory.coins, locale) : "—"} ${coinPackCopy.coins}`}
              accessibilityState={{ disabled: !requiresServerInventory || !canPerformShopActions || !IS_BLUMI_PAID_COINS_ENABLED, expanded: IS_BLUMI_PAID_COINS_ENABLED && isCoinWalletOpen }}
              disabled={!requiresServerInventory || !canPerformShopActions || !IS_BLUMI_PAID_COINS_ENABLED}
              onPress={() => setIsCoinWalletOpen((current) => !current)}
              style={({ pressed }) => [
                styles.coinPill,
                shopLayoutMetrics.catalog.accessibilityLayout && styles.coinPillAccessibility,
                pressed ? styles.coinPillPressed : null
              ]}
            >
              <ShopCoinBalance
                coins={inventoryStore.inventory.coins}
                verified={inventoryVerified}
                locale={locale}
              />
            </Pressable>
        </View>

          <ShopModeDock
            activeMode={shopMode}
            width={shopLayoutMetrics.contentWidth}
            locale={locale}
            onSelectMode={handleSelectMode}
            counts={{
              avatar: avatarProducts.length,
              home: roomProducts.length
            }}
          />
          {IS_BLUMI_PAID_COINS_ENABLED && requiresServerInventory && inventoryVerified && isCoinWalletOpen ? (
            <CoinPackWalletPanel
              locale={locale}
              state={coinPackWallet.state}
              products={coinPackWallet.products}
              onPurchase={(packId) => {
                void coinPackWallet.purchase(packId)
              }}
            />
          ) : null}
          {shopPresentationState === "offline" && showShopContent ? (
            <ShopOfflineNotice locale={locale} />
          ) : null}

          {showShopContent ? (
            <Reanimated.View entering={contentEntering} style={{ gap: shopLayoutMetrics.sectionGap }}>
              <Animated.View
                testID="shop-preview-motion"
                style={[
                  styles.showcaseCard,
                  { padding: shopLayoutMetrics.showcasePadding },
                  shopMode === "avatar" ? undefined : previewTransition
                ]}
              >
                <ShopPreviewPanel
                  mode={shopMode}
                  product={presentationProduct}
                  previewAvatar={previewAvatar}
                  roomPreviewScene={roomPreviewScene}
                  layoutMetrics={shopLayoutMetrics}
                  isPurchasing={
                    isPurchasing || isRemoving || combinationState.phase !== "editing"
                  }
                  locale={locale}
                  isActionAvailable={isActionAvailable}
                  combinationSummary={inventoryVerified && shopMode === "avatar" && hasCombinationChanges ? combinationSummary : undefined}
                  combinationItems={inventoryVerified ? combinationItems : []}
                  onSelectCombinationItem={(id) => {
                    const item = avatarProducts.find((entry) => entry.sourceItemId === id)
                    if (item) {
                      publishSelectedShopPreviewWarmup([])
                      setSelectedId(item.id)
                    }
                  }}
                  supportsCombinationAction={inventoryVerified && multiItemApplyEnabled}
                  primaryActionLabel={
                    !inventoryVerified
                      ? inventoryGateLabel
                      : shopMode === "avatar"
                        ? multiItemApplyEnabled && (combinationItems.length > 1 || combinationSummary.purchaseCount === 0)
                          ? combinationSummary.purchaseCount > 0
                            ? copy.combination.buyLook
                            : copy.combination.applyLook
                          : undefined
                        : undefined
                  }
                  primaryActionDisabled={
                    !inventoryVerified ||
                    (shopMode === "avatar" && multiItemApplyEnabled && (
                      !hasCombinationChanges || combinationSummary.total === null
                    ))
                  }
                  canRemovePreview={shopMode === "avatar" && canRemoveAvatarPreview}
                  onRemovePreview={handleRemoveAvatarPreview}
                  onPrimaryAction={() => {
                    void handlePrimaryAction()
                  }}
                />
              </Animated.View>

              {!inventoryVerified && shopPresentationState === "error" ? (
                <ShopStatusCard
                  state="error"
                  isRetrying={inventoryStore.hydrationStatus === "loading"}
                  onRetry={handleRetryShop}
                  locale={locale}
                />
              ) : null}

              <ClosetBrowser
                categories={categoryOptions}
                activeCategoryId={activeCategoryId}
                products={filteredProducts}
                inventoryVerified={inventoryVerified}
                pendingInventoryLabel={inventoryGateLabel}
                selectedId={selectedProduct?.id}
                mode={shopMode}
                locale={locale}
                layoutMetrics={shopLayoutMetrics}
                onSelectCategory={handleSelectCategory}
                onSelectProduct={handleSelectProduct}
                revealRequest={shelfRevealRequest}
                removeActionById={removeActionById}
                onRemoveProduct={onRemoveProduct}
              />
            </Reanimated.View>
          ) : showSkeleton ? (
            <ShopShelfSkeleton layoutMetrics={shopLayoutMetrics} locale={locale} />
          ) : (
            <ShopStatusCard
              state={shopStatusState}
              isRetrying={inventoryStore.hydrationStatus === "loading"}
              onRetry={handleRetryShop}
              locale={locale}
            />
          )}
        </ScrollView>
      </SafeAreaView>
      <ShopCheckoutSheet
        checkout={checkout}
        balance={inventoryVerified ? inventoryStore.inventory.coins : null}
        canPerformActions={canPerformShopActions}
        locale={locale}
        onConfirm={() => {
          void confirmCheckout()
        }}
        onClose={closeCheckout}
        onRetry={retryCheckout}
      />
    </View>
  )
}
