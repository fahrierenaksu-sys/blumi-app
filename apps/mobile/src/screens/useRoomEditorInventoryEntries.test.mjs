import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"

const directory = dirname(fileURLToPath(import.meta.url))
// MyRoomEditorScreen composes the editor feature; the tray wiring lives in
// its inventory hook and the loading/empty presentation in its tray components.
const editorDirectory = resolve(directory, "../features/roomV2/editor")
const readEditorModule = (fileName) =>
  readFileSync(resolve(editorDirectory, fileName), "utf8")

function mountInventoryEntriesHook() {
  const source = readFileSync(resolve(directory, "useRoomEditorInventoryEntries.ts"), "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  let memoized
  let previousDependencies
  let calculations = 0
  const react = {
    useMemo(calculate, dependencies) {
      if (!previousDependencies || dependencies.some((value, index) =>
        !Object.is(value, previousDependencies[index])
      )) {
        memoized = calculate()
        previousDependencies = [...dependencies]
        calculations += 1
      }
      return memoized
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react") return react
      throw new Error(`Unexpected module: ${name}`)
    }
  })
  return {
    render: module.exports.useRoomEditorInventoryEntries,
    getViewState: module.exports.getRoomEditorInventoryViewState,
    canPlaceItem: module.exports.canPlaceRoomEditorInventoryItem,
    getCalculations: () => calculations
  }
}

test("the mounted room tray responds to hydration and ownership changes without unrelated recalculation", () => {
  const screen = readFileSync(resolve(directory, "MyRoomEditorScreen.tsx"), "utf8")
  const inventoryHook = readEditorModule("useRoomEditorInventory.ts")
  assert.match(screen, /const inventoryState = useRoomEditorInventory\(\{/)
  assert.match(inventoryHook, /useRoomEditorInventoryEntries\(/)

  const catalog = [{ id: "chair" }, { id: "table" }, { id: "qa" }]
  const qaOwnedIds = new Set(["qa"])
  const defaultVisibleIds = ["chair"]
  const serverVisibleIds = ["chair", "table"]
  const hook = mountInventoryEntriesHook()
  const ids = (entries) => Array.from(entries, (entry) => entry.item.id)

  const beforeHydration = hook.render(catalog, defaultVisibleIds, qaOwnedIds)
  assert.deepEqual(ids(beforeHydration), ["chair", "qa"])
  assert.strictEqual(hook.render(catalog, [...defaultVisibleIds], qaOwnedIds), beforeHydration)
  const hydrated = hook.render(catalog, serverVisibleIds, qaOwnedIds)
  assert.deepEqual(ids(hydrated), ["chair", "table", "qa"])
  assert.strictEqual(hook.render(catalog, [...serverVisibleIds], qaOwnedIds), hydrated)
  assert.equal(hook.getCalculations(), 2)

  assert.deepEqual(ids(hook.render(catalog, ["table"], qaOwnedIds)), ["table", "qa"])
  assert.equal(hook.getCalculations(), 3)
})

test("room inventory distinguishes slow, failed, truly empty, and filtered states", () => {
  const hook = mountInventoryEntriesHook()
  const viewState = hook.getViewState
  const expectState = (status, total, filtered, expected) => {
    assert.deepEqual({ ...viewState(status, total, filtered) }, expected)
  }

  expectState("idle", 1, 1, {
    isLoading: true,
    isFailed: false,
    emptyState: null
  })
  expectState("loading", 0, 0, {
    isLoading: true,
    isFailed: false,
    emptyState: null
  })
  expectState("failed", 1, 1, {
    isLoading: false,
    isFailed: true,
    emptyState: null
  })
  expectState("failed", 0, 0, {
    isLoading: false,
    isFailed: true,
    emptyState: "unavailable"
  })
  expectState("ready", 0, 0, {
    isLoading: false,
    isFailed: false,
    emptyState: "no-pieces"
  })
  expectState("ready", 2, 0, {
    isLoading: false,
    isFailed: false,
    emptyState: "no-matches"
  })
  expectState("ready", 2, 1, {
    isLoading: false,
    isFailed: false,
    emptyState: null
  })
})

test("server-required placement and Shop intents wait for authoritative inventory hydration", () => {
  const hook = mountInventoryEntriesHook()
  const screen = readFileSync(resolve(directory, "MyRoomEditorScreen.tsx"), "utf8")
  const inventoryHook = readEditorModule("useRoomEditorInventory.ts")
  const itemActions = readEditorModule("useRoomEditorItemActions.ts")
  const shopIntent = readEditorModule("useShopPlacementIntent.ts")
  assert.equal(hook.canPlaceItem("idle", true), false)
  assert.equal(hook.canPlaceItem("loading", true), false)
  assert.equal(hook.canPlaceItem("failed", true), false)
  assert.equal(hook.canPlaceItem("ready", true), true)
  assert.equal(hook.canPlaceItem("failed", false), true)
  assert.match(screen, /requireServerInventory: props\.requireServerInventory/)
  assert.match(screen, /canPlaceInventoryItem: inventoryState\.canPlaceInventoryItem/)
  assert.match(inventoryHook, /canPlaceRoomEditorInventoryItem\(\s*inventoryHydrationStatus,\s*input\.requireServerInventory === true\s*\)/)
  assert.match(itemActions, /if \(!canPlaceInventoryItem\) \{[\s\S]*?return false/)
  assert.match(shopIntent, /if \(!canPlaceInventoryItem \|\| !isRoomDraftReady\) return/)
})
