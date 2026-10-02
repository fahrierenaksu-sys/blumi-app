import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useState
} from "react"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import type { RootStackParamList } from "../../../navigation/RootNavigator"
import { hapticError, hapticSuccess } from "../../../ui/haptics"
import { showToast } from "../../../ui/toast"
import type { useAvatarV2 } from "../../avatarV2/state/AvatarV2Provider"
import type { InventoryStoreView } from "../../inventory/inventoryStore"
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
import { useShopLookCheckout } from "./useShopLookCheckout"

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
  /** After a server-confirmed unlock: the purchase flight (owns the success haptic). */
  celebrateAvatarUnlock?: (product: ShopCatalogItem) => void
}) {
  const {
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
    selectedProduct,
    celebrateAvatarUnlock
  } = input
  // Both are the provider's stable useCallback arrows, so calling them
  // unbound is identical to calling them through avatarV2.
  const { equipAndSaveItem } = avatarV2
  const [isPurchasing, setIsPurchasing] = useState(false)

  const { checkout, startCheckout, confirmCheckout, closeCheckout } = useShopLookCheckout({
    sessionActor,
    inventoryStore,
    avatarV2,
    avatarProducts,
    copy,
    combinationStateRef,
    dispatchCombination,
    setIsPurchasing
  })

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
    const synchronizedState: ShopCombinationState = {
      ...combinationStateRef.current,
      ownedProductIds: [
        ...new Set([
          ...combinationStateRef.current.ownedProductIds,
          ...inventoryStore.inventory.ownedAvatarItemIds
        ])
      ]
    }
    await startCheckout(dispatchCombination(
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
    startCheckout,
    inventoryStore.inventory,
    inventoryVerified,
    isActionAvailable
  ])

  /** A partial checkout retries the remaining pieces through a fresh checkout. */
  const retryCheckout = useCallback((): void => {
    closeCheckout()
    void handleApplyCombination()
  }, [closeCheckout, handleApplyCombination])

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
      celebrateAvatarUnlock,
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
    celebrateAvatarUnlock,
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

  return {
    isPurchasing,
    handlePrimaryAction,
    checkout,
    confirmCheckout,
    closeCheckout,
    retryCheckout
  }
}
