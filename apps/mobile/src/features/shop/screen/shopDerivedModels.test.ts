import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { BlumiInventorySnapshot } from "../../inventory/inventoryModel"
import type { UserRoomDecor } from "../../roomV2/roomV2.types"
import type { useShopCatalogProducts } from "./useShopCatalogProducts"
import type { useShopPreviewModel } from "./useShopPreviewModel"
import type { useShopOwnedAvatarItemIds } from "./useShopOwnedAvatarItemIds"
import type { useRetainedShopPreviewDrawing } from "./shopRetainedPreviewModel"
import type { ShopPreviewPanel } from "../ShopPreviewPanel"
import type { ShopModeDock, ShopMode } from "../ShopNavigationControls"
import type * as CardSelectionModule from "./ShopCardSelection"
import type * as MotionModule from "../../../ui/motion"
import { getShopLayoutMetrics } from "../shopLayoutMetrics"
import { avatarToShopCombinationDraft } from "../shopAvatarDraft"
import { buildPurchaseQueue, createShopCombinationState } from "../shopCombinationState"
import { createRoomPreviewDecor } from "./shopScreenModel"

require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]

// Exercise the shipped catalog/builders. Only React scheduling and native
// image loading are substituted; ownership, prices and scene geometry are real.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro assets use the test loaders above.
const { DEFAULT_AVATAR_V2 } = require("../../avatarV2/avatarV2Catalog") as typeof import("../../avatarV2/avatarV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro assets use the test loaders above.
const { DEFAULT_ROOM_V2_SHELL_ID, ROOM_V2_SHELL_CATALOG, ROOM_V2_FURNITURE_CATALOG } = require("../../roomV2/roomV2Catalog") as typeof import("../../roomV2/roomV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro assets use the test loaders above.
const avatarProductOrder = require("./shopAvatarProductOrder") as typeof import("./shopAvatarProductOrder")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro assets use the test loaders above.
const roomSelectors = require("../../roomV2/roomV2Selectors") as typeof import("../../roomV2/roomV2Selectors")

test("copied ownership arrays stay stable while authoritative membership changes refresh immediately", () => {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<{ useShopOwnedAvatarItemIds: typeof useShopOwnedAvatarItemIds }>(
    "features/shop/screen/useShopOwnedAvatarItemIds.ts", runtime
  ).useShopOwnedAvatarItemIds
  let source = ["first-piece"]
  const first = runtime.render(() => hook(source))
  assert.deepEqual([...first], source)
  source = [...source]
  assert.equal(runtime.rerender(), first)
  source = ["first-piece", "new-piece"]
  const unlocked = runtime.rerender() as readonly string[]
  assert.notEqual(unlocked, first)
  assert.deepEqual([...unlocked], source)
  // An account switch/reconciliation must not retain the prior membership.
  source = []
  const cleared = runtime.rerender() as readonly string[]
  assert.notEqual(cleared, unlocked)
  assert.deepEqual([...cleared], [])
})

function mountCatalog() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<{ useShopCatalogProducts: typeof useShopCatalogProducts }>(
    "features/shop/screen/useShopCatalogProducts.ts", runtime,
    {
      // Supply the native locale, retaining the real sort and presentation rules.
      modules: { "./shopAvatarProductOrder": {
        ...avatarProductOrder,
        sortAvatarShopProducts: (products: Parameters<typeof avatarProductOrder.sortAvatarShopProducts>[0]) =>
          avatarProductOrder.sortAvatarShopProducts(products, "tr")
      } },
      real: ["@blumi/domain", "../shopCatalog", "./shopScreenModel"]
    }
  ).useShopCatalogProducts
  const inventory: BlumiInventorySnapshot = {
    coins: 1000, ownedAvatarItemIds: [], ownedRoomItemIds: [],
    unlockedFeatureIds: [], updatedAt: "2026-10-03T00:00:00Z"
  }
  let input: Parameters<typeof useShopCatalogProducts>[0] = {
    enforcePublishedCatalog: true, inventory, avatar: DEFAULT_AVATAR_V2,
    roomDecor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [] },
    roomFurnitureCatalog: undefined, qaOnlyOwnedRoomItemIds: undefined,
    semanticOutfitMerchandisingEnabled: true, shopMode: "avatar",
    selectedCategoryId: "tops", locale: "tr"
  }
  const first = runtime.render(() => hook(input))
  return {
    first,
    get input() { return input },
    update(next: Partial<typeof input>) {
      input = { ...input, ...next }
      return runtime.rerender() as ReturnType<typeof useShopCatalogProducts>
    }
  }
}

test("balance and timestamp updates keep both shelves and categories stable", () => {
  const shop = mountCatalog()
  const next = shop.update({ inventory: {
    ...shop.input.inventory, coins: 5000, updatedAt: "2026-10-03T00:01:00Z",
    ownedAvatarItemIds: [...shop.input.inventory.ownedAvatarItemIds],
    ownedRoomItemIds: [...shop.input.inventory.ownedRoomItemIds]
  } })
  assert.equal(next.avatarProducts, shop.first.avatarProducts)
  assert.equal(next.roomProducts, shop.first.roomProducts)
  assert.equal(next.categoryOptions, shop.first.categoryOptions)
  assert.equal(next.filteredProducts, shop.first.filteredProducts)
})

test("room placement updates the room action while preserving the avatar shelf", () => {
  const shop = mountCatalog()
  const room = shop.first.roomProducts.find((product) => !product.owned)
  assert.ok(room?.roomItem)
  const owned = shop.update({ inventory: {
    ...shop.input.inventory, ownedRoomItemIds: [room.sourceItemId],
    ownedAvatarItemIds: [...shop.input.inventory.ownedAvatarItemIds]
  } })
  assert.equal(owned.avatarProducts, shop.first.avatarProducts)
  assert.equal(owned.roomProducts.find((product) => product.id === room.id)?.actionType, "roomPlace")
  const placed = shop.update({ roomDecor: {
    ...shop.input.roomDecor,
    placedItems: [{
      instanceId: "shop-test-placement", itemId: room.sourceItemId,
      x: 0.5, y: 0.7, rotation: "front"
    }]
  } })
  assert.equal(placed.avatarProducts, shop.first.avatarProducts)
  assert.equal(placed.categoryOptions, shop.first.categoryOptions)
  assert.equal(placed.roomProducts.find((product) => product.id === room.id)?.actionType, "disabled")
  assert.equal(placed.roomProducts.find((product) => product.id === room.id)?.placedCount, 1)
})

test("avatar ownership and saved loadout refresh actions without rebuilding room products", () => {
  const shop = mountCatalog()
  const item = shop.first.avatarProducts.find((product) => product.actionType === "avatarUnlock" && product.avatarItem?.type === "hair")
  assert.ok(item?.avatarItem)
  const owned = shop.update({ inventory: {
    ...shop.input.inventory, ownedAvatarItemIds: [item.sourceItemId],
    ownedRoomItemIds: [...shop.input.inventory.ownedRoomItemIds]
  } })
  const ownedItem = owned.avatarProducts.find((product) => product.id === item.id)
  assert.equal(ownedItem?.owned, true)
  assert.equal(ownedItem?.actionType, "avatarEquip")
  assert.equal(ownedItem?.priceCoins, item.priceCoins)
  assert.equal(owned.roomProducts, shop.first.roomProducts)
  const equipped = shop.update({ avatar: { ...shop.input.avatar, hairId: item.sourceItemId } })
  assert.equal(equipped.avatarProducts.find((product) => product.id === item.id)?.actionType, "disabled")
  assert.equal(equipped.roomProducts, shop.first.roomProducts)
})

function mountPreview(
  initial: Partial<Parameters<typeof useShopPreviewModel>[0]> = {},
  resolveScene: typeof roomSelectors.resolveRoomV2Scene = roomSelectors.resolveRoomV2Scene
) {
  const catalog = mountCatalog().first
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<{ useShopPreviewModel: typeof useShopPreviewModel }>(
    "features/shop/screen/useShopPreviewModel.ts", runtime, {
      modules: {
        "../../../ui/animations": { useSelectionTransition: () => ({}) },
        "../../roomV2/roomV2Selectors": { resolveRoomV2Scene: resolveScene }
      },
      real: ["../../roomV2/roomV2Catalog", "../shopAvatarDraft", "../shopCombinationSummary", "../shopSelectionModel", "./shopScreenModel"]
    }
  ).useShopPreviewModel
  const equipped = avatarToShopCombinationDraft(DEFAULT_AVATAR_V2)
  const ownedAvatarItemIds = buildPurchaseQueue(equipped, []).map((entry) => entry.productId)
  let input: Parameters<typeof useShopPreviewModel>[0] = {
    shopMode: "avatar", showShopContent: true, selectedId: "", filteredProducts: catalog.filteredProducts,
    activeProducts: catalog.avatarProducts, avatarProducts: catalog.avatarProducts,
    inventoryVerified: true, inventoryGateLabel: "pending",
    combinationState: createShopCombinationState({
      equipped, ownedProductIds: ownedAvatarItemIds, avatarRevision: 0
    }),
    previewSelectionOrder: [], avatar: DEFAULT_AVATAR_V2, ownedAvatarItemIds,
    roomDecor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [] },
    roomFurnitureCatalog: undefined,
    ...initial
  }
  const first = runtime.render(() => hook(input))
  return {
    first, catalog,
    get input() { return input },
    update(next: Partial<typeof input>) {
      input = { ...input, ...next }
      return runtime.rerender() as ReturnType<typeof useShopPreviewModel>
    }
  }
}

test("avatar focus and inventory notices preserve unrelated room scene and combination rows", () => {
  const shop = mountPreview()
  const [first, second] = shop.catalog.avatarProducts
  assert.ok(first && second)
  for (const selectedId of [first.id, second.id]) {
    const next = shop.update({ selectedId, inventoryGateLabel: "updated" })
    assert.equal(next.selectedProduct?.id, selectedId)
    assert.equal(next.roomPreviewScene, shop.first.roomPreviewScene)
    assert.equal(next.combinationItems, shop.first.combinationItems)
    assert.equal(next.previewAvatar, shop.first.previewAvatar)
  }
})

test("ownership changes update combination cost and rows while preserving room geometry", () => {
  const shop = mountPreview()
  const item = shop.catalog.avatarProducts.find((product) => product.actionType === "avatarUnlock" && product.avatarItem?.type === "hair")
  assert.ok(item)
  const draft = { ...shop.input.combinationState.draft, hair: item.sourceItemId }
  const preview = shop.update({ combinationState: { ...shop.input.combinationState, draft } })
  assert.equal(preview.combinationSummary.total, item.priceCoins)
  assert.equal(preview.combinationItems.find((row) => row.id === item.sourceItemId)?.owned, false)
  const owned = shop.update({ ownedAvatarItemIds: [...shop.input.ownedAvatarItemIds, item.sourceItemId] })
  assert.equal(owned.combinationSummary.total, 0)
  assert.equal(owned.combinationItems.find((row) => row.id === item.sourceItemId)?.owned, true)
  assert.equal(owned.roomPreviewScene, shop.first.roomPreviewScene)
})

test("room product metadata retains geometry, but a new selection or saved decor refreshes it", () => {
  const shop = mountPreview()
  const [first, second] = shop.catalog.roomProducts
  assert.ok(first?.roomItem && second?.roomItem)
  const room = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts, selectedId: first.id })
  assert.notEqual(room.roomPreviewScene, shop.first.roomPreviewScene)
  const updatedProducts = shop.catalog.roomProducts.map((product) => product.id === first.id
    ? { ...product, owned: true, actionType: "roomPlace" as const } : product)
  const ownership = shop.update({ activeProducts: updatedProducts })
  assert.equal(ownership.roomPreviewScene, room.roomPreviewScene)
  assert.equal(ownership.presentationProduct?.owned, true)
  const selected = shop.update({ selectedId: second.id })
  assert.notEqual(selected.roomPreviewScene, room.roomPreviewScene)
  const decor: UserRoomDecor = { ...shop.input.roomDecor, placedItems: [] }
  const saved = shop.update({ roomDecor: decor })
  assert.notEqual(saved.roomPreviewScene, selected.roomPreviewScene)
})

test("avatar and hidden Shop content never resolve an invisible room scene", () => {
  const shop = mountPreview({}, () => { throw new Error("Invisible room scene resolved") })
  assert.equal(shop.first.roomPreviewScene, null)
  const decor = shop.update({ roomDecor: { ...shop.input.roomDecor, placedItems: [] } })
  assert.equal(decor.roomPreviewScene, null)
  const hidden = shop.update({ shopMode: "home", showShopContent: false, activeProducts: shop.catalog.roomProducts })
  assert.equal(hidden.roomPreviewScene, null)
  const loading = shop.update({ inventoryVerified: false })
  assert.equal(loading.roomPreviewScene, null)
})

test("visible home previews keep canonical saved geometry even while inventory is loading or offline", () => {
  const shop = mountPreview({ shopMode: "home", inventoryVerified: false })
  assert.ok(shop.first.roomPreviewScene)
  const expected = roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: shop.input.roomDecor,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })
  assert.deepEqual(shop.first.roomPreviewScene, expected)
  const offline = shop.update({ inventoryGateLabel: "offline" })
  assert.equal(offline.roomPreviewScene, shop.first.roomPreviewScene)
})

test("home mode resumes the latest saved room and selected preview without changing persisted decor", () => {
  const shop = mountPreview()
  const product = shop.catalog.roomProducts.find((entry) => entry.roomItem)
  assert.ok(product?.roomItem)
  const decor: UserRoomDecor = {
    roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
    placedItems: [{ instanceId: "saved-shop-piece", itemId: product.sourceItemId, x: 0.55, y: 0.71, rotation: "front" }]
  }
  const original = structuredClone(decor)
  const avatar = shop.update({ roomDecor: decor })
  assert.equal(avatar.roomPreviewScene, null)
  const home = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts })
  assert.deepEqual(home.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor, defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  const selected = shop.update({ selectedId: product.id })
  assert.deepEqual(selected.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: createRoomPreviewDecor(product.roomItem, decor, DEFAULT_ROOM_V2_SHELL_ID),
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  assert.deepEqual(decor, original)
  assert.equal(shop.update({ shopMode: "avatar", activeProducts: shop.catalog.avatarProducts }).roomPreviewScene, null)
  const moved: UserRoomDecor = { ...decor, placedItems: decor.placedItems.map((item) => ({ ...item, x: 0.62 })) }
  assert.equal(shop.update({ roomDecor: moved }).roomPreviewScene, null)
  const resumed = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts, selectedId: "" })
  assert.deepEqual(resumed.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: moved, defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  assert.deepEqual(decor, original)
})

test("drawing retention is lazy, ignores hidden updates, and returns current visible input immediately", () => {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<{ useRetainedShopPreviewDrawing: typeof useRetainedShopPreviewDrawing }>(
    "features/shop/screen/shopRetainedPreviewModel.ts", runtime
  ).useRetainedShopPreviewDrawing
  const first = { avatar: DEFAULT_AVATAR_V2, avatarWidth: 120 }
  let active = false
  let drawing: typeof first | null = first
  assert.equal(runtime.render(() => hook(active, drawing)), null)
  active = true
  assert.equal(runtime.rerender(), first)
  active = false
  drawing = { avatar: { ...DEFAULT_AVATAR_V2 }, avatarWidth: 160 }
  assert.equal(runtime.rerender(), first)
  active = true
  assert.equal(runtime.rerender(), drawing)
  // A visible missing scene must remove the old drawing instead of showing it.
  drawing = null
  assert.equal(runtime.rerender(), null)
  active = false
  assert.equal(runtime.rerender(), null)
})

type PreviewElement = {
  type: unknown
  key?: string
  props: Record<string, unknown> & { children?: PreviewElement | PreviewElement[] }
}

function findPreviewElement(tree: unknown, predicate: (node: PreviewElement) => boolean): PreviewElement | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findPreviewElement(child, predicate)
      if (found) return found
    }
  } else if (tree && typeof tree === "object" && "props" in tree) {
    const node = tree as PreviewElement
    if (predicate(node)) return node
    return findPreviewElement(node.props.children, predicate)
  }
  return undefined
}

function mountPreviewPanel() {
  const runtime = createFakeReactRuntime()
  const native = createReactNativeStub()
  const retention = loadSourceWithFakeReact(
    "features/shop/screen/shopRetainedPreviewModel.ts", runtime
  )
  const styles = loadSourceWithFakeReact("features/shop/shopPreviewStyles.ts", runtime, {
    modules: { "react-native": native.module }, real: ["../../ui/theme"]
  })
  const panel = loadSourceWithFakeReact<{ ShopPreviewPanel: typeof ShopPreviewPanel }>(
    "features/shop/ShopPreviewPanel.tsx", runtime, {
      modules: {
        "react-native": native.module,
        "./screen/shopRetainedPreviewModel": retention,
        "./shopPreviewStyles": styles
      },
      real: ["./shopLayoutMetrics", "./shopCopy", "./shopProductPresentation", "./shopFormatters", "./shopCombinationViewport", "../../ui/theme"],
      inertUnknown: true
    }
  ).ShopPreviewPanel
  let input: Parameters<typeof ShopPreviewPanel>[0] = {
    mode: "avatar", product: undefined, previewAvatar: DEFAULT_AVATAR_V2,
    roomPreviewScene: null, locale: "tr", isPurchasing: false, isActionAvailable: true,
    layoutMetrics: getShopLayoutMetrics({ width: 390, height: 844, fontScale: 1 }),
    onPrimaryAction: () => undefined
  }
  const first = runtime.render(() => panel(input))
  return {
    first,
    get input() { return input },
    update(next: Partial<typeof input>) {
      input = { ...input, ...next }
      return runtime.rerender()
    }
  }
}

test("retained avatar drawing releases hidden flight targets and keeps checkout bound to the current selection", () => {
  const shop = mountPreviewPanel()
  const catalog = mountCatalog().first
  const product = catalog.avatarProducts.find((entry) => entry.actionType === "avatarUnlock")
  assert.ok(product)
  const flights = ["shop-preview-flight"]
  const selected = shop.update({ product, purchaseLandingFlightIds: flights })
  const slot = findPreviewElement(selected, (node) => node.key === "avatar-drawing")
  assert.ok(slot)
  const live = slot.props.children as PreviewElement
  assert.equal(live.props.landingFlightIds, flights)

  const freshAvatar = { ...DEFAULT_AVATAR_V2 }
  const hidden = shop.update({ mode: "home", product: undefined, previewAvatar: freshAvatar })
  const hiddenSlot = findPreviewElement(hidden, (node) => node.key === "avatar-drawing")
  assert.ok(hiddenSlot)
  assert.equal(hiddenSlot.props.pointerEvents, "none")
  assert.equal(hiddenSlot.props.accessibilityElementsHidden, true)
  assert.equal(hiddenSlot.props.importantForAccessibility, "no-hide-descendants")
  assert.equal((hiddenSlot.props.children as PreviewElement).props.avatar, DEFAULT_AVATAR_V2)
  assert.equal((hiddenSlot.props.children as PreviewElement).props.landingFlightIds, undefined)
  assert.equal(findPreviewElement(hidden, (node) => node.props.testID === "shop-preview-primary-action"), undefined)

  let called = false
  const nextProduct = { ...product, owned: true, actionType: "avatarEquip" as const }
  const resumed = shop.update({
    mode: "avatar", product: nextProduct, purchaseLandingFlightIds: [],
    onPrimaryAction: () => { called = true }
  })
  const resumedSlot = findPreviewElement(resumed, (node) => node.key === "avatar-drawing")
  assert.ok(resumedSlot)
  assert.equal(resumedSlot.props.pointerEvents, "auto")
  assert.equal((resumedSlot.props.children as PreviewElement).props.avatar, freshAvatar)
  const action = findPreviewElement(resumed, (node) => node.props.testID === "shop-preview-primary-action")
  assert.ok(action)
  assert.equal(action.props.disabled, false)
  ;(action.props.onPress as () => void)()
  assert.equal(called, true)
  const unavailable = shop.update({ isActionAvailable: false })
  assert.equal(findPreviewElement(unavailable, (node) => node.props.testID === "shop-preview-primary-action")?.props.disabled, true)
})

test("retained room drawing resumes current canonical decor and clears an unavailable active scene", () => {
  const shop = mountPreviewPanel()
  assert.equal(findPreviewElement(shop.first, (node) => node.key === "room-drawing"), undefined)
  const model = mountPreview({ shopMode: "home" })
  const firstScene = model.first.roomPreviewScene
  assert.ok(firstScene)
  const home = shop.update({ mode: "home", roomPreviewScene: firstScene })
  assert.equal((findPreviewElement(home, (node) => node.key === "room-drawing")?.props.children as PreviewElement).props.scene, firstScene)
  const hidden = shop.update({ mode: "avatar", roomPreviewScene: null })
  const hiddenRoom = findPreviewElement(hidden, (node) => node.key === "room-drawing")
  assert.ok(hiddenRoom)
  assert.equal(hiddenRoom.props.pointerEvents, "none")
  assert.equal((hiddenRoom.props.children as PreviewElement).props.scene, firstScene)

  const product = model.catalog.roomProducts.find((entry) => entry.roomItem)
  assert.ok(product?.roomItem)
  const nextScene = model.update({ roomDecor: {
    ...model.input.roomDecor,
    placedItems: [{ instanceId: "retained-preview-piece", itemId: product.sourceItemId, x: 0.6, y: 0.7, rotation: "front" }]
  } }).roomPreviewScene
  assert.ok(nextScene)
  assert.notEqual(nextScene, firstScene)
  const current = shop.update({ mode: "home", roomPreviewScene: nextScene })
  const currentRoom = findPreviewElement(current, (node) => node.key === "room-drawing")
  assert.equal((currentRoom?.props.children as PreviewElement).props.scene, nextScene)
  assert.equal(currentRoom?.props.accessibilityElementsHidden, false)
  const missing = shop.update({ roomPreviewScene: null })
  assert.equal(findPreviewElement(missing, (node) => node.key === "room-drawing"), undefined)
})

function mountModeDock(initialReduceMotion = false) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const native = createReactNativeStub({ AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(initialReduceMotion),
    addEventListener: () => ({ remove: () => undefined })
  } })
  // Native assignments queue independently of parent JS work. This seam
  // proves ordering, not actual thread timing or FPS.
  let nativePosition = 0
  const nativeQueue: number[] = []
  const events: string[] = []
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  reanimated.module.useSharedValue = function useNativeQueuedSharedValue(initial: number) {
    const ref = useRef<{ value: number } | null>(null)
    if (!ref.current) {
      nativePosition = initial
      ref.current = {
        get value() { return nativePosition },
        set value(next: number) {
          nativeQueue.push(next)
          events.push(`native-queued-${next}`)
        }
      }
    }
    return ref.current
  }
  const motion = loadSourceWithFakeReact<typeof MotionModule>("ui/motion.ts", runtime, {
    modules: { "react-native": native.module, "react-native-reanimated": reanimated.module },
    real: ["./reducedMotionStore", "./motionTokens"]
  })
  let reduceMotion = initialReduceMotion
  const dock = loadSourceWithFakeReact<{ ShopModeDock: typeof ShopModeDock }>(
    "features/shop/ShopNavigationControls.tsx", runtime, {
      modules: {
        "react-native": native.module,
        "react-native-reanimated": reanimated.module,
        "../../ui/motion": { ...motion, useMotion: () => motion.resolveMotion(reduceMotion) }
      },
      real: ["./shopCopy", "../../ui/theme"], inertUnknown: true
    }
  ).ShopModeDock
  let input: Parameters<typeof ShopModeDock>[0] = {
    activeMode: "avatar", width: 350, counts: { avatar: 10, home: 10 }, locale: "tr",
    onSelectMode: (mode) => { events.push(`parent-request-${mode}`) }
  }
  runtime.render(() => dock(input))
  return {
    events, nativeQueue, animations: reanimated.calls,
    get nativePosition() { return nativePosition },
    get tree() { return runtime.output },
    press(mode: ShopMode) {
      const button = findPreviewElement(runtime.output, (node) => node.key === mode)
      assert.ok(button)
      ;(button.props.onPress as () => void)()
    },
    commitMode(mode: ShopMode) {
      input = { ...input, activeMode: mode }
      return runtime.rerender()
    },
    commitCounts() {
      input = { ...input, counts: { avatar: 11, home: 12 } }
      return runtime.rerender()
    },
    setReduceMotion(enabled: boolean) {
      reduceMotion = enabled
      return runtime.rerender()
    },
    flushNative() {
      for (const target of nativeQueue.splice(0)) nativePosition = target
    }
  }
}

test("Shop mode press queues the indicator before parent work and controlled commit does not restart it", () => {
  const dock = mountModeDock()
  const avatarButton = findPreviewElement(dock.tree, (node) => node.key === "avatar")
  assert.deepEqual(avatarButton?.props.accessibilityState, { selected: true })
  // A canceled press has no selection side effect: movement is on onPress only.
  const homeButton = findPreviewElement(dock.tree, (node) => node.key === "home")
  assert.equal(homeButton?.props.onPressIn, undefined)
  assert.deepEqual(dock.events, [])
  dock.press("home")
  assert.deepEqual(dock.events, ["native-queued-1", "parent-request-home"])
  assert.equal(dock.nativePosition, 0, "native application is independent of queueing")
  // The selected text/action truth stays controlled until the parent commits.
  assert.deepEqual(findPreviewElement(dock.tree, (node) => node.key === "avatar")?.props.accessibilityState, { selected: true })
  dock.flushNative()
  assert.equal(dock.nativePosition, 1)
  dock.press("home")
  assert.deepEqual(dock.nativeQueue, [], "repeated taps do not restart the same native destination")
  dock.commitMode("home")
  assert.deepEqual(dock.nativeQueue, [], "the parent effect does not restart an event animation")
  dock.commitCounts()
  assert.deepEqual(dock.nativeQueue, [])
  assert.deepEqual(findPreviewElement(dock.tree, (node) => node.key === "home")?.props.accessibilityState, { selected: true })

  // A route/programmatic change reconciles the pill without a tap callback.
  const eventsBeforeRoute = dock.events.slice()
  dock.commitMode("avatar")
  assert.deepEqual(dock.events, [...eventsBeforeRoute, "native-queued-0"])
  dock.flushNative()
  assert.equal(dock.nativePosition, 0)
  dock.press("home")
  dock.press("avatar")
  assert.equal(dock.nativeQueue.at(-1), 0, "the latest rapid tap supersedes the earlier destination")
  dock.flushNative()
  assert.equal(dock.nativePosition, 0)
  dock.commitMode("avatar")
  assert.deepEqual(dock.nativeQueue, [])
})

test("Shop mode feedback uses real resolved Reduce Motion and resynchronizes when preference changes", () => {
  const dock = mountModeDock()
  dock.press("home")
  assert.equal(dock.animations.at(-1)?.kind, "withSpring")
  dock.flushNative()
  dock.commitMode("home")
  dock.setReduceMotion(true)
  const settled = dock.animations.at(-1)
  assert.equal(settled?.kind, "withTiming")
  assert.equal(settled?.config?.duration, 0)
  dock.flushNative()
  dock.press("avatar")
  const pressed = dock.animations.at(-1)
  assert.equal(pressed?.kind, "withTiming")
  assert.equal(pressed?.config?.duration, 0)
  assert.equal(dock.nativeQueue.at(-1), 0)
  dock.flushNative()
  dock.commitMode("avatar")
  assert.deepEqual(dock.nativeQueue, [])
  dock.setReduceMotion(false)
  assert.equal(dock.animations.at(-1)?.kind, "withSpring")
})

test("repeat home visits reuse the same resolved drawing without resolving hidden scenes", () => {
  const resolvedInputs: Parameters<typeof roomSelectors.resolveRoomV2Scene>[0][] = []
  const shop = mountPreview({}, (input) => {
    resolvedInputs.push(input)
    return roomSelectors.resolveRoomV2Scene(input)
  })
  assert.equal(shop.first.roomPreviewScene, null)
  assert.deepEqual(resolvedInputs, [])
  const home = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts })
  assert.ok(home.roomPreviewScene)
  for (let visit = 0; visit < 5; visit += 1) {
    assert.equal(shop.update({ shopMode: "avatar", activeProducts: shop.catalog.avatarProducts }).roomPreviewScene, null)
    assert.equal(shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts }).roomPreviewScene, home.roomPreviewScene)
  }
  assert.deepEqual(resolvedInputs, [{
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: shop.input.roomDecor,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }])
  assert.equal(shop.update({ showShopContent: false }).roomPreviewScene, null)
  assert.equal(shop.update({ showShopContent: true }).roomPreviewScene, home.roomPreviewScene)
})

test("visible room changes refresh immediately using exact decor, catalog and selected item inputs", () => {
  const shop = mountPreview({ shopMode: "home" })
  const product = shop.catalog.roomProducts.find((entry) => entry.roomItem)
  assert.ok(product?.roomItem)
  const decor: UserRoomDecor = {
    roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
    placedItems: [{ instanceId: "shop-cache-piece", itemId: product.sourceItemId, x: 0.42, y: 0.69, rotation: "front" }]
  }
  const saved = shop.update({ roomDecor: decor })
  assert.notEqual(saved.roomPreviewScene, shop.first.roomPreviewScene)
  assert.deepEqual(saved.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor, defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  const catalog = ROOM_V2_FURNITURE_CATALOG.map((item) => item.id === product.sourceItemId
    ? { ...item, name: "Updated preview piece" } : item)
  const catalogUpdated = shop.update({ roomFurnitureCatalog: catalog })
  assert.notEqual(catalogUpdated.roomPreviewScene, saved.roomPreviewScene)
  assert.deepEqual(catalogUpdated.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: catalog,
    decor, defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  const selected = shop.update({ activeProducts: shop.catalog.roomProducts, selectedId: product.id })
  assert.notEqual(selected.roomPreviewScene, catalogUpdated.roomPreviewScene)
  const nextItem = { ...product.roomItem, width: product.roomItem.width * 0.9 }
  const products = shop.catalog.roomProducts.map((entry) => entry.id === product.id
    ? { ...entry, roomItem: nextItem } : entry)
  const itemUpdated = shop.update({ activeProducts: products })
  assert.notEqual(itemUpdated.roomPreviewScene, selected.roomPreviewScene)
  assert.deepEqual(itemUpdated.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: catalog,
    decor: createRoomPreviewDecor(nextItem, decor, DEFAULT_ROOM_V2_SHELL_ID),
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
})

test("hidden room changes do no scene work and activation resolves the latest inputs", () => {
  const resolvedInputs: Parameters<typeof roomSelectors.resolveRoomV2Scene>[0][] = []
  const shop = mountPreview({ shopMode: "home" }, (input) => {
    resolvedInputs.push(input)
    return roomSelectors.resolveRoomV2Scene(input)
  })
  shop.update({ showShopContent: false })
  const product = shop.catalog.roomProducts.find((entry) => entry.roomItem)
  assert.ok(product?.roomItem)
  const decor: UserRoomDecor = { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [] }
  const catalog = [...ROOM_V2_FURNITURE_CATALOG]
  const hidden = shop.update({ roomDecor: decor, roomFurnitureCatalog: catalog,
    activeProducts: shop.catalog.roomProducts, selectedId: product.id })
  assert.equal(hidden.roomPreviewScene, null)
  assert.equal(resolvedInputs.length, 1, "hidden changes must leave the drawing resolver untouched")
  const latest = shop.update({ showShopContent: true })
  assert.notEqual(latest.roomPreviewScene, shop.first.roomPreviewScene)
  assert.deepEqual(latest.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: catalog,
    decor: createRoomPreviewDecor(product.roomItem, decor, DEFAULT_ROOM_V2_SHELL_ID),
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
  assert.equal(resolvedInputs.at(-1)?.furnitureCatalog, catalog)
})

test("returning from avatar with no room selection removes the previous selected preview", () => {
  const shop = mountPreview()
  const product = shop.catalog.roomProducts.find((entry) => entry.roomItem)
  assert.ok(product?.roomItem)
  const selected = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts, selectedId: product.id })
  assert.ok(selected.roomPreviewScene)
  assert.equal(shop.update({ shopMode: "avatar", activeProducts: shop.catalog.avatarProducts, selectedId: "" }).roomPreviewScene, null)
  const home = shop.update({ shopMode: "home", activeProducts: shop.catalog.roomProducts })
  assert.notEqual(home.roomPreviewScene, selected.roomPreviewScene)
  assert.deepEqual(home.roomPreviewScene, roomSelectors.resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: shop.input.roomDecor, defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }))
})

function mountCardSelection(kind: "ring" | "badge", initialSelected: boolean, initialReduceMotion = false) {
  const runtime = createFakeReactRuntime()
  const native = createReactNativeStub()
  const reanimated = createReanimatedStub(runtime)
  const motion = loadSourceWithFakeReact<typeof MotionModule>("ui/motion.ts", runtime, {
    modules: { "react-native": native.module, "react-native-reanimated": reanimated.module },
    real: ["./reducedMotionStore", "./motionTokens"]
  })
  const styles = loadSourceWithFakeReact("features/shop/screen/shopScreenStyles.ts", runtime, {
    modules: { "react-native": native.module }, real: ["../../../ui/theme"]
  })
  const setup = { motionReads: 0, animatedStyleReads: 0, initialValues: [] as number[] }
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  reanimated.module.useSharedValue = function useRecordedSharedValue(initial: number) {
    const ref = useRef<{ value: number } | null>(null)
    if (!ref.current) {
      setup.initialValues.push(initial)
      ref.current = { value: initial }
    }
    return ref.current
  }
  reanimated.module.useAnimatedStyle = (work: () => unknown) => {
    setup.animatedStyleReads += 1
    return work()
  }
  let reduceMotion = initialReduceMotion
  const source = loadSourceWithFakeReact<typeof CardSelectionModule>("features/shop/screen/ShopCardSelection.tsx", runtime, {
    modules: {
      "react-native-reanimated": reanimated.module,
      "./shopScreenStyles": styles,
      "../../../ui/motion": { ...motion, useMotion: () => {
        setup.motionReads += 1
        return motion.resolveMotion(reduceMotion)
      } }
    }, inertUnknown: true
  })
  let selected = initialSelected
  let inner: PreviewElement | null = null
  runtime.render(() => {
    const element = kind === "ring"
      ? source.ShopCardSelectionRing({ selected })
      : source.ShopCardViewingBadge({ visible: selected })
    if (!element) {
      inner = null
      return null
    }
    inner = element as PreviewElement
    // Execute the production inner at the hook seam. This harness has no
    // native reconciliation; real React/native mount proof is a separate gate.
    if (typeof inner.type === "function") return inner.type(inner.props)
    return inner
  })
  return {
    setup, animations: reanimated.calls,
    get inner() { return inner },
    get output() { return runtime.output as PreviewElement | null },
    update(next: boolean) { selected = next; runtime.rerender() },
    setReduceMotion(enabled: boolean) { reduceMotion = enabled; runtime.rerender() }
  }
}

for (const kind of ["ring", "badge"] as const) {
  test(`never-selected ${kind} defers all animated setup and starts its first selection from hidden`, () => {
    const card = mountCardSelection(kind, false)
    const initialOutput = card.output
    assert.equal(initialOutput, null)
    assert.deepEqual(card.setup, { motionReads: 0, animatedStyleReads: 0, initialValues: [] })
    assert.deepEqual([...card.animations], [])
    card.update(false)
    card.setReduceMotion(true)
    assert.deepEqual(card.setup, { motionReads: 0, animatedStyleReads: 0, initialValues: [] })
    card.setReduceMotion(false)
    card.update(true)
    assert.deepEqual(card.setup.initialValues, [0], "first selection starts from the prior invisible state")
    assert.equal(card.animations.at(-1)?.kind, kind === "badge" ? "withSpring" : "withTiming")
    const animatedStyle = (card.output?.props.style as Record<string, unknown>[]).at(-1)
    assert.equal(animatedStyle?.opacity, 0)
    if (kind === "badge") assert.deepEqual(animatedStyle?.transform, [{ scale: 0.6 }])
    const inner = card.inner
    assert.ok(inner)
    card.update(false)
    assert.equal(card.inner?.type, inner.type, "deselection retains the animated child for its fade-out")
    assert.equal(card.animations.at(-1)?.kind, "withTiming")
    assert.ok((card.animations.at(-1)?.config?.duration as number) > 0)
    card.update(true)
    assert.equal(card.inner?.type, inner.type, "reselection uses the same child")
    assert.deepEqual(card.setup.initialValues, [0], "fade-out/reselection never reinitialize progress")
  })

  test(`initially-selected ${kind} starts fully visible and follows current Reduce Motion after activation`, () => {
    const card = mountCardSelection(kind, true)
    assert.deepEqual(card.setup.initialValues, [1])
    assert.equal((card.output?.props.style as Record<string, unknown>[]).at(-1)?.opacity, 1)
    card.setReduceMotion(true)
    card.update(false)
    card.update(true)
    assert.deepEqual(card.setup.initialValues, [1])
    assert.equal(card.animations.at(-1)?.kind, "withTiming")
    const style = (card.output?.props.style as Record<string, unknown>[]).at(-1)
    if (kind === "badge") assert.deepEqual(style?.transform, [{ scale: 1 }])
    const motion = card.animations.at(-1)?.config
    assert.ok((motion?.duration as number) > 0, "selection decoration keeps the existing opacity crossfade")
    const lazyReduced = mountCardSelection(kind, false, true)
    assert.deepEqual(lazyReduced.setup.initialValues, [])
    lazyReduced.update(true)
    assert.deepEqual(lazyReduced.setup.initialValues, [0])
    assert.equal(lazyReduced.animations.at(-1)?.kind, "withTiming")
    const initialStyle = (lazyReduced.output?.props.style as Record<string, unknown>[]).at(-1)
    assert.equal(initialStyle?.opacity, 0)
    if (kind === "badge") assert.deepEqual(initialStyle?.transform, [{ scale: 1 }])
  })
}
