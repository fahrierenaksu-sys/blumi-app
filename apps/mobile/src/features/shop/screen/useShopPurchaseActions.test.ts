import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"

// The Shop's mutation path stays closed until the server inventory snapshot is
// verified and the device can act: no purchase, equip or look checkout runs,
// and the user gets a warning instead.

type PurchaseActions = { handlePrimaryAction: () => Promise<void> }

function mount(options: {
  inventoryVerified: boolean
  canPerformShopActions: boolean
  isActionAvailable?: boolean
  shopMode?: "avatar" | "home"
  multiItemApplyEnabled?: boolean
}) {
  const runtime = createFakeReactRuntime()
  const calls: string[] = []
  const toasts: { type?: string }[] = []
  const copy = {
    loading: { title: "loading", body: "loading" },
    offline: { title: "offline", actionUnavailable: "offline" },
    combination: { alreadyApplied: "applied" }
  }
  const { useShopPurchaseActions } = loadSourceWithFakeReact<{
    useShopPurchaseActions: (input: Record<string, unknown>) => PurchaseActions
  }>("features/shop/screen/useShopPurchaseActions.ts", runtime, {
    modules: {
      "../../../analytics/productAnalytics": { captureProductEvent: () => undefined },
      "../../../ui/haptics": { hapticError: () => undefined, hapticSuccess: () => undefined },
      "../../../ui/toast": { showToast: (toast: { type?: string }) => { toasts.push(toast) } },
      "../shopAvatarDraft": {
        avatarToShopCombinationDraft: () => ({}),
        hasAvatarDraftChanges: () => true,
        previewAvatarShopItem: () => ({}),
        shopCombinationDraftToAvatar: () => ({})
      },
      "../shopCombinationState": { createShopCombinationState: () => ({ phase: "editing", draft: {} }) },
      "../shopPurchaseCoordinator": {
        runShopPrimaryAction: async () => { calls.push("runShopPrimaryAction") }
      },
      "./useShopLookCheckout": {
        useShopLookCheckout: () => ({
          checkout: null,
          startCheckout: async () => { calls.push("startCheckout") },
          confirmCheckout: () => undefined,
          closeCheckout: () => undefined
        })
      }
    }
  })
  const actions = runtime.render(() => useShopPurchaseActions({
    navigation: { navigate: () => { calls.push("navigate") } },
    sessionActor: {},
    inventoryStore: { inventory: { ownedAvatarItemIds: [] } },
    avatarV2: {
      avatar: {},
      catalog: [],
      equipAndSaveItem: async () => { calls.push("equipAndSaveItem"); return { ok: true } }
    },
    avatarProducts: [],
    copy,
    combinationStateRef: { current: { phase: "editing", draft: {}, ownedProductIds: [] } },
    setCombinationState: () => undefined,
    dispatchCombination: () => { calls.push("dispatchCombination"); return [] },
    inventoryVerified: options.inventoryVerified,
    isActionAvailable: options.isActionAvailable ?? options.canPerformShopActions,
    canPerformShopActions: options.canPerformShopActions,
    shopMode: options.shopMode ?? "home",
    multiItemApplyEnabled: options.multiItemApplyEnabled ?? false,
    selectedProduct: { id: "room:chair", priceCoins: 50 }
  }))
  return { actions, calls, toasts }
}

for (const shopMode of ["home", "avatar"] as const) {
  for (const [label, state] of [
    ["before the inventory snapshot is verified", { inventoryVerified: false, canPerformShopActions: false }],
    ["while verified but offline", { inventoryVerified: true, canPerformShopActions: false }]
  ] as const) {
    test(`${shopMode} Shop makes no purchase, equip or checkout ${label}`, async () => {
      const shop = mount({ ...state, shopMode, multiItemApplyEnabled: shopMode === "avatar" })
      await shop.actions.handlePrimaryAction()
      assert.deepEqual(shop.calls, [])
      assert.deepEqual(shop.toasts.map((toast) => toast.type), ["warning"])
    })
  }
}

test("a verified, connected Shop runs the primary action", async () => {
  const shop = mount({ inventoryVerified: true, canPerformShopActions: true })
  await shop.actions.handlePrimaryAction()
  assert.deepEqual(shop.calls, ["runShopPrimaryAction"])
})

test("a verified, connected avatar Shop starts one look checkout", async () => {
  const shop = mount({
    inventoryVerified: true,
    canPerformShopActions: true,
    shopMode: "avatar",
    multiItemApplyEnabled: true
  })
  await shop.actions.handlePrimaryAction()
  assert.deepEqual(shop.calls, ["dispatchCombination", "startCheckout"])
})
