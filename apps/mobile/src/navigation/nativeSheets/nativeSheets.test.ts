import assert from "node:assert/strict"
import test from "node:test"
import { StackActions, StackRouter } from "@react-navigation/routers"
import { createFakeReactRuntime, createInertModule, loadSourceWithFakeReact } from "../../testing/hookHarness"
import * as model from "./nativeSheetModel"
import { createNativeSheetRegistry, type NativeSheetRegistry } from "./nativeSheetRegistry"

// Native sheets: the opener keeps the props and callbacks, the route params
// carry only ids, and every way a sheet can close reaches the opener exactly
// once, after the sheet is gone.

function idFactory() {
  let next = 0
  return () => `request-${(next += 1)}`
}

/* ── Registry ──────────────────────────────────────────────── */

test("a dismissed sheet tells its opener once, then runs work queued for after it", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const events: string[] = []
  const id = registry.open("report", { target: "a" }, () => events.push("dismissed"))
  assert.equal(registry.requestClose(id, () => events.push("leave screen")), true)
  assert.equal(registry.requestClose(id, () => events.push("second close")), false)
  assert.equal(registry.read(id)?.phase, "closing")
  registry.dismissed(id)
  registry.dismissed(id)
  assert.deepEqual(events, ["dismissed", "leave screen", "second close"])
  assert.equal(registry.size(), 0)
})

test("a swipe-dismissed sheet reports to the opener without a close request", () => {
  const registry = createNativeSheetRegistry(idFactory())
  let dismissals = 0
  const id = registry.open("discoverFilters", {}, () => { dismissals += 1 })
  registry.dismissed(id)
  assert.equal(dismissals, 1)
  assert.equal(registry.read(id), undefined)
})

test("a released opener closes its sheet and hears nothing back", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const events: string[] = []
  const id = registry.open("report", {}, () => events.push("dismissed"))
  const unsubscribe = registry.subscribe(id, () => events.push("changed"))
  registry.requestClose(id, () => events.push("after"))
  registry.release(id)
  registry.dismissed(id)
  unsubscribe()
  assert.deepEqual(events, ["changed"])
  assert.equal(registry.size(), 0)

  // Released before the sheet route mounted: nothing to keep.
  const early = registry.open("report", {}, () => events.push("early dismissed"))
  registry.release(early)
  assert.equal(registry.read(early), undefined)
})

test("a mounted sheet sees the opener's release as a close", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const id = registry.open("countryPicker", {}, () => assert.fail("opener is gone"))
  let changes = 0
  registry.subscribe(id, () => { changes += 1 })
  registry.release(id)
  assert.equal(registry.read(id)?.phase, "closing")
  assert.equal(changes, 1)
  registry.dismissed(id)
  assert.equal(registry.size(), 0)
})

test("props updates notify the sheet only when a value changed", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const onApply = () => undefined
  const id = registry.open("discoverFilters", { onApply, ageMin: 18 }, () => undefined)
  let changes = 0
  registry.subscribe(id, () => { changes += 1 })
  registry.update(id, { onApply, ageMin: 18 })
  assert.equal(changes, 0)
  registry.update(id, { onApply, ageMin: 20 })
  assert.equal(changes, 1)
  assert.deepEqual(registry.read(id)?.props, { onApply, ageMin: 20 })
})

/* ── Model ─────────────────────────────────────────────────── */

const stack = (names: string[]) => ({
  index: names.length - 1,
  routes: names.map((name, index) => ({ key: `${name}-${index}`, name }))
})

test("chrome and focus follow the screen beneath native sheets", () => {
  const state = stack(["Lobby", "ChatThread", "NativeSheet"])
  assert.equal(model.getRouteBeneathSheets(state)?.key, "ChatThread-1")
  assert.equal(model.isFocusedBeneathSheets(state, "ChatThread-1"), true)
  assert.equal(model.isFocusedBeneathSheets(state, "Lobby-0"), false)
  assert.equal(model.isFocusedBeneathSheets(stack(["Lobby", "ChatThread"]), "Lobby-0"), false)
  assert.equal(model.getRouteBeneathSheets(undefined), undefined)
})

test("iOS presents form sheets; Reduce Motion crossfades them; Android keeps its Modal sheet", () => {
  assert.equal(model.shouldPresentAsNativeSheet("ios"), true)
  assert.equal(model.shouldPresentAsNativeSheet("android"), false)
  for (const kind of model.NATIVE_SHEET_KINDS) {
    const full = model.getNativeSheetScreenOptions({ kind, reduceMotion: false, backgroundColor: "#fff", cornerRadius: 30 })
    const reduced = model.getNativeSheetScreenOptions({ kind, reduceMotion: true, backgroundColor: "#fff", cornerRadius: 30 })
    assert.equal(full.presentation, "formSheet")
    assert.equal(full.sheetGrabberVisible, true)
    assert.notEqual(full.animation, "fade")
    assert.equal(reduced.animation, "fade")
    const detents = full.sheetAllowedDetents
    if (Array.isArray(detents)) {
      assert.deepEqual([...detents].sort((a, b) => a - b), detents, `${kind} detents must ascend`)
      assert.ok(detents.every((detent) => detent > 0 && detent <= 1))
    } else {
      assert.equal(detents, "fitToContents")
    }
  }
})

/* ── Opener hook and sheet route ───────────────────────────── */

function loadSheetRuntime(platform: "ios" | "android") {
  const registry = createNativeSheetRegistry(idFactory())
  const pushes: { name: string; params: Record<string, unknown> }[] = []
  const runtime = createFakeReactRuntime()
  const { useNativeSheet } = loadSourceWithFakeReact<{
    useNativeSheet: (kind: string, props: object | null, onDismiss: () => void) => boolean
  }>("navigation/nativeSheets/useNativeSheet.ts", runtime, {
    modules: {
      "react-native": { Platform: { OS: platform } },
      "@react-navigation/native": {
        useNavigation: () => navigation
      },
      "./nativeSheetModel": model,
      "./nativeSheetRegistry": { nativeSheetRegistry: registry }
    }
  })
  const navigation = {
    push: (name: string, params: Record<string, unknown>) => { pushes.push({ name, params }) }
  }
  return { registry, pushes, runtime, useNativeSheet }
}

test("the opener pushes a sheet route whose params are ids only", () => {
  const { registry, pushes, runtime, useNativeSheet } = loadSheetRuntime("ios")
  let visible = true
  let dismissals = 0
  const onApply = () => undefined
  runtime.render(() => useNativeSheet(
    "discoverFilters",
    visible ? { initialFilters: { ageMin: 18 }, onApply } : null,
    () => { dismissals += 1; visible = false }
  ))
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0]!.name, "NativeSheet")
  assert.deepEqual(Object.keys(pushes[0]!.params).sort(), ["requestId", "sheet"])
  assert.ok(Object.values(pushes[0]!.params).every((value) => typeof value === "string"))
  const requestId = pushes[0]!.params.requestId as string
  assert.equal((registry.read(requestId)?.props as { onApply: unknown }).onApply, onApply)

  // A user swipe: the opener hears it once and does not push again.
  registry.dismissed(requestId)
  runtime.rerender()
  assert.equal(dismissals, 1)
  assert.equal(pushes.length, 1)

  // Opening again starts a fresh request.
  visible = true
  runtime.rerender()
  assert.equal(pushes.length, 2)
  assert.notEqual(pushes[1]!.params.requestId, requestId)
})

test("the opener closing its state closes the sheet; its unmount releases it", () => {
  const { registry, pushes, runtime, useNativeSheet } = loadSheetRuntime("ios")
  let visible = true
  let dismissals = 0
  runtime.render(() => useNativeSheet("report", visible ? { targetUserId: "x" } : null, () => { dismissals += 1 }))
  const requestId = pushes[0]!.params.requestId as string
  registry.subscribe(requestId, () => undefined)

  visible = false
  runtime.rerender()
  assert.equal(registry.read(requestId)?.phase, "closing")

  visible = true
  runtime.rerender()
  runtime.unmount()
  registry.dismissed(requestId)
  assert.equal(dismissals, 0, "an unmounted opener is never called back")
  assert.equal(registry.size(), 0)
})

test("Android renders its own Modal sheet and pushes no route", () => {
  const { pushes, runtime, useNativeSheet } = loadSheetRuntime("android")
  const presentsNatively = runtime.render(() => useNativeSheet("report", { targetUserId: "x" }, () => undefined))
  assert.equal(presentsNatively, false)
  assert.equal(pushes.length, 0)
})

function loadSheetRoute(registry: NativeSheetRegistry, requestId: string) {
  const runtime = createFakeReactRuntime()
  const goBacks: string[] = []
  const options: Record<string, unknown>[] = []
  let routes = [{ key: "chat" }, { key: "sheet" }]
  const navigation = {
    goBack: () => {
      goBacks.push("sheet")
      routes = routes.filter((route) => route.key !== "sheet")
    },
    getState: () => ({ routes }),
    setOptions: (next: Record<string, unknown>) => { options.push(next) }
  }
  const content = (name: string) => ({ [name]: name })
  const presentationModule = { SheetPresentationContext: { Provider: "Provider" } }
  const { NativeSheetRoute } = loadSourceWithFakeReact<{
    NativeSheetRoute: (props: object) => unknown
  }>("navigation/nativeSheets/NativeSheetRoute.tsx", runtime, {
    modules: {
      "react-native": { StyleSheet: { create: <T>(styles: T) => styles }, useWindowDimensions: () => ({ height: 800 }), View: "View" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 34 }) },
      "../../components/DiscoverFiltersBottomSheet": content("DiscoverFiltersSheetContent"),
      "../../components/ReportModal": content("ReportSheetContent"),
      "../../components/CountryCallingCodePicker": content("CountryPickerSheetContent"),
      "../../features/inbox/InboxConversationActionsSheet": content("InboxConversationActionsSheetContent"),
      "../../ui/sheetPresentation": presentationModule,
      "../../ui/theme": createInertModule("theme"),
      "./nativeSheetModel": model,
      "./nativeSheetRegistry": { nativeSheetRegistry: registry }
    }
  })
  const render = () => runtime.render(() => NativeSheetRoute({
    navigation,
    route: { key: "sheet", name: "NativeSheet", params: { sheet: "report", requestId } }
  }))
  return { runtime, render, goBacks, options }
}

function findPresentation(output: unknown): { close: (after?: () => void) => void; setDismissible: (value: boolean) => void } {
  const element = output as { props: { value: { close: () => void; setDismissible: (value: boolean) => void } } }
  return element.props.value
}

test("a sheet route closes itself after a close request and reports when it is gone", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const events: string[] = []
  const requestId = registry.open("report", { targetUserId: "x" }, () => events.push("opener told"))
  const route = loadSheetRoute(registry, requestId)
  const output = route.render()
  const presentation = findPresentation(output)

  presentation.setDismissible(false)
  assert.deepEqual(route.options.at(-1), { gestureEnabled: false })

  presentation.close(() => events.push("leave screen"))
  route.runtime.rerender()
  assert.deepEqual(route.goBacks, ["sheet"])
  assert.deepEqual(events, [], "nothing runs while the sheet is still on screen")

  route.runtime.unmount()
  assert.deepEqual(events, ["opener told", "leave screen"])
})

test("a restored sheet route without a live request closes itself", () => {
  const registry = createNativeSheetRegistry(idFactory())
  const route = loadSheetRoute(registry, "request-from-a-previous-launch")
  const output = route.render()
  assert.equal(output, null)
  assert.deepEqual(route.goBacks, ["sheet"])
})

test("leaving a chat with a report sheet over it removes the chat and the sheet together", () => {
  const router = StackRouter({})
  let state = {
    stale: false as const,
    type: "stack" as const,
    key: "root",
    index: 2,
    routeNames: ["Lobby", "ChatThread", "NativeSheet"],
    preloadedRoutes: [],
    routes: [
      { key: "lobby", name: "Lobby" },
      { key: "chat", name: "ChatThread", params: { threadId: "t" } },
      { key: "sheet", name: "NativeSheet", params: { sheet: "report", requestId: "r" } }
    ]
  }
  const navigationRef = {
    isReady: () => true,
    getRootState: () => state,
    getCurrentRoute: () => state.routes[state.index],
    goBack: () => assert.fail("must pop the chat, not the top route"),
    dispatch: (action: Parameters<typeof router.getStateForAction>[1]) => {
      const next = router.getStateForAction(state, action, {
        routeNames: state.routeNames,
        routeParamList: {},
        routeGetIdList: {}
      })
      assert.ok(next, "the pop must be handled")
      state = next as typeof state
    }
  }
  const beneath = loadSourceWithFakeReact<{
    getRootRouteBeneathSheets: () => { name: string } | undefined
    popRootRouteBeneathSheets: () => void
  }>("navigation/nativeSheets/rootRouteBeneathSheets.ts", createFakeReactRuntime(), {
    modules: {
      "@react-navigation/native": { StackActions },
      "../rootNavigationRef": { navigationRef },
      "./nativeSheetModel": model
    }
  })
  assert.equal(beneath.getRootRouteBeneathSheets()?.name, "ChatThread")
  beneath.popRootRouteBeneathSheets()
  assert.deepEqual(state.routes.map((route) => route.name), ["Lobby"])
})
