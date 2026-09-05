import Ionicons from "@expo/vector-icons/Ionicons"
import {
  ECONOMY_CATALOG,
  resolveR1PublishedEconomyCatalog
} from "@blumi/domain"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Alert,
  FlatList,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { CoinPackWalletPanel } from "../features/commerce/CoinPackWalletPanel"
import { getCoinPackCopy } from "../features/commerce/coinPackCopy"
import { useCoinPackWallet } from "../features/commerce/useCoinPackWallet"
import {
  useInventoryStore
} from "../features/inventory/inventoryStore"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2.mock"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import type { SessionActor } from "../features/session/sessionModel"
import type {
  FurnitureCategory,
  FurnitureItem,
  RoomFurnitureRotation,
  UserRoomDecor
} from "../features/roomV2/roomV2.types"
import {
  buildShopCatalogItems,
  type ShopCatalogItem
} from "../features/shop/shopCatalog"
import {
  SHOP_AVATAR_CATEGORY_ORDER,
  filterAvatarShopProductsByCategory,
  getAvatarShopCategoryId
} from "../features/shop/shopAvatarCategoryModel"
import { resolveShopSelectedProduct } from "../features/shop/shopSelectionModel"
import { ShopPreviewPanel } from "../features/shop/ShopPreviewPanel"
import {
  getShopLayoutMetrics,
  type ShopLayoutMetrics
} from "../features/shop/shopLayoutMetrics"
import { formatCoins } from "../features/shop/shopFormatters"
import { getShopCopy } from "../features/shop/shopCopy"
import { resolveShopCatalogRuntime } from "../features/shop/shopCatalogRuntime"
import { getMaleRigLayerThumbnailPresentation } from "../features/avatarV2/maleRigThumbnailPresentation"
import { getAvatarAutomationSlug } from "../features/avatarV2/qa/avatarQaInventory"
import {
  getAvatarItemPreviewSource,
  getRoomProductThumbnailSource,
  getShopProductThumbnailSource,
  PRODUCT_REFERENCE_AVATAR_ITEM_IDS,
  RIG_LAYER_THUMBNAIL_ITEM_IDS
} from "../features/shop/shopAssets"
import {
  getShopPresentationState,
  shouldRenderShopContent,
  type ShopPresentationState
} from "../features/shop/shopPresentationModel"
import {
  ShopModeDock,
  ShopOfflineNotice,
  ShopStatusCard,
  type ShopMode
} from "../features/shop/ShopNavigationControls"
import { getLocaleIdentifier } from "../features/session/appLocale"
import { getAppLocale } from "../features/session/authLocale"
import { runShopPrimaryAction } from "../features/shop/shopPurchaseCoordinator"
import {
  createShopCombinationState,
  reduceShopCombination,
  type ShopCombinationAction,
  type ShopCombinationCommand,
  type ShopCombinationState
} from "../features/shop/shopCombinationState"
import {
  avatarToShopCombinationDraft,
  hasAvatarDraftChanges,
  isAvatarShopItemPreviewing,
  previewAvatarShopItem,
  restoreAvatarShopItemPreview,
  shopCombinationDraftToAvatar
} from "../features/shop/shopAvatarDraft"
import { loadoutToUserAvatar } from "../features/avatarV2/avatarSelectionModel"
import {
  canMerchandiseSemanticOutfits,
  isShopMultiItemApplyEnabled
} from "../features/shop/shopCapabilityPolicy"
import { resolveQueuedAvatarProduct } from "../features/shop/shopQueueProductPolicy"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { hapticError, hapticLight, hapticSuccess } from "../ui/haptics"
import { useNetworkStatus } from "../features/network/networkStore"
import { SoftBlobBackground } from "../ui/backgrounds"
import { useSelectionTransition } from "../ui/animations"
import { ActionButtonCircle } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { showToast } from "../ui/toast"
import { captureProductEvent } from "../analytics/productAnalytics"
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

const INITIAL_PRODUCT_REFERENCE_SHOP_ITEM_ID =
  "avatar:avatar_v2_top_cherry_heart_milkmaid_blouse"
type ShopCategoryOption = {
  id: string
  label: string
  count: number
  icon: keyof typeof Ionicons.glyphMap
}
const SHOP_PRODUCT_COLUMNS_PER_PAGE = 2

export function CosmeticShopScreen(props: CosmeticShopScreenProps) {
  const { navigation, sessionActor } = props
  const locale = getAppLocale()
  const copy = getShopCopy(locale)
  const coinPackCopy = getCoinPackCopy(locale)
  const viewportMetrics = useAppViewportMetrics({ bottomNavVisible: true })
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
    isProductionSession: sessionActor.session.mode === "production",
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
  const productionEconomyCatalog = useMemo(
    () => shopCatalogRuntime.enforcePublishedCatalog
      ? resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG)
      : undefined,
    [shopCatalogRuntime.enforcePublishedCatalog]
  )
  const publishedItemIds = useMemo(
    () => productionEconomyCatalog?.map((item) => item.itemId),
    [productionEconomyCatalog]
  )
  const initialShopMode = props.route.params?.initialShopMode ?? props.initialShopMode ?? "avatar"
  const [selectedId, setSelectedId] = useState(INITIAL_PRODUCT_REFERENCE_SHOP_ITEM_ID)
  const [shopMode, setShopMode] = useState<ShopMode>(initialShopMode)
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    getDefaultShopCategoryId(initialShopMode)
  )
  const [isCoinWalletOpen, setIsCoinWalletOpen] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [combinationState, setCombinationState] = useState<ShopCombinationState>(
    () => createShopCombinationState({
      equipped: avatarToShopCombinationDraft(avatarV2.avatar),
      ownedProductIds: inventoryStore.inventory.ownedAvatarItemIds,
      avatarRevision: sessionActor.profile.avatar.revision ?? 0
    })
  )
  const combinationStateRef = useRef(combinationState)
  const combinationBalanceRef = useRef(inventoryStore.inventory.coins)
  const hydratedSessionTokenRef = useRef<string | null>(null)
  const shopLayoutMetrics = useMemo(
    () => getShopLayoutMetrics({
      width: viewportMetrics.safeWidth,
      height: viewportMetrics.contentHeight,
      horizontalInset: viewportMetrics.horizontalGutter,
      minimumTouchTarget: viewportMetrics.minTouchTarget
    }),
    [
      viewportMetrics.contentHeight,
      viewportMetrics.horizontalGutter,
      viewportMetrics.minTouchTarget,
      viewportMetrics.safeWidth
    ]
  )

  useEffect(() => {
    const requestedShopMode = props.route.params?.initialShopMode
    if (!requestedShopMode) return
    setShopMode(requestedShopMode)
    setSelectedCategoryId(getDefaultShopCategoryId(requestedShopMode))
  }, [props.route.params?.initialShopMode])

  useEffect(() => {
    if (!requiresServerInventory) return
    if (sessionActor.session.mode !== "production") return
    const { sessionToken } = sessionActor.session
    if (hydratedSessionTokenRef.current === sessionToken) return
    hydratedSessionTokenRef.current = sessionToken
    void inventoryStore.hydrateFromServer(sessionToken)
  }, [inventoryStore, requiresServerInventory, sessionActor.session])

  const dispatchCombination = useCallback((
    action: ShopCombinationAction,
    baseState: ShopCombinationState = combinationStateRef.current
  ): readonly ShopCombinationCommand[] => {
    const transition = reduceShopCombination(baseState, action)
    combinationStateRef.current = transition.state
    setCombinationState(transition.state)
    return transition.commands
  }, [])

  const discardShopPreview = useCallback((): void => {
    dispatchCombination({ type: "discard_draft" })
  }, [dispatchCombination])

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (combinationStateRef.current.phase !== "editing") {
      event.preventDefault()
      return
    }
    discardShopPreview()
  }), [
    discardShopPreview,
    navigation
  ])

  const shopExitLocked = combinationState.phase !== "editing"
  const handleCloseShop = useCallback((): void => {
    if (combinationStateRef.current.phase !== "editing") return
    discardShopPreview()
    navigation.goBack()
  }, [discardShopPreview, navigation])

  const shopItems = useMemo(
    () =>
      buildShopCatalogItems({
        inventory: inventoryStore.inventory,
        avatar: avatarV2.avatar,
        roomDecor: roomV2.userRoomDecor,
        economyCatalog: productionEconomyCatalog,
        publishedItemIds,
        roomFurnitureCatalog: props.roomFurnitureCatalog,
        qaOwnedRoomItemIds: props.qaOnlyOwnedRoomItemIds
      }),
    [
      avatarV2.avatar,
      inventoryStore.inventory,
      productionEconomyCatalog,
      props.qaOnlyOwnedRoomItemIds,
      props.roomFurnitureCatalog,
      publishedItemIds,
      roomV2.userRoomDecor
    ]
  )

  const avatarProducts = useMemo(
    () =>
      sortAvatarShopProducts(
        shopItems
          .filter((item) => item.sectionId === "avatar")
          .filter(isDisplayableAvatarShopProduct)
          .filter((item) =>
            semanticOutfitMerchandisingEnabled || !item.avatarItem?.outfitKey
          )
      ),
    [semanticOutfitMerchandisingEnabled, shopItems]
  )
  const roomProducts = useMemo(
    () => sortRoomShopProducts(shopItems.filter((item) => item.sectionId === "room")),
    [shopItems]
  )
  const activeProducts = useMemo(() => {
    if (shopMode === "avatar") return avatarProducts
    return roomProducts
  }, [avatarProducts, roomProducts, shopMode])
  const categoryOptions = useMemo(
    () => buildShopCategoryOptions(shopMode, activeProducts, locale),
    [activeProducts, locale, shopMode]
  )
  const activeCategoryId = useMemo(() => {
    if (categoryOptions.some((category) => category.id === selectedCategoryId)) {
      return selectedCategoryId
    }
    return categoryOptions[0]?.id ?? getDefaultShopCategoryId(shopMode)
  }, [categoryOptions, selectedCategoryId, shopMode])
  const filteredProducts = useMemo(
    () => filterProductsByCategory(activeProducts, shopMode, activeCategoryId),
    [activeCategoryId, activeProducts, shopMode]
  )
  const shopPresentationState = getShopPresentationState({
    isProduction: requiresServerInventory,
    isConnected,
    isReady: inventoryStore.isReady,
    hydrationStatus: inventoryStore.hydrationStatus,
    productCount: activeProducts.length
  })
  const showShopContent = shouldRenderShopContent({
    state: shopPresentationState,
    isReady: inventoryStore.isReady,
    productCount: activeProducts.length
  })
  const shopStatusState: Exclude<ShopPresentationState, "ready"> =
    shopPresentationState === "ready" ? "loading" : shopPresentationState
  const isActionAvailable = !requiresServerInventory || isConnected

  const selectedProduct = useMemo(
    () => resolveShopSelectedProduct({
      mode: shopMode,
      selectedId,
      filteredProducts,
      activeProducts
    }),
    [activeProducts, filteredProducts, selectedId, shopMode]
  )
  const previewTransition = useSelectionTransition(selectedProduct?.id, {
    fromScale: 0.99,
    translateY: 5
  })

  const previewAvatar = useMemo(
    () => shopCombinationDraftToAvatar(
      combinationState.draft,
      avatarV2.avatar
    ),
    [avatarV2.avatar, combinationState.draft]
  )
  const hasCombinationChanges = useMemo(
    () => hasAvatarDraftChanges(avatarV2.avatar, previewAvatar),
    [avatarV2.avatar, previewAvatar]
  )
  const canRemoveAvatarPreview = useMemo(
    () => Boolean(
      selectedProduct?.avatarItem &&
      isAvatarShopItemPreviewing(
        previewAvatar,
        selectedProduct.avatarItem
      ) &&
      !isAvatarShopItemPreviewing(avatarV2.avatar, selectedProduct.avatarItem) &&
      hasAvatarDraftChanges(avatarV2.avatar, previewAvatar)
    ),
    [avatarV2.avatar, previewAvatar, selectedProduct]
  )

  const handleRemoveAvatarPreview = useCallback((): void => {
    const item = selectedProduct?.avatarItem
    if (!item || combinationStateRef.current.phase !== "editing") return
    const currentPreview = shopCombinationDraftToAvatar(
      combinationStateRef.current.draft,
      avatarV2.avatar
    )
    if (!isAvatarShopItemPreviewing(currentPreview, item) ||
      isAvatarShopItemPreviewing(avatarV2.avatar, item)) return
    const restored = restoreAvatarShopItemPreview(
      currentPreview,
      avatarV2.avatar,
      item,
      avatarV2.catalog
    )
    dispatchCombination({
      type: "replace_draft",
      draft: avatarToShopCombinationDraft(restored)
    })
    hapticLight()
  }, [avatarV2.avatar, avatarV2.catalog, dispatchCombination, selectedProduct])

  const roomPreviewScene = useMemo(() => {
    const selectedRoomItem =
      selectedProduct?.previewType === "room"
        ? selectedProduct.roomItem
        : roomProducts[0]?.roomItem
    if (!selectedRoomItem) {
      return resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog: props.roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG,
        decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [] },
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      })
    }
    return resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: props.roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG,
      decor: createRoomPreviewDecor(selectedRoomItem, roomV2.userRoomDecor),
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
  }, [props.roomFurnitureCatalog, roomProducts, roomV2.userRoomDecor, selectedProduct])

  const handleSelectProduct = useCallback((product: ShopCatalogItem): void => {
    hapticLight()
    if (product.previewType === "avatar") {
      setShopMode("avatar")
      if (shopMode !== "avatar") {
        setSelectedCategoryId(getPrimaryProductCategoryId(product, "avatar"))
      }
      if (product.avatarItem && combinationStateRef.current.phase === "editing") {
        const currentAvatar = shopCombinationDraftToAvatar(
          combinationStateRef.current.draft,
          avatarV2.avatar
        )
        const nextAvatar = previewAvatarShopItem(
          currentAvatar,
          product.avatarItem,
          avatarV2.catalog
        )
        dispatchCombination({
          type: "replace_draft",
          draft: avatarToShopCombinationDraft(nextAvatar)
        })
      }
    }
    if (product.previewType === "room") {
      setShopMode("home")
      if (shopMode !== "home") {
        setSelectedCategoryId(getPrimaryProductCategoryId(product, "home"))
      }
    }
    setSelectedId(product.id)
  }, [
    avatarV2.avatar,
    avatarV2.catalog,
    dispatchCombination,
    shopMode
  ])

  const handleSelectMode = useCallback((nextMode: ShopMode): void => {
    hapticLight()
    setShopMode(nextMode)
    const nextCategoryId = getDefaultShopCategoryId(nextMode)
    const nextProducts = nextMode === "avatar" ? avatarProducts : roomProducts
    const nextProduct =
      filterProductsByCategory(nextProducts, nextMode, nextCategoryId)[0]
        ?? nextProducts[0]
    setSelectedCategoryId(nextCategoryId)
    if (nextProduct) {
      setSelectedId(nextProduct.id)
    }
  }, [avatarProducts, roomProducts])

  const handleSelectCategory = useCallback((categoryId: string): void => {
    hapticLight()
    const nextProduct =
      filterProductsByCategory(activeProducts, shopMode, categoryId)[0]
        ?? activeProducts[0]
    setSelectedCategoryId(categoryId)
    if (nextProduct) {
      setSelectedId(nextProduct.id)
    }
  }, [activeProducts, shopMode])

  const handleRetryShop = useCallback((): void => {
    if (!requiresServerInventory) return
    if (sessionActor.session.mode !== "production") return
    void inventoryStore.hydrateFromServer(sessionActor.session.sessionToken)
  }, [inventoryStore, requiresServerInventory, sessionActor.session])

  const executeCombinationCommands = useCallback(async function execute(
    commands: readonly ShopCombinationCommand[]
  ): Promise<void> {
    const command = commands[0]
    if (!command) return

    if (command.type === "request_purchase_confirmation") {
      const resolution = resolveQueuedAvatarProduct(command.productId, avatarProducts)
      if (resolution.kind === "missing") {
        dispatchCombination({ type: "cancel_apply" })
        showToast({
          title: copy.combination.itemUnavailable,
          type: "warning"
        })
        return
      }
      const { product } = resolution
      const approved = await confirmAvatarShopPurchase({
        product,
        balance: combinationBalanceRef.current,
        locale
      })
      if (!approved) {
        dispatchCombination({ type: "cancel_apply" })
        return
      }
      await execute(dispatchCombination({
        type: "purchase_approved",
        productId: command.productId
      }))
      return
    }

    if (command.type === "purchase_product") {
      const resolution = resolveQueuedAvatarProduct(command.productId, avatarProducts)
      if (resolution.kind === "missing") {
        dispatchCombination({
          type: "purchase_failed",
          productId: command.productId,
          reason: "invalid_item"
        })
        hapticError()
        showToast({
          title: copy.combination.itemUnavailable,
          type: "warning"
        })
        return
      }
      const { product } = resolution
      if (product.priceCoins === null) {
        dispatchCombination({
          type: "purchase_failed",
          productId: command.productId,
          reason: "invalid_price"
        })
        showToast({
          title: copy.combination.priceNeedsRefresh,
          type: "warning"
        })
        return
      }
      setIsPurchasing(true)
      const result = sessionActor.session.mode === "production"
        ? await inventoryStore.purchaseAvatarItem(
            sessionActor.session.sessionToken,
            command.productId
          )
        : inventoryStore.unlockAvatarItem(
            command.productId,
            product.priceCoins
          )
      setIsPurchasing(false)
      if (!result.success && result.reason !== "already_owned") {
        captureProductEvent("purchase_failed", {
          item_type: "avatar",
          reason: result.reason
        })
        dispatchCombination({
          type: "purchase_failed",
          productId: command.productId,
          reason: result.reason ?? "server_error"
        })
        hapticError()
        showToast({
          title: getAvatarPurchaseFailureTitle(result.reason, locale),
          type: "warning"
        })
        return
      }
      if (result.success) {
        combinationBalanceRef.current = Math.max(
          0,
          combinationBalanceRef.current - product.priceCoins
        )
        captureProductEvent("purchase_completed", {
          item_type: "avatar",
          price_coins: product.priceCoins
        })
      }
      await execute(dispatchCombination({
        type: "purchase_succeeded",
        productId: command.productId
      }))
      return
    }

    const avatarToSave = shopCombinationDraftToAvatar(
      command.combination,
      avatarV2.avatar
    )
    const result = await avatarV2.saveAvatar(avatarToSave)
    if (!result.ok) {
      if (result.reason === "conflict" && result.currentSelection) {
        dispatchCombination({ type: "avatar_save_revision_conflict" })
        const currentAvatar = loadoutToUserAvatar(result.currentSelection.loadout)
        dispatchCombination({
          type: "refresh_after_conflict",
          equipped: avatarToShopCombinationDraft(currentAvatar),
          ownedProductIds: inventoryStore.inventory.ownedAvatarItemIds,
          avatarRevision: result.currentSelection.revision
        })
        hapticError()
        showToast({ title: result.errorMessage, type: "warning" })
        return
      }
      dispatchCombination({
        type: "avatar_save_failed",
        reason: result.errorMessage
      })
      hapticError()
      showToast({ title: result.errorMessage, type: "warning" })
      return
    }
    dispatchCombination({
      type: "avatar_save_confirmed",
      avatarRevision: result.selection?.revision ?? command.avatarRevision
    })
    hapticSuccess()
    showToast({
      title: copy.combination.appliedTitle,
      body: copy.combination.appliedBody,
      type: "success"
    })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    avatarProducts,
    avatarV2.avatar,
    avatarV2.catalog,
    avatarV2.saveAvatar,
    dispatchCombination,
    copy.combination,
    inventoryStore,
    locale,
    sessionActor.session
  ])

  const handleApplyCombination = useCallback(async (): Promise<void> => {
    if (combinationStateRef.current.phase !== "editing") return
    if (!isActionAvailable) {
      hapticError()
      showToast({
        title: copy.offline.title,
        body: copy.offline.actionUnavailable,
        type: "warning"
      })
      return
    }
    const draftAvatar = shopCombinationDraftToAvatar(
      combinationStateRef.current.draft,
      avatarV2.avatar
    )
    if (!hasAvatarDraftChanges(avatarV2.avatar, draftAvatar)) {
      showToast({
        title: copy.combination.alreadyApplied,
        type: "info"
      })
      return
    }
    combinationBalanceRef.current = inventoryStore.inventory.coins
    const synchronizedState: ShopCombinationState = {
      ...combinationStateRef.current,
      ownedProductIds: [
        ...new Set([
          ...combinationStateRef.current.ownedProductIds,
          ...inventoryStore.inventory.ownedAvatarItemIds
        ])
      ]
    }
    await executeCombinationCommands(dispatchCombination(
      { type: "apply" },
      synchronizedState
    ))
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    avatarV2.avatar,
    copy.offline.actionUnavailable,
    copy.offline.title,
    copy.combination.alreadyApplied,
    dispatchCombination,
    executeCombinationCommands,
    inventoryStore.inventory,
    isActionAvailable,
    locale
  ])

  const handlePrimaryAction = useCallback(async (): Promise<void> => {
    if (shopMode === "avatar" && multiItemApplyEnabled) {
      await handleApplyCombination()
      return
    }
    let savedAvatar: ReturnType<typeof previewAvatarShopItem> | null = null
    await runShopPrimaryAction({
      selectedProduct,
      isPurchasing,
      isReadOnly: !isActionAvailable,
      readOnlyTitle: copy.offline.title,
      readOnlyReason: copy.offline.actionUnavailable,
      inventoryStore,
      sessionActor,
      equipAndSaveItem: async (item) => {
        const result = await avatarV2.equipAndSaveItem(item)
        if (result.ok) {
          savedAvatar = previewAvatarShopItem(
            avatarV2.avatar,
            item,
            avatarV2.catalog
          )
        }
        return result
      },
      setIsPurchasing,
      navigateToRoom: (placementItemId) => navigation.navigate("MyRoomEditor", {
        placementItemId
      }),
      hapticError,
      hapticSuccess,
      showToast,
      captureProductEvent
    })
    if (savedAvatar) {
      const rebasedState = createShopCombinationState({
        equipped: avatarToShopCombinationDraft(savedAvatar),
        ownedProductIds: inventoryStore.inventory.ownedAvatarItemIds,
        avatarRevision: combinationStateRef.current.avatarRevision
      })
      combinationStateRef.current = rebasedState
      setCombinationState(rebasedState)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    avatarV2.equipAndSaveItem,
    avatarV2.avatar,
    avatarV2.catalog,
    copy.offline.title,
    copy.offline.actionUnavailable,
    inventoryStore,
    isActionAvailable,
    isPurchasing,
    handleApplyCombination,
    multiItemApplyEnabled,
    navigation,
    selectedProduct,
    sessionActor,
    shopMode
  ])

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="homeLiquid" />
      <SafeAreaView
        contentGutter={false}
        style={[
          styles.safe,
          { paddingHorizontal: shopLayoutMetrics.horizontalInset }
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <ActionButtonCircle
              accessibilityLabel={copy.back}
              accessibilityState={{ disabled: shopExitLocked }}
              disabled={shopExitLocked}
              onPress={handleCloseShop}
              size={44}
            >
              <Ionicons name="chevron-back" size={20} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
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
              accessibilityLabel={`${coinPackCopy.title}, ${formatCoins(inventoryStore.inventory.coins, locale)} ${coinPackCopy.coins}`}
              accessibilityState={{ disabled: !requiresServerInventory, expanded: isCoinWalletOpen }}
              disabled={!requiresServerInventory}
              onPress={() => setIsCoinWalletOpen((current) => !current)}
              style={({ pressed }) => [
                styles.coinPill,
                pressed ? styles.coinPillPressed : null
              ]}
            >
              <Ionicons name="diamond" size={14} color="#B9820D" />
              <Text style={styles.coinText}>
                {formatCoins(inventoryStore.inventory.coins, locale)}
              </Text>
            </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.shopContent,
            {
              gap: shopLayoutMetrics.sectionGap,
              paddingBottom: uiTheme.spacing.lg
            }
          ]}
          style={[
            styles.shopScroller,
            { marginBottom: viewportMetrics.bottomContentInset }
          ]}
        >
          <ShopModeDock
            activeMode={shopMode}
            locale={locale}
            onSelectMode={handleSelectMode}
            counts={{
              avatar: avatarProducts.length,
              home: roomProducts.length
            }}
          />
          {requiresServerInventory && isCoinWalletOpen ? (
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
            <>
              <Animated.View
                testID="shop-preview-motion"
                style={[
                  styles.showcaseCard,
                  { padding: shopLayoutMetrics.showcasePadding },
                  previewTransition
                ]}
              >
                <ShopPreviewPanel
                  product={selectedProduct}
                  previewAvatar={previewAvatar}
                  roomPreviewScene={roomPreviewScene}
                  layoutMetrics={shopLayoutMetrics}
                  isPurchasing={
                    isPurchasing || combinationState.phase !== "editing"
                  }
                  locale={locale}
                  isActionAvailable={isActionAvailable}
                  primaryActionLabel={shopMode === "avatar"
                    ? multiItemApplyEnabled
                      ? copy.combination.applyLook
                      : undefined
                    : undefined}
                  primaryActionDisabled={shopMode === "avatar"
                    ? multiItemApplyEnabled ? !hasCombinationChanges : undefined
                    : undefined}
                  canRemovePreview={shopMode === "avatar" && canRemoveAvatarPreview}
                  onRemovePreview={handleRemoveAvatarPreview}
                  onPrimaryAction={() => {
                    void handlePrimaryAction()
                  }}
                />
              </Animated.View>

              <ClosetBrowser
                categories={categoryOptions}
                activeCategoryId={activeCategoryId}
                products={filteredProducts}
                selectedId={selectedProduct?.id}
                mode={shopMode}
                locale={locale}
                layoutMetrics={shopLayoutMetrics}
                onSelectCategory={handleSelectCategory}
                onSelectProduct={handleSelectProduct}
              />
            </>
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
    </View>
  )
}

function sortAvatarShopProducts(products: ShopCatalogItem[], locale = getAppLocale()): ShopCatalogItem[] {
  return [...products].sort((left, right) => {
    const priorityDelta =
      getAvatarShopProductPriority(left) - getAvatarShopProductPriority(right)
    if (priorityDelta !== 0) return priorityDelta
    return left.title.localeCompare(right.title, getLocaleIdentifier(locale))
  })
}

function isDisplayableAvatarShopProduct(product: ShopCatalogItem): boolean {
  if (!product.avatarItem) return false
  return getShopProductThumbnailSource(product.sourceItemId) !== undefined
}

function getAvatarShopProductPriority(product: ShopCatalogItem): number {
  if (PRODUCT_REFERENCE_AVATAR_ITEM_IDS.has(product.sourceItemId)) return 0
  if (product.priceCoins !== null) return 1
  return 2
}

function ClosetBrowser(props: {
  categories: ShopCategoryOption[]
  activeCategoryId: string
  products: ShopCatalogItem[]
  selectedId: string | undefined
  mode: ShopMode
  locale: ReturnType<typeof getAppLocale>
  layoutMetrics: ShopLayoutMetrics
  onSelectCategory: (categoryId: string) => void
  onSelectProduct: (product: ShopCatalogItem) => void
}) {
  const copy = getShopCopy(props.locale)
  const title = props.mode === "avatar" ? copy.findYourStyle : copy.roomPieces
  const subtitle =
    props.mode === "avatar"
      ? copy.avatarCatalogHint
      : copy.roomCatalogHint
  const { catalog } = props.layoutMetrics
  const categoryRailWidth = catalog.categoryRailWidth
  const productShelfWidth = catalog.productShelfWidth
  const productCardWidth = catalog.productCardWidth
  const productScrollerRef = useRef<FlatList<ShopCatalogItem[][]>>(null)
  useEffect(() => {
    productScrollerRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [props.activeCategoryId, props.mode])
  const productColumns = useMemo(() => {
    const columns: ShopCatalogItem[][] = []
    for (let index = 0; index < props.products.length; index += 2) {
      columns.push(props.products.slice(index, index + 2))
    }
    return columns
  }, [props.products])
  const productPages = useMemo(() => {
    const pages: ShopCatalogItem[][][] = []
    for (
      let index = 0;
      index < productColumns.length;
      index += SHOP_PRODUCT_COLUMNS_PER_PAGE
    ) {
      pages.push(
        productColumns.slice(index, index + SHOP_PRODUCT_COLUMNS_PER_PAGE)
      )
    }
    return pages
  }, [productColumns])
  const renderProductPage = useCallback(
    ({ item, index }: { item: ShopCatalogItem[][]; index: number }) => (
      <View
        key={`shop-page-${item[0]?.[0]?.id ?? index}`}
        style={[
          styles.closetProductPage,
          { width: productShelfWidth, gap: catalog.columnGap }
        ]}
      >
        {item.map((column, columnIndex) => (
          <View
            key={`shop-column-${column[0]?.id ?? columnIndex}`}
            style={styles.closetProductColumn}
          >
            {column.map((product) => (
              <ShopProductCard
                key={product.id}
                product={product}
                selected={product.id === props.selectedId}
                selectedCompact
                cardWidth={productCardWidth}
                cardHeight={catalog.productCardHeight}
                cardPadding={catalog.cardPadding}
                thumbHeight={catalog.productThumbHeight}
                locale={props.locale}
                onSelectProduct={props.onSelectProduct}
              />
            ))}
          </View>
        ))}
      </View>
    ),
    [catalog, productCardWidth, productShelfWidth, props.locale, props.onSelectProduct, props.selectedId]
  )

  return (
    <View style={[styles.closetBrowserCard, { padding: catalog.cardPadding }]}>
      <View style={styles.closetBrowserHeader}>
        <View style={styles.closetBrowserCopy}>
          <Text style={styles.closetBrowserTitle}>{title}</Text>
          <Text style={styles.closetBrowserSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={[styles.closetBrowserBody, { gap: catalog.bodyGap }]}>
        <VerticalShopCategoryRail
          categories={props.categories}
          activeCategoryId={props.activeCategoryId}
          onSelectCategory={props.onSelectCategory}
          width={categoryRailWidth}
          locale={props.locale}
        />
        <FlatList
          ref={productScrollerRef}
          data={productPages}
          horizontal
          pagingEnabled
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          showsHorizontalScrollIndicator={false}
          style={styles.closetProductScroller}
          contentContainerStyle={styles.closetProductShelf}
          keyExtractor={(item, index) => item[0]?.[0]?.id ?? `shop-page-${index}`}
          getItemLayout={(_data, index) => ({
            length: productShelfWidth,
            offset: productShelfWidth * index,
            index
          })}
          renderItem={renderProductPage}
        />
      </View>
    </View>
  )
}

function getCompactCategoryLabel(category: ShopCategoryOption): string {
  return category.label
}

const VerticalShopCategoryRail = memo(function VerticalShopCategoryRail(props: {
  categories: ShopCategoryOption[]
  activeCategoryId: string
  width: number
  onSelectCategory: (categoryId: string) => void
  locale: ReturnType<typeof getAppLocale>
}) {
  const copy = getShopCopy(props.locale)
  return (
    <View style={[styles.verticalCategoryRail, { width: props.width }]}>
      {props.categories.map((category) => {
        const active = category.id === props.activeCategoryId
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`${category.label}, ${copy.itemCount(category.count)}`}
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelectCategory(category.id)}
            style={({ pressed }) => [
              styles.verticalCategoryChip,
              active ? styles.verticalCategoryChipActive : null,
              pressed ? styles.verticalCategoryChipPressed : null
            ]}
          >
            <Ionicons
              name={category.icon}
              size={13}
              color={active ? uiTheme.colors.primary : "rgba(45, 31, 58, 0.56)"}
            />
            <Text
              style={[
                styles.verticalCategoryLabel,
                active ? styles.verticalCategoryLabelActive : null
              ]}
              numberOfLines={1}
            >
              {getCompactCategoryLabel(category)}
            </Text>
            <Text
              style={[
                styles.verticalCategoryCount,
                active ? styles.verticalCategoryCountActive : null
              ]}
            >
              {category.count}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}, (previous, next) =>
  previous.activeCategoryId === next.activeCategoryId &&
  previous.width === next.width &&
  previous.categories === next.categories &&
  previous.onSelectCategory === next.onSelectCategory
)

const ShopProductCard = memo(function ShopProductCard(props: {
  product: ShopCatalogItem
  selected: boolean
  selectedCompact?: boolean
  cardWidth?: number
  cardHeight?: number
  cardPadding?: number
  thumbHeight?: number
  metaLabel?: string
  locale: ReturnType<typeof getAppLocale>
  onSelectProduct: (product: ShopCatalogItem) => void
}) {
  const {
    product,
    selected,
    selectedCompact,
    cardWidth,
    cardHeight,
    cardPadding,
    thumbHeight,
    metaLabel,
    locale,
    onSelectProduct
  } = props
  const copy = getShopCopy(locale)
  const compactCardSizeStyle =
    selectedCompact && cardWidth
      ? {
          width: cardWidth,
          height: cardHeight,
          minHeight: cardHeight,
          padding: cardPadding
        }
      : undefined
  const visibleMetaLabel =
    metaLabel
      ?? (selectedCompact && product.priceCoins !== null && !product.owned
        ? formatCoins(product.priceCoins, locale)
        : selectedCompact && product.previewType === "room" && product.owned
          ? copy.readyToPlace
          : product.stateLabel)
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
  const productReference = PRODUCT_REFERENCE_AVATAR_ITEM_IDS.has(product.sourceItemId)
  const automationSlug = product.avatarItem
    ? getAvatarAutomationSlug(product.sourceItemId)
    : product.sourceItemId.replaceAll("_", "-")
  const handlePress = useCallback(() => {
    onSelectProduct(product)
  }, [onSelectProduct, product])
  return (
    <Pressable
      testID={`shop-item-${automationSlug}`}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${visibleMetaLabel}`}
      accessibilityState={{ selected }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.productCard,
        selectedCompact ? styles.productCardCompact : null,
        compactCardSizeStyle,
        selected ? styles.productCardSelected : null,
        pressed ? styles.productCardPressed : null
      ]}
    >
      <View style={[styles.productThumb, { height: thumbHeight }]}>
        {product.previewType === "avatar" ? (
          <View style={styles.productThumbHalo} />
        ) : null}
        {product.previewType === "avatar" && product.avatarItem ? (
          <AvatarProductThumbnail
            item={product.avatarItem}
            source={avatarPreviewSource}
            selected={selected}
            isRigLayerSource={isRigLayerSource}
          />
        ) : product.roomItem ? (
          <Image
            source={roomPreviewSource}
            resizeMode="contain"
            fadeDuration={0}
            style={styles.productImage}
          />
        ) : null}
        {selected || productReference ? (
          <View style={[styles.productDropBadge, selected ? styles.productViewingBadge : null]}>
            <Ionicons
              name={selected ? "eye" : "sparkles"}
              size={10}
              color={selected ? "#FFFFFF" : uiTheme.colors.primary}
            />
          </View>
        ) : null}
      </View>
      <Text style={styles.productTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.88}>
        {product.title}
      </Text>
      <View
        testID={`shop-item-${automationSlug}-price`}
        style={[
          styles.productMetaPill,
          product.owned ? styles.productMetaPillOwned : null
        ]}
      >
        {product.owned ? (
          <Ionicons name="checkmark-circle" size={12} color={uiTheme.colors.successInk} />
        ) : product.priceCoins !== null ? (
          <Ionicons name="diamond" size={12} color="#D79111" />
        ) : null}
        <Text style={styles.productMeta} numberOfLines={1}>
          {visibleMetaLabel}
        </Text>
      </View>
    </Pressable>
  )
})

function AvatarProductThumbnail(props: {
  item: NonNullable<ShopCatalogItem["avatarItem"]>
  source: ImageSourcePropType | undefined
  selected: boolean
  isRigLayerSource: boolean
}) {
  const { item, source, selected, isRigLayerSource } = props
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
    <Image
      source={source}
      resizeMode="contain"
      fadeDuration={0}
      style={[
        isRigLayerSource
          ? styles.productWearableRigLayer
          : styles.productWearableImage,
        rigLayerPresentation
          ? {
              top: rigLayerPresentation.top,
              transform: [{ scale: rigLayerPresentation.scale }]
            }
          : null
      ]}
    />
  )
}

function getAvatarIcon(
  type: NonNullable<ShopCatalogItem["avatarItem"]>["type"]
): keyof typeof Ionicons.glyphMap {
  if (type === "eyes") return "eye"
  if (type === "nose") return "ellipse"
  if (type === "mouth") return "chatbubble-ellipses"
  if (type === "hair") return "sparkles"
  if (type === "top") return "shirt"
  if (type === "bottom") return "layers"
  if (type === "shoes") return "walk"
  if (type === "accessory") return "glasses"
  return "person"
}

function confirmAvatarShopPurchase(input: {
  product: ShopCatalogItem
  balance: number
  locale: ReturnType<typeof getAppLocale>
}): Promise<boolean> {
  const copy = getShopCopy(input.locale).combination
  const price = input.product.priceCoins ?? 0
  const remaining = Math.max(0, input.balance - price)
  return new Promise((resolve) => {
    let settled = false
    const finish = (approved: boolean): void => {
      if (settled) return
      settled = true
      resolve(approved)
    }
    Alert.alert(
      copy.purchaseTitle,
      copy.purchaseSummary(
        input.product.title,
        formatCoins(price, input.locale),
        formatCoins(remaining, input.locale)
      ),
      [
        {
          text: copy.cancel,
          style: "cancel",
          onPress: () => finish(false)
        },
        {
          text: copy.buy,
          onPress: () => finish(true)
        }
      ],
      { cancelable: true, onDismiss: () => finish(false) }
    )
  })
}

function getAvatarPurchaseFailureTitle(
  reason: string | undefined,
  locale: ReturnType<typeof getAppLocale>
): string {
  return getShopCopy(locale).combination.purchaseFailure(reason)
}

function createRoomPreviewDecor(
  item: FurnitureItem,
  baseDecor: UserRoomDecor
): UserRoomDecor {
  const placedItems = baseDecor.placedItems.filter(
    (placedItem) => placedItem.instanceId !== "shop-preview-item"
  )
  return {
    roomShellId: baseDecor.roomShellId || DEFAULT_ROOM_V2_SHELL_ID,
    placedItems: [
      ...placedItems,
      {
        instanceId: "shop-preview-item",
        itemId: item.id,
        x: item.category === "wallDecor" ? 0.28 : 0.54,
        y: item.category === "wallDecor" ? 0.5 : 0.76,
        rotation: getDefaultFurnitureRotation(item)
      }
    ]
  }
}

function getDefaultFurnitureRotation(item: FurnitureItem): RoomFurnitureRotation {
  const rotations = item.assetsByRotation
    ? (Object.keys(item.assetsByRotation) as RoomFurnitureRotation[])
    : []
  if (rotations.length === 0 || rotations.includes("front")) return "front"
  return rotations[0]
}

function getDefaultShopCategoryId(mode: ShopMode): string {
  if (mode === "avatar") return "top"
  return "all"
}

function buildShopCategoryOptions(
  mode: ShopMode,
  products: ShopCatalogItem[],
  locale = getAppLocale()
): ShopCategoryOption[] {
  const categoryCopy = getShopCopy(locale).categories
  const avatarCategoryIcons: Record<(typeof SHOP_AVATAR_CATEGORY_ORDER)[number], keyof typeof Ionicons.glyphMap> = {
    top: "shirt",
    bottom: "layers",
    dress: "sparkles",
    outerwear: "snow",
    shoes: "walk",
    accessory: "glasses",
    hair: "color-wand"
  }
  const candidates: Omit<ShopCategoryOption, "count">[] =
    mode === "avatar"
      ? SHOP_AVATAR_CATEGORY_ORDER.map((id) => ({
          id,
          label: categoryCopy[id],
          icon: avatarCategoryIcons[id]
        }))
      : [
          { id: "all", label: categoryCopy.all, icon: "grid" },
          { id: "owned", label: categoryCopy.owned, icon: "checkmark-circle" },
          { id: "seating", label: categoryCopy.seating, icon: "bed" },
          { id: "table", label: categoryCopy.table, icon: "ellipse" },
          { id: "lighting", label: categoryCopy.lighting, icon: "bulb" },
          { id: "rug", label: categoryCopy.rug, icon: "layers" },
          { id: "wallDecor", label: categoryCopy.wallDecor, icon: "image" },
          { id: "plant", label: categoryCopy.plant, icon: "leaf" },
          { id: "misc", label: categoryCopy.misc, icon: "sparkles" }
        ]

  return candidates
    .map((candidate) => ({
      ...candidate,
      count: filterProductsByCategory(products, mode, candidate.id).length
    }))
    .filter((category) => category.count > 0)
}

function filterProductsByCategory(
  products: ShopCatalogItem[],
  mode: ShopMode,
  categoryId: string
): ShopCatalogItem[] {
  if (mode === "avatar") {
    return filterAvatarShopProductsByCategory(
      products,
      categoryId
    )
  }

  if (categoryId === "all") return products
  if (categoryId === "owned") {
    return products.filter((product) => product.owned)
  }

  return products.filter(
    (product) => product.roomItem?.category === (categoryId as FurnitureCategory)
  )
}

function getPrimaryProductCategoryId(
  product: ShopCatalogItem,
  mode: ShopMode
): string {
  if (mode === "avatar") {
    return getAvatarShopCategoryId(product) ?? getDefaultShopCategoryId(mode)
  }

  return product.roomItem?.category ?? getDefaultShopCategoryId(mode)
}

const HOME_CATEGORY_SORT_ORDER: Record<FurnitureCategory, number> = {
  seating: 0,
  table: 1,
  lighting: 2,
  rug: 3,
  wallDecor: 4,
  plant: 5,
  misc: 6
}

function sortRoomShopProducts(products: ShopCatalogItem[]): ShopCatalogItem[] {
  return [...products].sort((left, right) => {
    const leftCategory = left.roomItem?.category ?? "misc"
    const rightCategory = right.roomItem?.category ?? "misc"
    const categoryDelta =
      HOME_CATEGORY_SORT_ORDER[leftCategory] - HOME_CATEGORY_SORT_ORDER[rightCategory]
    if (categoryDelta !== 0) return categoryDelta
    return left.title.localeCompare(right.title)
  })
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFF4FA",
  },
  safe: {
    flex: 1,
    paddingTop: 4,
  },
  shopScroller: {
    flex: 1,
  },
  shopContent: {
    gap: 6,
  },
  header: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
    paddingBottom: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 0,
  },
  headerEyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    letterSpacing: 2.6,
  },
  headerTitle: {
    ...uiTheme.font.heading,
    fontSize: 24,
    lineHeight: 27,
    color: uiTheme.colors.textPrimary,
  },
  coinPill: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.3)", // Liquid glass
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.6)",
    ...uiTheme.shadow.soft,
  },
  coinPillPressed: {
    opacity: 0.82,
  },
  coinText: {
    ...uiTheme.font.bodyBold,
    color: "#7B5708",
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  showcaseCard: {
    gap: 6,
    padding: 7,
    borderRadius: 26,
    backgroundColor: "rgba(255, 247, 252, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  closetBrowserCard: {
    gap: 6,
    padding: 8,
    borderRadius: 26,
    backgroundColor: "rgba(255, 250, 253, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  closetBrowserHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  closetBrowserCopy: {
    flex: 1,
    gap: 1,
  },
  closetBrowserTitle: {
    ...uiTheme.font.subheading,
    fontSize: 17,
    lineHeight: 20,
    color: uiTheme.colors.textPrimary,
  },
  closetBrowserSubtitle: {
    ...uiTheme.font.caption,
    fontSize: 11.5,
    color: "rgba(103, 91, 115, 0.76)",
    fontWeight: "800",
  },
  closetBrowserBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    minHeight: 254,
  },
  verticalCategoryRail: {
    gap: 5,
    minHeight: 254,
  },
  verticalCategoryChip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.66)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.74)",
  },
  verticalCategoryChipActive: {
    backgroundColor: "rgba(255, 235, 246, 0.96)",
    borderColor: "rgba(255, 79, 152, 0.56)",
  },
  verticalCategoryChipPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  verticalCategoryLabel: {
    ...uiTheme.font.micro,
    flex: 1,
    color: "rgba(45, 31, 58, 0.64)",
    fontSize: 10.5,
    fontWeight: "900",
  },
  verticalCategoryLabelActive: {
    color: uiTheme.colors.primary,
  },
  verticalCategoryCount: {
    ...uiTheme.font.micro,
    minWidth: 19,
    textAlign: "center",
    color: "rgba(45, 31, 58, 0.54)",
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    overflow: "hidden",
  },
  verticalCategoryCountActive: {
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 79, 152, 0.72)",
  },
  closetProductScroller: {
    flex: 1,
    minWidth: 0,
    marginRight: -4,
  },
  closetProductShelf: {
    flexDirection: "row",
    gap: 0,
    paddingRight: 0,
    paddingBottom: 1,
  },
  closetProductPage: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 9,
  },
  closetProductColumn: {
    gap: 8,
  },
  productCard: {
    width: 84,
    minHeight: 118,
    gap: 3,
    padding: 7,
    justifyContent: "space-between",
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.68)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.70)",
    ...uiTheme.shadow.float,
  },
  productCardCompact: {
    width: 76,
    height: 122,
    minHeight: 122,
    padding: 5,
  },
  productCardSelected: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: "rgba(255, 242, 249, 0.94)",
  },
  productCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  productThumb: {
    position: "relative",
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255, 238, 247, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.70)",
    overflow: "hidden",
  },
  productThumbHalo: {
    position: "absolute",
    bottom: 4,
    width: 72,
    height: 42,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#EBC0D8",
    opacity: 0.76,
  },
  productIconOrb: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F2D9E9",
  },
  productIconOrbSelected: {
    backgroundColor: uiTheme.colors.primary,
    borderColor: "rgba(255,255,255,0.5)",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productWearableImage: {
    alignSelf: "center",
    width: "100%",
    height: "100%",
  },
  productWearableRigLayer: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  productDropBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: 1,
    borderColor: "#F2D9E9",
  },
  productViewingBadge: {
    backgroundColor: "rgba(255, 79, 152, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.76)",
  },
  productTitle: {
    ...uiTheme.font.captionBold,
    minHeight: 26,
    fontSize: 11,
    color: uiTheme.colors.textPrimary,
    fontWeight: "900",
    lineHeight: 13,
    textAlign: "center",
  },
  productMetaPill: {
    alignSelf: "center",
    width: "100%",
    minHeight: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 250, 244, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.70)",
  },
  productMetaPillOwned: {
    backgroundColor: "rgba(221, 245, 234, 0.86)",
    borderColor: "rgba(58, 192, 138, 0.30)",
  },
  productMeta: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.chipText,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
})
