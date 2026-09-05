import type { AvatarCatalogItem } from "../avatarV2/avatarV2.types"
import type {
  InventoryStoreView,
  InventoryUnlockResult
} from "../inventory/inventoryStore"
import type { SessionActor } from "../session/sessionModel"
import type {
  ProductEventName
} from "../../analytics/productAnalytics"
import type { ProductEventProperties } from "../../analytics/productAnalyticsPolicy"
import type { ShopCatalogItem } from "./shopCatalog"

export interface ShopToast {
  title: string
  body?: string
  type: "info" | "success" | "warning"
}

export type ShopAvatarEquipResult =
  | { ok: true }
  | { ok: false; errorMessage: string }

export type ShopPurchaseEventName = Extract<
  ProductEventName,
  "purchase_completed" | "purchase_failed"
>

export interface ShopPurchaseCoordinatorInput {
  selectedProduct: ShopCatalogItem | undefined
  isPurchasing: boolean
  /** Production offline mode may preview cached catalog data but cannot mutate it. */
  isReadOnly?: boolean
  readOnlyTitle?: string
  readOnlyReason?: string
  inventoryStore: InventoryStoreView
  sessionActor: SessionActor
  equipAndSaveItem: (item: AvatarCatalogItem) => Promise<ShopAvatarEquipResult>
  setIsPurchasing: (value: boolean) => void
  navigateToRoom: (placementItemId: string) => void
  hapticError: () => void
  hapticSuccess: () => void
  showToast: (toast: ShopToast) => void
  captureProductEvent: (
    event: ShopPurchaseEventName,
    properties: ProductEventProperties
  ) => void
}

export async function runShopPrimaryAction(
  input: ShopPurchaseCoordinatorInput
): Promise<void> {
  const { selectedProduct } = input
  if (!selectedProduct || input.isPurchasing) return
  if (input.isReadOnly) {
    input.hapticError()
    input.showToast({
      title: input.readOnlyTitle ?? "Shop is read-only while offline",
      body: input.readOnlyReason ?? "Reconnect to continue.",
      type: "warning"
    })
    return
  }

  if (selectedProduct.actionType === "avatarUnlock") {
    if (selectedProduct.priceCoins === null) {
      input.hapticError()
      input.showToast({
        title: "Preview this style first",
        body: selectedProduct.disabledReason,
        type: "warning"
      })
      return
    }

    const result = await unlockSelectedShopItem(
      input,
      selectedProduct,
      "avatar",
      selectedProduct.priceCoins
    )
    if (!result.success) {
      reportUnlockFailure(input, "avatar", result)
      return
    }

    reportUnlockSuccess(input, "avatar", selectedProduct.priceCoins)
    input.hapticSuccess()
    input.showToast({
      title: `${selectedProduct.title} is yours`,
      body: "Wear it from Avatar Studio whenever you want.",
      type: "success"
    })
    return
  }

  if (selectedProduct.actionType === "avatarEquip") {
    if (!selectedProduct.avatarItem) {
      input.hapticError()
      input.showToast({
        title: "Unlock this look first",
        type: "warning"
      })
      return
    }

    const equipResult = await input.equipAndSaveItem(selectedProduct.avatarItem)
    if (equipResult.ok === false) {
      input.hapticError()
      input.showToast({
        title: equipResult.errorMessage,
        type: "warning"
      })
      return
    }

    input.hapticSuccess()
    input.showToast({
      title: `${selectedProduct.title} equipped`,
      body: "Your saved avatar updates across Blumi.",
      type: "success"
    })
    return
  }

  if (selectedProduct.actionType === "roomUnlock") {
    if (!selectedProduct.roomItem || selectedProduct.priceCoins === null) {
      input.hapticError()
      input.showToast({
        title: "Preview this piece first",
        body: selectedProduct.disabledReason,
        type: "warning"
      })
      return
    }

    const result = await unlockSelectedShopItem(
      input,
      selectedProduct,
      "room",
      selectedProduct.priceCoins
    )
    if (!result.success) {
      reportUnlockFailure(input, "room", result)
      return
    }

    reportUnlockSuccess(input, "room", selectedProduct.priceCoins)
    input.hapticSuccess()
    input.showToast({
      title: `${selectedProduct.title} is yours`,
      body: "Place it from Edit Room, then save your room.",
      type: "success"
    })
    input.navigateToRoom(selectedProduct.sourceItemId)
    return
  }

  if (selectedProduct.actionType === "roomPlace") {
    if (!selectedProduct.roomItem) {
      input.hapticError()
      input.showToast({
        title: "This room piece is not ready yet",
        type: "warning"
      })
      return
    }

    input.hapticSuccess()
    input.showToast({
      title: `${selectedProduct.title} ready to place`,
      body: "Position it from Edit Room, then save your room.",
      type: "success"
    })
    input.navigateToRoom(selectedProduct.sourceItemId)
    return
  }

  if (selectedProduct.actionType === "disabled" && selectedProduct.disabledReason) {
    input.hapticError()
    input.showToast({
      title: selectedProduct.actionLabel,
      body: selectedProduct.disabledReason,
      type: "warning"
    })
  }
}

async function unlockSelectedShopItem(
  input: ShopPurchaseCoordinatorInput,
  product: ShopCatalogItem,
  type: "avatar" | "room",
  priceCoins: number
): Promise<InventoryUnlockResult> {
  input.setIsPurchasing(true)
  return unlockShopItem({
    inventoryStore: input.inventoryStore,
    itemId: product.sourceItemId,
    priceCoins,
    sessionActor: input.sessionActor,
    type
  }).finally(() => input.setIsPurchasing(false))
}

async function unlockShopItem(input: {
  inventoryStore: InventoryStoreView
  itemId: string
  priceCoins: number
  sessionActor: SessionActor
  type: "avatar" | "room"
}): Promise<InventoryUnlockResult> {
  if (input.sessionActor.session.mode === "production") {
    return input.type === "avatar"
      ? input.inventoryStore.purchaseAvatarItem(
        input.sessionActor.session.sessionToken,
        input.itemId
      )
      : input.inventoryStore.purchaseRoomItem(
        input.sessionActor.session.sessionToken,
        input.itemId
      )
  }

  return input.type === "avatar"
    ? input.inventoryStore.unlockAvatarItem(input.itemId, input.priceCoins)
    : input.inventoryStore.unlockRoomItem(input.itemId, input.priceCoins)
}

function reportUnlockFailure(
  input: ShopPurchaseCoordinatorInput,
  itemType: "avatar" | "room",
  result: InventoryUnlockResult
): void {
  input.captureProductEvent("purchase_failed", {
    item_type: itemType,
    reason: result.reason
  })
  input.hapticError()
  input.showToast({
    title: getUnlockFailureTitle(result.reason),
    type: "warning"
  })
}

function reportUnlockSuccess(
  input: ShopPurchaseCoordinatorInput,
  itemType: "avatar" | "room",
  priceCoins: number
): void {
  input.captureProductEvent("purchase_completed", {
    item_type: itemType,
    price_coins: priceCoins
  })
}

export function getUnlockFailureTitle(reason: string | undefined): string {
  if (reason === "already_owned") return "Already yours"
  if (reason === "not_enough_coins") return "Not enough coins"
  if (reason === "invalid_item") return "This piece is not available"
  if (reason === "invalid_price") return "Price needs a refresh"
  if (reason === "server_error") return "Shop is offline right now"
  return "Could not save this piece yet"
}
