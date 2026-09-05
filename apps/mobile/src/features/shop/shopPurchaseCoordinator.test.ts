import assert from "node:assert/strict"
import test from "node:test"
import type { ProductEventProperties } from "../../analytics/productAnalyticsPolicy"
import type { InventoryStoreView } from "../inventory/inventoryStore"
import type { SessionActor } from "../session/sessionModel"
import type { ShopCatalogItem } from "./shopCatalog"
import {
  runShopPrimaryAction,
  type ShopAvatarEquipResult
} from "./shopPurchaseCoordinator"

const createSessionActor = (mode: "demo" | "production"): SessionActor => ({
  session: { mode, sessionToken: "session-token" } as SessionActor["session"],
  profile: {} as SessionActor["profile"]
})

const createProduct = (
  overrides: Partial<ShopCatalogItem> = {}
): ShopCatalogItem => ({
  id: "avatar:avatar_v2_top_cherry_heart_milkmaid_blouse",
  kind: "avatarWearable",
  title: "Cherry blouse",
  description: "A cherry blouse",
  priceCoins: 120,
  owned: false,
  previewType: "avatar",
  actionType: "avatarUnlock",
  sourceItemId: "avatar_v2_top_cherry_heart_milkmaid_blouse",
  sectionId: "avatar",
  eyebrow: "Top",
  stateLabel: "Unlock",
  actionLabel: "Unlock",
  ...overrides
})

const createHarness = (overrides: {
  product?: ShopCatalogItem
  mode?: "demo" | "production"
  isReadOnly?: boolean
  unlockResult?: { success: boolean; reason?: "already_owned" | "not_enough_coins" | "invalid_price" | "invalid_item" | "server_error" }
  equipResult?: ShopAvatarEquipResult
} = {}) => {
  const calls = {
    demoAvatarUnlock: 0,
    productionAvatarPurchase: 0,
    demoRoomUnlock: 0,
    productionRoomPurchase: 0,
    equip: 0,
    purchasingStates: [] as boolean[],
    haptics: [] as string[],
    toasts: [] as { title: string; body?: string; type: "info" | "success" | "warning" }[],
    events: [] as { event: string; properties: ProductEventProperties }[],
    navigations: [] as string[]
  }
  const unlockResult = overrides.unlockResult ?? { success: true }
  const inventoryStore = {
    unlockAvatarItem: () => {
      calls.demoAvatarUnlock += 1
      return unlockResult
    },
    purchaseAvatarItem: async () => {
      calls.productionAvatarPurchase += 1
      return unlockResult
    },
    unlockRoomItem: () => {
      calls.demoRoomUnlock += 1
      return unlockResult
    },
    purchaseRoomItem: async () => {
      calls.productionRoomPurchase += 1
      return unlockResult
    }
  } as unknown as InventoryStoreView

  return {
    calls,
    input: {
      selectedProduct: overrides.product ?? createProduct(),
      isPurchasing: false,
      isReadOnly: overrides.isReadOnly,
      readOnlyTitle: "You’re offline",
      readOnlyReason: "Reconnect to unlock, equip, place, or buy coin packs.",
      inventoryStore,
      sessionActor: createSessionActor(overrides.mode ?? "demo"),
      equipAndSaveItem: async () => {
        calls.equip += 1
        return overrides.equipResult ?? { ok: true }
      },
      setIsPurchasing: (value: boolean) => calls.purchasingStates.push(value),
      navigateToRoom: (itemId: string) => calls.navigations.push(itemId),
      hapticError: () => calls.haptics.push("error"),
      hapticSuccess: () => calls.haptics.push("success"),
      showToast: (toast: (typeof calls.toasts)[number]) => calls.toasts.push(toast),
      captureProductEvent: (event: "purchase_completed" | "purchase_failed", properties: ProductEventProperties) =>
        calls.events.push({ event, properties })
    }
  }
}

test("avatar unlock uses the session-appropriate inventory path and confirms success", async () => {
  const demo = createHarness()
  await runShopPrimaryAction(demo.input)

  assert.equal(demo.calls.demoAvatarUnlock, 1)
  assert.deepEqual(demo.calls.purchasingStates, [true, false])
  assert.deepEqual(demo.calls.events, [
    { event: "purchase_completed", properties: { item_type: "avatar", price_coins: 120 } }
  ])
  assert.equal(demo.calls.toasts[0]?.type, "success")
  assert.deepEqual(demo.calls.haptics, ["success"])
})

test("production room unlock records failure without navigation", async () => {
  const production = createHarness({
    mode: "production",
    product: createProduct({
      id: "room:room_v2_chair_blush",
      kind: "roomItem",
      title: "Blush chair",
      previewType: "room",
      actionType: "roomUnlock",
      sourceItemId: "room_v2_chair_blush",
      sectionId: "room",
      roomItem: { id: "room_v2_chair_blush" } as ShopCatalogItem["roomItem"]
    }),
    unlockResult: { success: false, reason: "not_enough_coins" }
  })

  await runShopPrimaryAction(production.input)

  assert.equal(production.calls.productionRoomPurchase, 1)
  assert.deepEqual(production.calls.navigations, [])
  assert.deepEqual(production.calls.events, [
    { event: "purchase_failed", properties: { item_type: "room", reason: "not_enough_coins" } }
  ])
  assert.equal(production.calls.toasts[0]?.title, "Not enough coins")
  assert.deepEqual(production.calls.haptics, ["error"])
})

test("avatar equip and room placement keep their distinct non-purchase actions", async () => {
  const equip = createHarness({
    product: createProduct({
      owned: true,
      actionType: "avatarEquip",
      avatarItem: { id: "avatar_v2_top_cherry_heart_milkmaid_blouse" } as ShopCatalogItem["avatarItem"]
    })
  })
  await runShopPrimaryAction(equip.input)
  assert.equal(equip.calls.equip, 1)
  assert.deepEqual(equip.calls.events, [])
  assert.equal(equip.calls.toasts[0]?.title, "Cherry blouse equipped")

  const place = createHarness({
    product: createProduct({
      id: "room:room_v2_chair_blush",
      kind: "roomItem",
      title: "Blush chair",
      previewType: "room",
      actionType: "roomPlace",
      sourceItemId: "room_v2_chair_blush",
      sectionId: "room",
      roomItem: { id: "room_v2_chair_blush" } as ShopCatalogItem["roomItem"]
    })
  })
  await runShopPrimaryAction(place.input)
  assert.deepEqual(place.calls.navigations, ["room_v2_chair_blush"])
  assert.equal(place.calls.toasts[0]?.title, "Blush chair ready to place")
})

test("offline read-only Shop never purchases, equips, or places remote state", async () => {
  const harness = createHarness({ mode: "production", isReadOnly: true })

  await runShopPrimaryAction(harness.input)

  assert.equal(harness.calls.productionAvatarPurchase, 0)
  assert.equal(harness.calls.equip, 0)
  assert.deepEqual(harness.calls.navigations, [])
  assert.deepEqual(harness.calls.events, [])
  assert.deepEqual(harness.calls.haptics, ["error"])
  assert.deepEqual(harness.calls.toasts, [{
    title: "You’re offline",
    body: "Reconnect to unlock, equip, place, or buy coin packs.",
    type: "warning"
  }])
})
