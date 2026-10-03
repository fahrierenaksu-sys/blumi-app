import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as BlockStore from "./blockStore"

// Characterizes useBlockStore's invalidation: the view changes with the owner's
// block list, profiles or relevant hydration status, never on a bare re-render.
function mount(serverBlocks: unknown[] = [], localHydration?: Promise<{ status: string; rawValues: (string | null)[] }>) {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof BlockStore>("features/safety/blockStore.ts", runtime, {
    modules: {
      "@react-native-async-storage/async-storage": { setItem: async () => undefined },
      "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
      "../persistence/accountScopedStorage": {
        loadAccountScopedStorage: async () => localHydration ?? ({ status: "ready", rawValues: [null] })
      },
      "./safetyApi": { fetchSafetyBlocks: async () => serverBlocks }
    },
    real: ["./blockScopeModel", "./partnerBlockedEvents"]
  })
  let requireServerHydration = false
  let owner = "owner"
  const render = () => runtime.render(() => store.useBlockStore(owner, requireServerHydration))
  return {
    runtime,
    store,
    render,
    requireServer: () => { requireServerHydration = true },
    switchOwner: (nextOwner: string) => { owner = nextOwner }
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test("the block view keeps its identity across re-renders without a store change", async () => {
  const f = mount()
  f.render()
  await settle()
  const first = f.runtime.output as BlockStore.BlockStoreView
  assert.equal(first.isReady, true)
  assert.equal(f.runtime.rerender(), first)
})

test("blocking re-renders with the new list; the lookup callbacks stay stable per owner", async () => {
  const f = mount()
  f.render()
  await settle()
  const before = f.runtime.output as BlockStore.BlockStoreView
  f.store.blockUser("owner", "blocked-1", { persist: false })
  const after = f.runtime.output as BlockStore.BlockStoreView
  assert.notEqual(after, before)
  assert.deepEqual(after.blockedUserIds, ["blocked-1"])
  assert.equal(after.isBlocked("blocked-1"), true)
  assert.equal(after.isBlocked, before.isBlocked)
  assert.equal(after.blockUser, before.blockUser)
  assert.equal(after.unblockUser, before.unblockUser)
})

test("unblocking drops the person's server profile summary from the view", async () => {
  const f = mount([
    { actorUserId: "owner", blockedUserId: "blocked-1", blockedProfile: { displayName: "Blocked One" } }
  ])
  f.render()
  await settle()
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const hydrated = f.runtime.output as BlockStore.BlockStoreView
  assert.deepEqual(Object.keys(hydrated.blockedProfilesById), ["blocked-1"])
  hydrated.unblockUser("blocked-1", { persist: false })
  const view = f.runtime.output as BlockStore.BlockStoreView
  assert.deepEqual(view.blockedUserIds, [])
  assert.deepEqual(view.blockedProfilesById, {})
  assert.equal(Object.keys(hydrated.blockedProfilesById).length, 1, "earlier views are not mutated")
})

test("a server-hydrated view follows the server status", async () => {
  const f = mount()
  f.requireServer()
  f.render()
  await settle()
  const loading = f.runtime.output as BlockStore.BlockStoreView
  assert.equal(loading.hydrationStatus, "loading")
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const view = f.runtime.output as BlockStore.BlockStoreView
  assert.equal(view.hydrationStatus, "ready")
  assert.equal(view.isReady, true)
  // Same (empty) list: its identity is the Discover deck's content key.
  assert.equal(view.blockedUserIds, loading.blockedUserIds)
})

test("an unchanged safety refresh does not render Discover or Settings again", async () => {
  const f = mount([
    { actorUserId: "owner", blockedUserId: "blocked-1", blockedProfile: { userId: "blocked-1", displayName: "Fixture" } }
  ])
  f.requireServer()
  f.render()
  await settle()
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const before = f.runtime.output
  const renders = f.runtime.renderCount
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  assert.equal(f.runtime.renderCount, renders)
  assert.equal(f.runtime.output, before)
})

test("another account's block changes do not render the mounted account", async () => {
  const f = mount()
  f.render()
  await settle()
  const before = f.runtime.output
  const renders = f.runtime.renderCount
  f.store.blockUser("another-owner", "blocked-2", { persist: false })
  assert.equal(f.runtime.renderCount, renders)
  assert.equal(f.runtime.output, before)
})

test("owner switching reads the new safety snapshot immediately and drops old subscriptions", async () => {
  const f = mount()
  f.render()
  await settle()
  f.store.blockUser("owner", "blocked-1", { persist: false })
  f.switchOwner("next-owner")
  const next = f.render()
  assert.deepEqual(next.blockedUserIds, [])
  assert.equal(next.isReady, false)
  await settle()
  const renders = f.runtime.renderCount
  f.store.blockUser("owner", "blocked-2", { persist: false })
  assert.equal(f.runtime.renderCount, renders)
  f.store.blockUser("next-owner", "blocked-3", { persist: false })
  assert.deepEqual((f.runtime.output as BlockStore.BlockStoreView).blockedUserIds, ["blocked-3"])
})

test("unobserved hydration status changes stay isolated from a local safety view", async () => {
  const f = mount()
  f.render()
  await settle()
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const renders = f.runtime.renderCount
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  assert.equal(f.runtime.renderCount, renders)
})

test("a changed blocked profile still publishes without changing the block IDs", async () => {
  const blocks = [
    { actorUserId: "owner", blockedUserId: "blocked-1", blockedProfile: { userId: "blocked-1", displayName: "Fixture" } }
  ]
  const f = mount(blocks)
  f.render()
  await settle()
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const before = f.runtime.output as BlockStore.BlockStoreView
  blocks[0].blockedProfile.displayName = "Updated fixture"
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const after = f.runtime.output as BlockStore.BlockStoreView
  assert.equal(after.blockedUserIds, before.blockedUserIds)
  assert.equal(after.blockedProfilesById["blocked-1"].displayName, "Updated fixture")
  assert.equal(before.blockedProfilesById["blocked-1"].displayName, "Fixture")
})

test("late local storage cannot erase authoritative server profiles or redraw a ready server view", async () => {
  let release!: (result: { status: string; rawValues: (string | null)[] }) => void
  const local = new Promise<{ status: string; rawValues: (string | null)[] }>((resolve) => { release = resolve })
  const f = mount([
    { actorUserId: "owner", blockedUserId: "blocked-1", blockedProfile: { userId: "blocked-1", displayName: "Fixture" } }
  ], local)
  f.requireServer()
  f.render()
  await f.store.hydrateBlockedUsersFromServer("owner", "token")
  const before = f.runtime.output as BlockStore.BlockStoreView
  const renders = f.runtime.renderCount
  release({ status: "ready", rawValues: ['["stale-block"]'] })
  await settle()
  const after = f.runtime.output as BlockStore.BlockStoreView
  assert.equal(after, before)
  assert.equal(f.runtime.renderCount, renders)
  assert.equal(after.blockedProfilesById["blocked-1"].displayName, "Fixture")
  assert.equal(after.isBlocked("blocked-1"), true)
  assert.equal(after.isBlocked("stale-block"), false)
})
