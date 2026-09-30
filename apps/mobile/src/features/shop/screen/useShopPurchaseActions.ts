import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState
} from "react"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import type { RootStackParamList } from "../../../navigation/RootNavigator"
import { hapticError, hapticSuccess } from "../../../ui/haptics"
import { showToast } from "../../../ui/toast"
import { loadoutToUserAvatar } from "../../avatarV2/avatarSelectionModel"
import type { useAvatarV2 } from "../../avatarV2/state/AvatarV2Provider"
import type { InventoryStoreView } from "../../inventory/inventoryStore"
import type { AppLocale } from "../../session/appLocale"
import type { SessionActor } from "../../session/sessionModel"
import {
  avatarToShopCombinationDraft,
  hasAvatarDraftChanges,
  previewAvatarShopItem,
  shopCombinationDraftToAvatar
} from "../shopAvatarDraft"
import type { ShopCatalogItem } from "../shopCatalog"
import {
  createShopCombinationState,
  type ShopCombinationAction,
  type ShopCombinationCommand,
  type ShopCombinationState
} from "../shopCombinationState"
import type { ShopCopy } from "../shopCopy"
import type { ShopMode } from "../ShopNavigationControls"
import { runShopPrimaryAction } from "../shopPurchaseCoordinator"
import { resolveQueuedAvatarProduct } from "../shopQueueProductPolicy"
import { confirmAvatarShopPurchase } from "./confirmAvatarShopPurchase"
import { getAvatarPurchaseFailureTitle } from "./shopScreenModel"

/**
 * The Shop's mutation path. Every purchase goes through the inventory store
 * (the server in production); the combination state machine only sequences
 * confirmation, purchase and avatar save commands. Actions stay closed until
 * the inventory snapshot is verified and the device is online.
 */
export function useShopPurchaseActions(input: {
  navigation: NativeStackNavigationProp<RootStackParamList, "CosmeticShop">
  sessionActor: SessionActor
  inventoryStore: InventoryStoreView
  avatarV2: ReturnType<typeof useAvatarV2>
  avatarProducts: ShopCatalogItem[]
  copy: ShopCopy
  locale: AppLocale
  combinationStateRef: RefObject<ShopCombinationState>
  setCombinationState: Dispatch<SetStateAction<ShopCombinationState>>
  dispatchCombination: (
    action: ShopCombinationAction,
    baseState?: ShopCombinationState
  ) => readonly ShopCombinationCommand[]
  inventoryVerified: boolean
  isActionAvailable: boolean
  canPerformShopActions: boolean
  shopMode: ShopMode
  multiItemApplyEnabled: boolean
  selectedProduct: ShopCatalogItem | undefined
}) {
  const {
    navigation,
    sessionActor,
    inventoryStore,
    avatarV2,
    avatarProducts,
    copy,
    locale,
    combinationStateRef,
    setCombinationState,
    dispatchCombination,
    inventoryVerified,
    isActionAvailable,
    canPerformShopActions,
    shopMode,
    multiItemApplyEnabled,
    selectedProduct
  } = input
  // Both are the provider's stable useCallback arrows, so calling them
  // unbound is identical to calling them through avatarV2.
  const { saveAvatar, equipAndSaveItem } = avatarV2
  const [isPurchasing, setIsPurchasing] = useState(false)
  const combinationBalanceRef = useRef(inventoryStore.inventory.coins)

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
    const result = await saveAvatar(avatarToSave)
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
  }, [
    avatarProducts,
    avatarV2.avatar,
    saveAvatar,
    dispatchCombination,
    copy.combination,
    inventoryStore,
    locale,
    sessionActor.session
  ])

  const handleApplyCombination = useCallback(async (): Promise<void> => {
    if (combinationStateRef.current.phase !== "editing") return
    if (!inventoryVerified) {
      hapticError()
      showToast({
        title: copy.loading.title,
        body: copy.loading.body,
        type: "warning"
      })
      return
    }
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
  }, [
    avatarV2.avatar,
    combinationStateRef,
    copy.offline.actionUnavailable,
    copy.offline.title,
    copy.combination.alreadyApplied,
    copy.loading.body,
    copy.loading.title,
    dispatchCombination,
    executeCombinationCommands,
    inventoryStore.inventory,
    inventoryVerified,
    isActionAvailable
  ])

  const handlePrimaryAction = useCallback(async (): Promise<void> => {
    if (!canPerformShopActions) {
      hapticError()
      showToast({
        title: inventoryVerified ? copy.offline.title : copy.loading.title,
        body: inventoryVerified ? copy.offline.actionUnavailable : copy.loading.body,
        type: "warning"
      })
      return
    }
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
        const result = await equipAndSaveItem(item)
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
        previewDraft: combinationStateRef.current.draft,
        ownedProductIds: inventoryStore.inventory.ownedAvatarItemIds,
        avatarRevision: combinationStateRef.current.avatarRevision
      })
      combinationStateRef.current = rebasedState
      setCombinationState(rebasedState)
    }
  }, [
    equipAndSaveItem,
    avatarV2.avatar,
    avatarV2.catalog,
    combinationStateRef,
    copy.offline.title,
    copy.offline.actionUnavailable,
    copy.loading.body,
    copy.loading.title,
    inventoryStore,
    inventoryVerified,
    canPerformShopActions,
    isActionAvailable,
    isPurchasing,
    handleApplyCombination,
    multiItemApplyEnabled,
    navigation,
    selectedProduct,
    sessionActor,
    setCombinationState,
    shopMode
  ])

  return { isPurchasing, handlePrimaryAction }
}
