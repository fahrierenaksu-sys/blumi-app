import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react"
import { AccessibilityInfo } from "react-native"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import { hapticError, hapticLight, hapticSuccess } from "../../../ui/haptics"
import { showToast } from "../../../ui/toast"
import { loadoutToUserAvatar } from "../../avatarV2/avatarSelectionModel"
import type { useAvatarV2 } from "../../avatarV2/state/AvatarV2Provider"
import type { InventoryStoreView } from "../../inventory/inventoryStore"
import type { SessionActor } from "../../session/sessionModel"
import { avatarToShopCombinationDraft, shopCombinationDraftToAvatar } from "../shopAvatarDraft"
import type { ShopCatalogItem } from "../shopCatalog"
import {
  createShopCheckout,
  isShopCheckoutDismissible,
  reduceShopCheckout,
  type ShopCheckout,
  type ShopCheckoutEvent
} from "../shopCheckoutModel"
import type {
  ShopCombinationAction,
  ShopCombinationCommand,
  ShopCombinationState
} from "../shopCombinationState"
import type { ShopCopy } from "../shopCopy"
import { resolveQueuedAvatarProduct } from "../shopQueueProductPolicy"

/** How long the "applied" tick stays before the sheet closes itself. */
const APPLIED_CLOSE_DELAY_MS = 900

/**
 * SHOP-1: "Buy the look" as one checkout sheet. The combination state machine
 * asks once for the whole queue; after one approval each item is purchased
 * through the inventory store (the server in production) in order, and each
 * line ticks only after that server confirmation. The first failure stops
 * the queue: earlier items stay bought, later ones are not charged, and the
 * avatar is not saved. One hapticSuccess when the look is applied.
 */
export function useShopLookCheckout(input: {
  sessionActor: SessionActor
  inventoryStore: InventoryStoreView
  avatarV2: ReturnType<typeof useAvatarV2>
  avatarProducts: ShopCatalogItem[]
  copy: ShopCopy
  combinationStateRef: RefObject<ShopCombinationState>
  dispatchCombination: (
    action: ShopCombinationAction,
    baseState?: ShopCombinationState
  ) => readonly ShopCombinationCommand[]
  setIsPurchasing: Dispatch<SetStateAction<boolean>>
}) {
  const {
    sessionActor,
    inventoryStore,
    avatarV2,
    avatarProducts,
    copy,
    combinationStateRef,
    dispatchCombination,
    setIsPurchasing
  } = input
  const { saveAvatar } = avatarV2
  const [checkout, setCheckout] = useState<ShopCheckout | null>(null)
  const checkoutRef = useRef<ShopCheckout | null>(null)
  const updateCheckout = useCallback((event: ShopCheckoutEvent): void => {
    if (!checkoutRef.current) return
    const next = reduceShopCheckout(checkoutRef.current, event)
    checkoutRef.current = next
    setCheckout(next)
  }, [])
  const replaceCheckout = useCallback((next: ShopCheckout | null): void => {
    checkoutRef.current = next
    setCheckout(next)
  }, [])

  const execute = useCallback(async function run(
    commands: readonly ShopCombinationCommand[]
  ): Promise<void> {
    const command = commands[0]
    if (!command) return

    if (command.type === "request_checkout_confirmation") {
      replaceCheckout(createShopCheckout({ items: command.items, products: avatarProducts }))
      return
    }

    if (command.type === "purchase_product") {
      updateCheckout({ type: "purchase_started", productId: command.productId })
      const resolution = resolveQueuedAvatarProduct(command.productId, avatarProducts)
      const product = resolution.kind === "visible" ? resolution.product : null
      if (!product || product.priceCoins === null) {
        stopCheckout(command.productId, product ? "invalid_price" : "invalid_item")
        return
      }
      setIsPurchasing(true)
      const result = sessionActor.session.mode === "production"
        ? await inventoryStore.purchaseAvatarItem(sessionActor.session.sessionToken, command.productId)
        : inventoryStore.unlockAvatarItem(command.productId, product.priceCoins)
      setIsPurchasing(false)
      if (!result.success && result.reason !== "already_owned") {
        captureProductEvent("purchase_failed", { item_type: "avatar", reason: result.reason })
        stopCheckout(command.productId, result.reason ?? "server_error")
        return
      }
      if (result.success) {
        captureProductEvent("purchase_completed", { item_type: "avatar", price_coins: product.priceCoins })
      }
      updateCheckout({ type: "purchase_succeeded", productId: command.productId })
      await run(dispatchCombination({ type: "purchase_succeeded", productId: command.productId }))
      return
    }

    // An owned-only look saves without a checkout and reports with a toast.
    const hasCheckout = checkoutRef.current !== null
    updateCheckout({ type: "applying" })
    const result = await saveAvatar(shopCombinationDraftToAvatar(command.combination, avatarV2.avatar))
    if (!result.ok) {
      if (result.reason === "conflict" && result.currentSelection) {
        dispatchCombination({ type: "avatar_save_revision_conflict" })
        dispatchCombination({
          type: "refresh_after_conflict",
          equipped: avatarToShopCombinationDraft(loadoutToUserAvatar(result.currentSelection.loadout)),
          ownedProductIds: inventoryStore.inventory.ownedAvatarItemIds,
          avatarRevision: result.currentSelection.revision
        })
      } else {
        dispatchCombination({ type: "avatar_save_failed", reason: result.errorMessage })
      }
      hapticError()
      if (!hasCheckout) {
        showToast({ title: result.errorMessage, type: "warning" })
        return
      }
      updateCheckout({ type: "apply_failed" })
      AccessibilityInfo.announceForAccessibility(copy.checkout.applyFailed)
      return
    }
    dispatchCombination({
      type: "avatar_save_confirmed",
      avatarRevision: result.selection?.revision ?? command.avatarRevision
    })
    hapticSuccess()
    if (!hasCheckout) {
      showToast({ title: copy.combination.appliedTitle, body: copy.combination.appliedBody, type: "success" })
      return
    }
    updateCheckout({ type: "applied" })
    AccessibilityInfo.announceForAccessibility(copy.checkout.applied)

    function stopCheckout(productId: string, reason: string): void {
      dispatchCombination({ type: "purchase_failed", productId, reason })
      updateCheckout({ type: "purchase_failed", productId, reason })
      hapticError()
      AccessibilityInfo.announceForAccessibility(copy.combination.purchaseFailure(reason))
    }
  }, [
    avatarProducts,
    avatarV2.avatar,
    copy,
    dispatchCombination,
    inventoryStore,
    replaceCheckout,
    saveAvatar,
    sessionActor.session,
    setIsPurchasing,
    updateCheckout
  ])

  /** Starts a checkout from an `apply` transition's commands. */
  const startCheckout = useCallback(async (
    commands: readonly ShopCombinationCommand[]
  ): Promise<void> => {
    await execute(commands)
  }, [execute])

  const confirmCheckout = useCallback(async (): Promise<void> => {
    const current = checkoutRef.current
    if (!current || current.phase !== "review") return
    hapticLight()
    const commands = dispatchCombination({ type: "checkout_approved", productIds: current.productIds })
    if (commands.length === 0) {
      // The queue changed under the sheet (should not happen): close safely.
      replaceCheckout(null)
      return
    }
    updateCheckout({ type: "confirm" })
    await execute(commands)
  }, [dispatchCombination, execute, replaceCheckout, updateCheckout])

  const closeCheckout = useCallback((): void => {
    const current = checkoutRef.current
    if (!isShopCheckoutDismissible(current)) return
    if (current?.phase === "review" && combinationStateRef.current.phase === "confirming") {
      dispatchCombination({ type: "cancel_apply" })
    }
    if (current?.phase === "applied") {
      showToast({ title: copy.combination.appliedTitle, body: copy.combination.appliedBody, type: "success" })
    }
    replaceCheckout(null)
  }, [combinationStateRef, copy.combination, dispatchCombination, replaceCheckout])

  // The applied tick is shown briefly, then the sheet closes itself.
  const phase = checkout?.phase
  useEffect(() => {
    if (phase !== "applied") return
    const timer = setTimeout(closeCheckout, APPLIED_CLOSE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [closeCheckout, phase])

  return { checkout, startCheckout, confirmCheckout, closeCheckout }
}
