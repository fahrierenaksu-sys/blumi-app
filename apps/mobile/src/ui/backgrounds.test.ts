import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import type { SoftBlobVariant } from "./ambientMotionModel"

type Element = { type: unknown; props: Record<string, unknown>; key?: unknown }

/** Execute the actual background and its blob children; native views remain data. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return node
  const element = node as Element
  if (typeof element.type === "function") return expand(element.type(element.props))
  return { ...element, props: { ...element.props, children: expand(element.props.children) } }
}

function load(options: { forbidMotion?: boolean; reduceMotion?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const native = createReactNativeStub()
  const reanimated = createReanimatedStub(runtime)
  let focused = true
  let reduceMotion = options.reduceMotion ?? false
  const listeners = new Map<string, Set<() => void>>()
  const failMotion = () => assert.fail("a static background must install no motion hooks or listeners")
  const navigation = {
    isFocused: () => focused,
    addListener: (type: string, listener: () => void) => {
      if (options.forbidMotion) failMotion()
      let subscribers = listeners.get(type)
      if (!subscribers) listeners.set(type, subscribers = new Set())
      subscribers.add(listener)
      return () => { subscribers.delete(listener) }
    }
  }
  if (options.forbidMotion) {
    reanimated.module.useSharedValue = failMotion
    reanimated.module.useAnimatedStyle = failMotion
    ;(native.module.AppState as { addEventListener: unknown }).addEventListener = failMotion
  }
  const source = loadSourceWithFakeReact<{
    SoftBlobBackground: (props: { variant?: SoftBlobVariant; animated?: boolean; style?: unknown }) => unknown
  }>("ui/backgrounds.tsx", runtime, {
    modules: {
      "@react-navigation/native": { NavigationContext: { currentValue: navigation } },
      "react-native": native.module,
      "react-native-reanimated": reanimated.module,
      "./animations": { useReducedMotion: () => options.forbidMotion ? failMotion() : reduceMotion },
      "./linearGradient": { LinearGradient: "LinearGradient" },
      "./HomeLiquidBackground": { HomeLiquidBackground: "HomeLiquidBackground" },
      "../../assets/ui/register-blush-to-white-background-v1.png": "register-background"
    },
    real: ["./theme", "./ambientMotionModel"]
  })
  return {
    runtime,
    native,
    reanimated,
    render(props: Parameters<typeof source.SoftBlobBackground>[0]) {
      return runtime.render(() => expand(source.SoftBlobBackground(props)))
    },
    setFocused(next: boolean) {
      focused = next
      for (const listener of listeners.get(next ? "focus" : "blur") ?? []) listener()
    },
    setReduceMotion(next: boolean) {
      reduceMotion = next
      runtime.rerender()
    },
    hasNavigationSubscriptions: () => [...listeners.values()].some((subscribers) => subscribers.size > 0)
  }
}

function nativeViews(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nativeViews)
  if (!node || typeof node !== "object" || !("props" in node)) return []
  const element = node as Element
  return [element, ...nativeViews(element.props.children)]
}

/** Ignore only the native/animated wrapper and the identity scale transform. */
function restingArtwork(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(restingArtwork)
  if (!node || typeof node !== "object" || !("props" in node)) return node
  const element = node as Element
  const flatten = (style: unknown): Record<string, unknown> => {
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
    return style && typeof style === "object" ? style as Record<string, unknown> : {}
  }
  const style = flatten(element.props.style)
  if (style.transform) {
    assert.deepEqual(style.transform, [{ scale: 1 }], "only an identity transform may differ")
    delete style.transform
  }
  return {
    ...element,
    type: element.type === "Animated.View" ? "View" : element.type,
    props: { ...element.props, style, children: restingArtwork(element.props.children) }
  }
}

test("animated=false renders native blob views without any motion hooks or visibility subscriptions", () => {
  const background = load({ forbidMotion: true })
  const result = background.render({ variant: "lobby", animated: false })
  assert.ok(nativeViews(result).some((element) => element.props.shouldRasterizeIOS === true))
  assert.ok(nativeViews(result).every((element) => element.type !== "Animated.View"))
  assert.equal(background.hasNavigationSubscriptions(), false)
  assert.equal(background.native.appStateListenerCount(), 0)
  background.runtime.rerender()
  background.runtime.unmount()
})

test("the animated path keeps its visible-foreground drift and pauses for focus, background and Reduce Motion", () => {
  const background = load()
  background.render({ variant: "lobby", animated: true })
  const hasNewLoop = (since: number) => background.reanimated.calls.slice(since)
    .some((call) => call.kind === "withRepeat" && call.config?.count === -1)
  assert.ok(hasNewLoop(0))
  const assertPaused = () => {
    const blobs = nativeViews(background.runtime.output).filter((element) => element.type === "Animated.View")
    assert.ok(blobs.length > 0)
    for (const blob of blobs) {
      const styles = blob.props.style as Record<string, unknown>[]
      assert.deepEqual(styles.at(-1)?.transform, [{ scale: 1 }])
    }
  }
  let previous = background.reanimated.calls.length
  background.setFocused(false)
  assertPaused()
  assert.equal(hasNewLoop(previous), false)
  background.setFocused(true)
  assert.ok(hasNewLoop(previous))
  previous = background.reanimated.calls.length
  background.native.emitAppState("background")
  assertPaused()
  assert.equal(hasNewLoop(previous), false)
  background.native.emitAppState("active")
  assert.ok(hasNewLoop(previous))
  previous = background.reanimated.calls.length
  background.setReduceMotion(true)
  assertPaused()
  assert.equal(hasNewLoop(previous), false)
  background.setReduceMotion(false)
  assert.ok(hasNewLoop(previous))
  background.runtime.unmount()
  assert.equal(background.hasNavigationSubscriptions(), false)
  assert.equal(background.native.appStateListenerCount(), 0)
})

test("the native static path draws the same resting artwork and caller style across every background variant", () => {
  for (const variant of ["lobby", "bootstrap", "miniRoom", "register", "premiumMesh", "homeLiquid"] as const) {
    const props = { variant, style: { zIndex: 2 } }
    const staticBackground = load({ forbidMotion: true })
    const animatedBackground = load({ reduceMotion: true })
    const staticResult = staticBackground.render({ ...props, animated: false })
    const pausedResult = animatedBackground.render(props)
    assert.deepEqual(restingArtwork(staticResult), restingArtwork(pausedResult))
    staticBackground.runtime.unmount()
    animatedBackground.runtime.unmount()
  }
})
