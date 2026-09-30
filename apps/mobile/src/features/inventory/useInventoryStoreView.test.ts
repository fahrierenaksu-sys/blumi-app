import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as InventoryStore from "./inventoryStore"

// Characterizes useInventoryStore's view invalidation: consumers such as the
// room provider key on `inventory` identity, so it changes only with the
// owner's inventory, readiness or relevant hydration status.
function mount() {
  const runtime = createFakeReactRuntime()
  let releaseServerRead: (() => void) | undefined
  const store = loadSourceWithFakeReact<typeof InventoryStore>("features/inventory/inventoryStore.ts", runtime, {
    modules: {
      "@react-native-async-storage/async-storage": { setItem: async () => undefined },
      "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
      "../avatarV2/avatarV2Catalog": { AVATAR_V2_CATALOG: [{ id: "top", ownedByDefault: true }, { id: "hat" }] },
      "../roomV2/roomV2Catalog": { ROOM_V2_FURNITURE_CATALOG: [{ id: "bed", ownedByDefault: true }, { id: "lamp" }] },
      "../persistence/accountScopedStorage": {
        loadAccountScopedStorage: async () => ({ status: "ready", rawValues: [null] })
      },
      "./economyApi": {
        EconomyHttpError: class extends Error {},
        claimDailyEconomyReward: async () => { throw new Error("unused") },
        purchaseEconomyItem: async () => { throw new Error("unused") },
        fetchEconomyInventory: () => new Promise((_resolve, reject) => {
          releaseServerRead = () => reject(new Error("offline"))
        })
      }
    },
    real: ["./inventoryModel", "./inventoryScopeModel", "./inventoryHydrationSingleFlight"]
  })
  const render = () => runtime.render(() => store.useInventoryStore("owner"))
  return { runtime, render, failServerRead: () => releaseServerRead?.() }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test("the inventory view and snapshot keep their identity across re-renders", async () => {
  const f = mount()
  f.render()
  await settle()
  const view = f.runtime.output as InventoryStore.InventoryStoreView
  assert.equal(view.isReady, true)
  assert.deepEqual(view.inventory.ownedRoomItemIds, ["bed"])
  const again = f.runtime.rerender() as InventoryStore.InventoryStoreView
  assert.equal(again, view)
  assert.equal(again.inventory, view.inventory)
})

test("an unlock publishes a new view with the new inventory", async () => {
  const f = mount()
  f.render()
  await settle()
  const before = f.runtime.output as InventoryStore.InventoryStoreView
  const result = before.unlockRoomItem("lamp", 100)
  assert.equal(result.success, true)
  const after = f.runtime.output as InventoryStore.InventoryStoreView
  assert.notEqual(after, before)
  assert.deepEqual(after.inventory.ownedRoomItemIds, ["bed", "lamp"])
  assert.equal(after.inventory.coins, before.inventory.coins - 100)
})

test("server status changes a local-only view does not read keep the same view", async () => {
  const f = mount()
  f.render()
  await settle()
  const before = f.runtime.output as InventoryStore.InventoryStoreView
  const renders = f.runtime.renderCount
  const hydration = before.hydrateFromServer("token")
  await settle()
  f.failServerRead()
  await hydration
  assert.ok(f.runtime.renderCount > renders, "the store notified")
  assert.equal(f.runtime.output, before)
})
