import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact,
  type FakeReactRuntime
} from "../../../testing/hookHarness"
import * as onboardingFlowModel from "../onboardingFlowModel"
import * as setupFlowShellModel from "./setupFlowShellModel"

// First-frame guarantees for the setup flow. Each test renders the real
// component or hook with passive effects disabled: what it shows then is
// what the first painted frame shows, so anything set up in a post-paint
// effect would fail here (the one-frame blank or wrong-step flash class).

type Element = { type: unknown; props: Record<string, any> }

function createFirstFrameRuntime(): FakeReactRuntime {
  const runtime = createFakeReactRuntime()
  runtime.react.useEffect = () => undefined
  return runtime
}

function findElements(node: unknown, matches: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, matches, found)
    return found
  }
  if (!node || typeof node !== "object" || !("props" in node)) return found
  const element = node as Element
  if (matches(element)) found.push(element)
  findElements(element.props?.children, matches, found)
  return found
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  return style && typeof style === "object" ? style as Record<string, unknown> : {}
}

function createReanimatedStub(runtime: FakeReactRuntime) {
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const timings: unknown[] = []
  const easing = () => (value: number) => value
  return {
    timings,
    module: {
      __esModule: true,
      default: { View: "Animated.View" },
      Easing: { out: easing, in: easing, inOut: easing, cubic: (value: number) => value },
      useSharedValue: <T>(initial: T) => {
        const ref = useRef<{ value: T } | null>(null)
        if (!ref.current) ref.current = { value: initial }
        return ref.current
      },
      useAnimatedStyle: (worklet: () => unknown) => worklet(),
      withTiming: (value: unknown) => { timings.push(value); return value },
      withSpring: (value: unknown) => value
    }
  }
}

// The shared entrance hook's first-frame guarantee (it starts before paint,
// and Reduce Motion never travels) is tested with the hook itself in
// src/ui/animations.test.ts.

test("the shared progress rail has the correct fill before its width is measured", () => {
  const runtime = createFirstFrameRuntime()
  const reanimated = createReanimatedStub(runtime)
  const { SetupFlowProgress } = loadSourceWithFakeReact<{
    SetupFlowProgress: (props: { current: 1 | 2 | 3 | 4; reduceMotion: boolean }) => Element
  }>("features/session/setupFlow/SetupFlowProgress.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated.module,
      "./setupFlowLocale": { getCurrentSetupFlowCopy: () => ({ stepProgress: () => "progress" }) }
    },
    inertUnknown: true
  })
  const fill = () => {
    const [element] = findElements(runtime.output, (element) => element.type === "Animated.View")
    return flattenStyle(element?.props.style)
  }

  let current: 1 | 2 | 3 | 4 = 2
  const rail = runtime.render(() => SetupFlowProgress({ current, reduceMotion: false }))
  assert.equal(fill().width, "50%", "unmeasured rail still shows the right fill")

  rail.props.onLayout({ nativeEvent: { layout: { width: 200 } } })
  runtime.rerender()
  assert.equal(fill().width, 100)

  current = 3
  runtime.rerender()
  // The animated style follows the shared value its layout effect just set.
  runtime.rerender()
  assert.equal(fill().width, 150)
})

test("deferred auth destinations render the real screen on their first frame", () => {
  const runtime = createFirstFrameRuntime()
  const { createDeferredScreen } = loadSourceWithFakeReact<{
    createDeferredScreen: (loader: () => unknown) => { DeferredScreen: (props: unknown) => Element; preload: () => unknown }
  }>("navigation/deferredScreenBundles.tsx", runtime, {
    modules: { "../screens/MyRoomScreen": {} },
    inertUnknown: true
  })
  let loads = 0
  const RealScreen = () => null
  const bundle = createDeferredScreen(() => { loads += 1; return RealScreen })

  const first = runtime.render(() => bundle.DeferredScreen({ step: "profile" }))
  assert.equal(first.type, RealScreen)
  assert.equal(first.props.step, "profile")
  runtime.rerender()
  assert.equal(bundle.preload(), RealScreen)
  assert.equal(loads, 1, "the screen module loads once and is reused")
})

function loadShell(runtime: FakeReactRuntime) {
  return loadSourceWithFakeReact<{
    BlumiSetupShell: (props: Record<string, unknown>) => Element
  }>("features/session/setupFlow/BlumiSetupShell.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({
        Keyboard: { addListener: () => ({ remove: () => undefined }) },
        KeyboardAvoidingView: "KeyboardAvoidingView"
      }).module,
      "../../../ui/animations": { useReducedMotion: () => false },
      "./setupFlowShellModel": setupFlowShellModel,
      "./setupFlowLocale": {
        getCurrentSetupFlowCopy: () => ({
          steps: new Proxy({}, { get: () => ({ title: "", description: "", primaryAction: "" }) })
        })
      }
    },
    inertUnknown: true
  })
}

test("reactivated setup layers reset their scroll position before paint", () => {
  const runtime = createFirstFrameRuntime()
  const { BlumiSetupShell } = loadShell(runtime)
  const scrolls: unknown[] = []
  let motionActive = false
  const props = () => ({ step: "avatar", onBack: () => undefined, onPrimaryAction: () => undefined, motionActive })

  runtime.render(() => BlumiSetupShell(props()))
  const [scrollView] = findElements(runtime.output, (element) => element.type === "ScrollView")
  assert.ok(scrollView, "the shell renders a scroll view")
  scrollView.props.ref.current = { scrollTo: (options: unknown) => { scrolls.push(options) } }
  assert.deepEqual(scrolls, [])

  motionActive = true
  runtime.rerender()
  assert.deepEqual(scrolls, [{ y: 0, animated: false }])
})

function loadPreAuthFlow(runtime: FakeReactRuntime) {
  const reanimated = createReanimatedStub(runtime)
  const exports = loadSourceWithFakeReact<{
    PreAuthSetupFlowScreen: (props: Record<string, unknown>) => Element
    PersistentStepLayer: (props: Record<string, unknown>) => Element
  }>("screens/PreAuthSetupFlowScreen.tsx", runtime, {
    modules: {
      "@react-navigation/native": { usePreventRemove: () => undefined },
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated.module,
      "../features/session/onboardingFlowModel": onboardingFlowModel,
      "../analytics/productAnalytics": { captureProductEvent: () => undefined },
      "../features/session/setupFlow/setupFlowLocale": {
        getCurrentSetupFlowCopy: () => ({ room: { continueAction: "Continue" } })
      },
      "../ui/animations": { useReducedMotionPreference: () => ({ reduceMotion: false, isResolved: true }) },
      "../ui/motion": { MOTION_SPRINGS: { snappy: {} } },
      "./AvatarSetupScreen": { AvatarSetupScreen: "AvatarSetupScreen" },
      "./ProfileSetupScreen": { ProfileSetupScreen: "ProfileSetupScreen" },
      "./RegisterScreen": { RegisterScreen: "RegisterScreen" },
      "./RoomSetupScreen": { RoomSetupScreen: "RoomSetupScreen" }
    }
  })
  return { ...exports, reanimated }
}

function activeScreen(runtime: FakeReactRuntime): string | undefined {
  const active = findElements(
    runtime.output,
    (element) => typeof element.type === "string" && element.type.endsWith("Screen") && element.props.motionActive === true
  )
  assert.ok(active.length <= 1, "only one setup step is active at a time")
  return active[0]?.type as string | undefined
}

test("pre-auth CTA shows the next setup step before draft persistence resolves", async () => {
  const runtime = createFirstFrameRuntime()
  const { PreAuthSetupFlowScreen } = loadPreAuthFlow(runtime)
  let releasePersistence!: () => void
  const persisted: string[] = []
  runtime.render(() => PreAuthSetupFlowScreen({
    navigation: { navigate: () => undefined, dispatch: () => undefined },
    initialStep: "profile",
    draft: {},
    isSubmitting: false,
    errorMessage: null,
    onPersistDraft: (_draft: unknown, step: string) => new Promise<void>((resolve) => {
      persisted.push(step)
      releasePersistence = resolve
    }),
    onClearDraft: async () => undefined,
    onRequestVerificationCode: async () => undefined,
    onRegister: async () => undefined,
    onClearError: () => undefined
  }))
  assert.equal(activeScreen(runtime), "ProfileSetupScreen")

  const [profile] = findElements(runtime.output, (element) => element.type === "ProfileSetupScreen")
  const completion = profile.props.onComplete({ displayName: "Ada" })
  assert.equal(activeScreen(runtime), "AvatarSetupScreen", "the next step is visible while storage is pending")
  const [avatar] = findElements(runtime.output, (element) => element.type === "AvatarSetupScreen")
  assert.equal(avatar.props.displayName, "Ada", "the optimistic draft feeds the next step")

  await Promise.resolve()
  assert.deepEqual(persisted, ["avatar"])
  releasePersistence()
  await completion
  assert.equal(activeScreen(runtime), "AvatarSetupScreen")
})

test("a repeated Whoa entry applies the requested setup step before paint", () => {
  const runtime = createFirstFrameRuntime()
  const { PreAuthSetupFlowScreen } = loadPreAuthFlow(runtime)
  let initialStep = "room"
  const render = () => runtime.render(() => PreAuthSetupFlowScreen({
    navigation: { navigate: () => undefined, dispatch: () => undefined },
    initialStep,
    draft: {},
    isSubmitting: false,
    errorMessage: null,
    onPersistDraft: async () => undefined,
    onClearDraft: async () => undefined,
    onRequestVerificationCode: async () => undefined,
    onRegister: async () => undefined,
    onClearError: () => undefined
  }))

  render()
  assert.equal(activeScreen(runtime), "RoomSetupScreen")
  initialStep = "profile"
  render()
  assert.equal(activeScreen(runtime), "ProfileSetupScreen")
})

test("persistent setup layers do not animate from an empty first frame", () => {
  const layerStyle = (props: Record<string, unknown>) => {
    const runtime = createFirstFrameRuntime()
    const { PersistentStepLayer, reanimated } = loadPreAuthFlow(runtime)
    const first = runtime.render(() => PersistentStepLayer({ children: null, ...props }))
    // A second render reads the shared values the layout phase left behind.
    const output = runtime.rerender() as Element
    return {
      first: flattenStyle(first.props.style),
      style: flattenStyle(output.props.style),
      timings: reanimated.timings
    }
  }

  const resumed = layerStyle({ direction: 0 })
  assert.equal(resumed.first.opacity, 1, "an already active layer is opaque on its first frame")
  assert.equal(resumed.style.opacity, 1)
  assert.deepEqual(resumed.timings, [])

  const hidden = layerStyle({ direction: 1 })
  assert.equal(hidden.style.opacity, 0)

  const entering = layerStyle({ direction: 0, animateOnMount: true })
  assert.deepEqual(entering.timings, [1], "a newly activated layer fades in from its first frame")

  const reduced = layerStyle({ direction: 1, reduceMotion: true })
  assert.deepEqual(flattenStyle(reduced.style).transform, [{ translateY: 0 }])
})
