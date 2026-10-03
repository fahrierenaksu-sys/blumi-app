import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type { ScopedStorageLoadResult } from "../persistence/accountScopedStorage"
import * as persistence from "./savedConnectionsPersistence"
import type * as Store from "./savedConnectionsStore"

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

function fixture() {
  let activeRuntime = createFakeReactRuntime()
  const pending = new Map<string, (result: ScopedStorageLoadResult) => void>()
  const store = loadSourceWithFakeReact<typeof Store>("features/connections/savedConnectionsStore.ts", activeRuntime, {
    modules: {
      react: new Proxy({}, { get: (_target, property) => activeRuntime.react[property as string] }),
      "@react-native-async-storage/async-storage": { setItem: async () => undefined },
      "./savedConnectionsPersistence": persistence,
      "../persistence/accountScopedStorage": {
        loadAccountScopedStorage: (input: { migrationMarkerKey: string }) =>
          new Promise<ScopedStorageLoadResult>((resolve) => pending.set(input.migrationMarkerKey, resolve))
      }
    }
  })
  const resolveOwner = (owner: string, result: ScopedStorageLoadResult) => {
    const key = persistence.getSavedConnectionsStorageKeys(owner).migrationMarker
    const resolve = pending.get(key)
    assert.ok(resolve, "the owner has a pending hydration")
    pending.delete(key)
    resolve(result)
  }
  const ready = (owner: string, saved: Store.SavedConnection[] = [], skipped: Store.SkippedConnection[] = []) =>
    resolveOwner(owner, { status: "ready", rawValues: [JSON.stringify(saved), JSON.stringify(skipped)], migrated: false })
  const mount = (initialOwner: string) => {
    const runtime = createFakeReactRuntime()
    const frames: Store.SavedConnectionsView[] = []
    let owner = initialOwner
    const render = (nextOwner = owner) => {
      owner = nextOwner
      return runtime.render(() => {
        activeRuntime = runtime
        const view = store.useSavedConnections(owner)
        frames.push(view)
        return view
      })
    }
    render()
    return { runtime, frames, render, get view() { return runtime.output as Store.SavedConnectionsView } }
  }
  return { store, pending, mount, ready, resolveOwner }
}

const saved = (label: string): Store.SavedConnection => ({ userId: label, displayName: "Synthetic", savedAt: "2026-01-01T00:00:00.000Z" })
const skipped = (label: string): Store.SkippedConnection => ({ userId: label, skippedAt: "2026-01-01T00:00:00.000Z" })

test("a ready owner cache stays visible through mount, parent renders and refresh", async () => {
  const f = fixture()
  const warm = f.store.getSavedConnections("synthetic-owner-a")
  f.ready("synthetic-owner-a", [saved("synthetic-saved-a")], [skipped("synthetic-skipped-a")])
  await warm
  const page = f.mount("synthetic-owner-a")
  const firstSaved = page.view.saved
  const firstSkipped = page.view.skipped
  page.render()
  await page.view.refresh()
  await settle()
  for (const frame of page.frames) {
    assert.equal(frame.isHydrating, false)
    assert.equal(frame.saved, firstSaved)
    assert.equal(frame.skipped, firstSkipped)
    assert.equal(frame.saved[0]?.userId, "synthetic-saved-a")
    assert.equal(frame.skipped[0]?.userId, "synthetic-skipped-a")
  }
  assert.equal(f.pending.size, 0)
  page.runtime.unmount()
})

test("an account switch shows only the new owner from its very first render", async () => {
  const f = fixture()
  const page = f.mount("synthetic-owner-a")
  f.ready("synthetic-owner-a", [saved("synthetic-saved-a")], [skipped("synthetic-skipped-a")])
  await settle()
  const switchFrame = page.frames.length
  page.render("synthetic-owner-b")
  assert.equal(page.view.saved.length, 0)
  assert.equal(page.view.skipped.length, 0)
  assert.equal(page.view.isHydrating, true)
  f.ready("synthetic-owner-b", [saved("synthetic-saved-b")])
  await settle()
  assert.equal(page.view.saved[0]?.userId, "synthetic-saved-b")
  assert.equal(page.view.isHydrating, false)
  assert.ok(page.frames.slice(switchFrame).every((frame) => frame.saved.every((entry) => entry.userId !== "synthetic-saved-a")))
  page.runtime.unmount()
})

test("late hydration and refresh completion cannot publish the previous account", async () => {
  const f = fixture()
  const page = f.mount("synthetic-owner-a")
  const previousRefresh = page.view.refresh()
  page.render("synthetic-owner-b")
  f.ready("synthetic-owner-b", [saved("synthetic-saved-b")])
  await settle()
  const current = page.view.saved
  f.ready("synthetic-owner-a", [saved("synthetic-saved-a")])
  await previousRefresh
  await settle()
  assert.equal(page.view.saved, current)
  assert.equal(page.view.saved[0]?.userId, "synthetic-saved-b")
  assert.equal(page.view.isHydrating, false)
  page.runtime.unmount()
})

test("mounted consumers receive owner mutations while other owners remain unchanged", async () => {
  const f = fixture()
  const first = f.mount("synthetic-owner-a")
  const second = f.mount("synthetic-owner-a")
  const other = f.mount("synthetic-owner-b")
  f.ready("synthetic-owner-a")
  f.ready("synthetic-owner-b")
  await settle()
  const otherSaved = other.view.saved
  await f.store.saveConnection({ ownerUserId: "synthetic-owner-a", userId: "synthetic-saved-a", displayName: "Synthetic" })
  assert.equal(first.view.saved[0]?.userId, "synthetic-saved-a")
  assert.equal(second.view.saved[0]?.userId, "synthetic-saved-a")
  assert.equal(first.view.saved, second.view.saved)
  assert.equal(other.view.saved, otherSaved)
  await f.store.skipDiscoveryCandidate({ ownerUserId: "synthetic-owner-a", userId: "synthetic-skipped-a" })
  assert.equal(first.view.skipped[0]?.userId, "synthetic-skipped-a")
  assert.equal(second.view.skipped, first.view.skipped)
  first.runtime.unmount()
  await f.store.removeSavedConnection({ ownerUserId: "synthetic-owner-a", userId: "synthetic-saved-a" })
  assert.deepEqual(second.view.saved, [])
  second.runtime.unmount()
  other.runtime.unmount()
})

test("failed hydration leaves loading and a retry updates every mounted consumer", async () => {
  const f = fixture()
  const first = f.mount("synthetic-owner-a")
  const second = f.mount("synthetic-owner-a")
  f.resolveOwner("synthetic-owner-a", { status: "error" })
  await settle()
  assert.equal(first.view.isHydrating, false)
  assert.equal(second.view.isHydrating, false)
  assert.deepEqual(first.view.saved, [])
  const retry = first.view.refresh()
  assert.equal(first.view.isHydrating, true)
  assert.equal(second.view.isHydrating, true)
  f.ready("synthetic-owner-a", [saved("synthetic-saved-a")])
  await retry
  assert.equal(first.view.isHydrating, false)
  assert.equal(second.view.isHydrating, false)
  assert.equal(second.view.saved[0]?.userId, "synthetic-saved-a")
  first.runtime.unmount()
  second.runtime.unmount()
})
