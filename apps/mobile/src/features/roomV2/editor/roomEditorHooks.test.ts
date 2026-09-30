import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import type { UserRoomDecor } from "../roomV2.types"
import type { useRoomEditorSession as UseRoomEditorSession } from "./useRoomEditorSession"
import type {
  useShopPlacementIntent as UseShopPlacementIntent,
  useShopPlacementIntentMemory as UseShopPlacementIntentMemory
} from "./useShopPlacementIntent"
import { createTestPlaced } from "./roomEditorTestFixtures"

// A minimal synchronous hooks runtime (state slots, memo/callback/effect
// dependencies, refs, effect cleanup) to drive the editor hooks the way the
// screen does, without a native renderer.
type Slot = {
  value?: unknown
  deps?: readonly unknown[]
  cleanup?: (() => void) | void
  current?: unknown
}

function depsChanged(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  if (!previous || !next) return true
  return next.length !== previous.length ||
    next.some((value, index) => !Object.is(value, previous[index]))
}

function createHookRuntime() {
  const slots: Slot[] = []
  let cursor = 0
  let passiveEffects: (() => void)[] = []

  const memoizeSlot = <T>(calculate: () => T, deps: readonly unknown[]): T => {
    const index = cursor++
    const previous = slots[index]
    if (!previous || depsChanged(previous.deps, deps)) {
      slots[index] = { value: calculate(), deps }
    }
    return slots[index].value as T
  }
  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      if (!slots[index]) {
        slots[index] = {
          value: typeof initial === "function" ? (initial as () => T)() : initial
        }
      }
      const slot = slots[index]
      const setState = (next: T | ((current: T) => T)) => {
        slot.value = typeof next === "function"
          ? (next as (current: T) => T)(slot.value as T)
          : next
      }
      return [slot.value as T, setState] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      if (!slots[index]) slots[index] = { current: initial }
      return slots[index] as { current: T }
    },
    useMemo: memoizeSlot,
    useCallback<T>(callback: T, deps: readonly unknown[]): T {
      return memoizeSlot(() => callback, deps)
    },
    useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]) {
      const index = cursor++
      const previous = slots[index]
      if (previous && !depsChanged(previous.deps, deps)) return
      slots[index] = { deps, cleanup: previous?.cleanup }
      passiveEffects.push(() => {
        slots[index].cleanup?.()
        slots[index].cleanup = effect()
      })
    }
  }

  function render<T>(hook: () => T): T {
    cursor = 0
    passiveEffects = []
    const result = hook()
    for (const effect of passiveEffects) effect()
    return result
  }

  return { react, render }
}

function loadEditorHooks(runtime: ReturnType<typeof createHookRuntime>, haptics: string[]) {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = loader._load
  loader._load = function load(request, parent, isMain) {
    if (request === "react") return runtime.react
    if (request === "../../../ui/haptics") {
      return {
        hapticLight: () => haptics.push("light"),
        hapticSuccess: () => haptics.push("success"),
        hapticError: () => haptics.push("error")
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const requireFromHere = createRequire(resolve(__dirname, "index.ts"))
    const load = <T>(specifier: string): T => {
      const modulePath = requireFromHere.resolve(specifier)
      delete requireFromHere.cache[modulePath]
      return requireFromHere(modulePath) as T
    }
    const session = load<{ useRoomEditorSession: typeof UseRoomEditorSession }>("./useRoomEditorSession")
    const intent = load<{
      useShopPlacementIntent: typeof UseShopPlacementIntent
      useShopPlacementIntentMemory: typeof UseShopPlacementIntentMemory
    }>("./useShopPlacementIntent")
    return { ...session, ...intent }
  } finally {
    loader._load = originalLoad
  }
}

const copy = getMyRoomEditorCopy("en")
const decor = (x: number): UserRoomDecor => ({
  roomShellId: "shell",
  placedItems: [createTestPlaced({ x })]
})

function mountSession(initial: {
  userRoomDecor: UserRoomDecor
  confirmedPersistedRoomDecor?: UserRoomDecor
  persistenceState: "loading" | "ready" | "failed"
}) {
  const runtime = createHookRuntime()
  const haptics: string[] = []
  const { useRoomEditorSession } = loadEditorHooks(runtime, haptics)
  const selectionCalls: string[] = []
  const selection = {
    setSelectedInstanceId: (value: unknown) => { selectionCalls.push(`instance:${String(value)}`) },
    setPlacementFeedback: (value: unknown) => { selectionCalls.push(`feedback:${String(value)}`) },
    setPlacementPreview: (value: unknown) => { selectionCalls.push(`preview:${String(value)}`) }
  } as unknown as Parameters<typeof useRoomEditorSession>[0]["selection"]
  let props = { ...initial }
  const render = (next: Partial<typeof initial> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => useRoomEditorSession({
      userRoomDecor: props.userRoomDecor,
      confirmedPersistedRoomDecor: props.confirmedPersistedRoomDecor,
      persistenceState: props.persistenceState,
      copy,
      selection
    }))
  }
  return { render, haptics, selectionCalls }
}

test("a ready provider opens the editor immediately without a second session", () => {
  const harness = mountSession({ userRoomDecor: decor(0.3), persistenceState: "ready" })
  const first = harness.render()
  assert.equal(first.isRoomDraftReady, true)
  assert.deepEqual(first.draftDecor, decor(0.3))
  assert.equal(first.editorSession.isDirty, false)
  const second = harness.render({ userRoomDecor: decor(0.5) })
  assert.deepEqual(second.draftDecor, decor(0.3), "a later provider snapshot must not replace the draft")
  assert.deepEqual(harness.selectionCalls, [])
})

test("a loading provider hydrates the draft once from the first ready snapshot", () => {
  const harness = mountSession({ userRoomDecor: decor(0.1), persistenceState: "loading" })
  assert.equal(harness.render().isRoomDraftReady, false)
  harness.render({ userRoomDecor: decor(0.4), persistenceState: "ready" })
  assert.deepEqual(harness.selectionCalls, ["instance:undefined", "feedback:undefined", "preview:undefined"])
  const hydrated = harness.render()
  assert.equal(hydrated.isRoomDraftReady, true)
  assert.deepEqual(hydrated.draftDecor, decor(0.4))
  harness.render({ userRoomDecor: decor(0.7) })
  assert.deepEqual(harness.render().draftDecor, decor(0.4))
  assert.equal(harness.selectionCalls.length, 3)
})

test("draft edits, undo, and the exit-guard ref stay in sync", () => {
  const harness = mountSession({ userRoomDecor: decor(0.3), persistenceState: "ready" })
  const first = harness.render()
  first.setDraftDecor((current) => ({ ...current, placedItems: [createTestPlaced({ x: 0.6 })] }))
  assert.equal(first.editorSessionRef.current.isDirty, true, "the ref mirrors the draft before the next render")
  const edited = harness.render()
  assert.equal(edited.editorSession.canUndo, true)
  assert.equal(edited.draftDecor.placedItems[0].x, 0.6)

  edited.handleUndoDraft()
  const undone = harness.render()
  assert.equal(undone.draftDecor.placedItems[0].x, 0.3)
  assert.equal(undone.editorSessionRef.current.isDirty, false)
  assert.deepEqual(harness.haptics, ["light"])
  assert.deepEqual(harness.selectionCalls, ["instance:undefined", "feedback:undefined", "preview:undefined"])

  undone.handleUndoDraft()
  assert.deepEqual(harness.haptics, ["light"], "undo without history is a no-op")
})

test("reset needs a server-confirmed baseline and follows baseline updates", () => {
  const harness = mountSession({ userRoomDecor: decor(0.3), persistenceState: "ready" })
  const first = harness.render()
  first.setDraftDecor(decor(0.5))
  const edited = harness.render()
  edited.handleResetDraft()
  assert.deepEqual(harness.haptics, ["error"])
  assert.deepEqual(harness.selectionCalls, [`feedback:${copy.feedback.saveBeforeReset}`])

  const withBaseline = harness.render({ confirmedPersistedRoomDecor: decor(0.2) })
  assert.equal(harness.render().editorSession.canResetToPersistedBaseline, true)
  withBaseline.handleResetDraft()
  const reset = harness.render()
  assert.deepEqual(reset.draftDecor, decor(0.2))
  assert.equal(reset.editorSession.canUndo, true)
  assert.deepEqual(harness.haptics, ["error", "light"])
})

function mountIntent() {
  const runtime = createHookRuntime()
  const haptics: string[] = []
  const { useShopPlacementIntent, useShopPlacementIntentMemory } = loadEditorHooks(runtime, haptics)
  const listeners: Record<string, () => void> = {}
  let unsubscribed = 0
  const navigation = {
    addListener: (event: string, listener: () => void) => {
      listeners[event] = listener
      return () => { unsubscribed += 1 }
    }
  } as unknown as Parameters<typeof useShopPlacementIntentMemory>[0]
  const calls: string[] = []
  let placementResult = true
  let props = {
    placementItemId: undefined as string | undefined,
    canPlaceInventoryItem: false,
    isRoomDraftReady: false
  }
  const addDraftItem = (itemId: string, feedback: boolean) => {
    calls.push(`add:${itemId}:${feedback}`)
    return placementResult
  }
  const setSelectedInventoryItemId = (itemId: string | undefined) => { calls.push(`select:${itemId}`) }
  const setPlacementFeedback = (feedback: string | undefined) => { calls.push(`feedback:${feedback}`) }
  const render = (next: Partial<typeof props> = {}) => {
    props = { ...props, ...next }
    runtime.render(() => {
      const lastAppliedPlacementItemId = useShopPlacementIntentMemory(navigation)
      useShopPlacementIntent({
        ...props,
        lastAppliedPlacementItemId,
        addDraftItem,
        setSelectedInventoryItemId,
        setPlacementFeedback
      })
    })
  }
  return {
    render,
    calls,
    haptics,
    blur: () => listeners.blur?.(),
    setPlacementResult: (result: boolean) => { placementResult = result },
    getUnsubscribed: () => unsubscribed
  }
}

test("a Shop placement intent waits for hydration and applies once per product ID", () => {
  const harness = mountIntent()
  harness.render({ placementItemId: "chair" })
  harness.render({ canPlaceInventoryItem: true })
  assert.deepEqual(harness.calls, [], "waits for the room draft")
  harness.render({ isRoomDraftReady: true })
  assert.deepEqual(harness.calls, ["select:chair", "feedback:undefined", "add:chair:false"])
  assert.deepEqual(harness.haptics, ["success"])

  harness.render({ canPlaceInventoryItem: false })
  harness.render({ canPlaceInventoryItem: true })
  assert.equal(harness.calls.length, 3, "the same product ID is not applied twice")

  harness.setPlacementResult(false)
  harness.render({ placementItemId: "lamp" })
  assert.deepEqual(harness.calls.slice(3), ["select:lamp", "feedback:undefined", "add:lamp:false"])
  assert.deepEqual(harness.haptics, ["success"], "a passive failed placement is silent")
})

test("blurring the reused editor route lets the same Shop intent apply again", () => {
  const harness = mountIntent()
  harness.render({ placementItemId: "chair", canPlaceInventoryItem: true, isRoomDraftReady: true })
  assert.equal(harness.calls.length, 3)
  harness.blur()
  harness.render({ isRoomDraftReady: false })
  harness.render({ isRoomDraftReady: true })
  assert.deepEqual(harness.calls.slice(3), ["select:chair", "feedback:undefined", "add:chair:false"])
  assert.equal(harness.getUnsubscribed(), 0, "the blur listener stays registered for a stable navigation")
})
