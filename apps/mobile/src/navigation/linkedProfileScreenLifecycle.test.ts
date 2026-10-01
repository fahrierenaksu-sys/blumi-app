import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// Characterizes LinkedProfileScreen's profile request lifecycle: one request per
// target, aborted on target change, and never restarted by a locale change.
type Element = { type: unknown; props: Record<string, any> }

// Records the Reanimated calls the loading placeholder and reveal make.
function createReanimatedStub(runtime: ReturnType<typeof createFakeReactRuntime>) {
  const calls: { kind: string; args: unknown[] }[] = []
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const easing = () => (value: number) => value
  return {
    calls,
    module: {
      __esModule: true,
      default: { View: "Reanimated.View" },
      Easing: { inOut: easing, out: easing, ease: (value: number) => value, cubic: (value: number) => value },
      useSharedValue: (initial: number) => useRef({ value: initial }).current,
      useAnimatedStyle: (worklet: () => unknown) => worklet(),
      cancelAnimation: (...args: unknown[]) => { calls.push({ kind: "cancelAnimation", args }) },
      withTiming: (...args: unknown[]) => { calls.push({ kind: "withTiming", args }); return { timing: args[0] } },
      withRepeat: (...args: unknown[]) => { calls.push({ kind: "withRepeat", args }); return { repeat: args[0] } }
    }
  }
}

function mount(options: { demoMode?: boolean; directProfile?: Record<string, unknown>; reduceMotion?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  let locale = "en"
  const requests: { userId: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = []
  class DiscoveryProfileUnavailableError extends Error {}
  const { LinkedProfileScreen, LoadingProfile } = loadSourceWithFakeReact<{
    LinkedProfileScreen: (props: unknown) => any
    LoadingProfile: () => any
  }>(
    "navigation/LinkedProfileScreen.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": reanimated.module,
        "../ui/animations": { useReducedMotion: () => options.reduceMotion === true },
        "../features/avatarV2/candidateAvatarSnapshot": { createCandidateAvatarSnapshot: () => ({}) },
        "../features/demo/dummyProfiles": {
          DUMMY_PROFILES: [{ userId: "demo-1", displayName: "Demo", age: 24, bio: "Hello" }]
        },
        "../features/discovery/discoveryApi": {
          DiscoveryProfileUnavailableError,
          fetchDiscoverProfile: (_url: string, _token: string, userId: string, _fetch: unknown, signal: AbortSignal) =>
            new Promise((resolve) => { requests.push({ userId, signal, resolve }) })
        },
        // A fresh copy object per call, as a locale-aware copy lookup may return.
        "../features/discovery/profilePreviewCopy": {
          getProfilePreviewCopy: (current: string) => ({
            discoverProfile: `discover:${current}`,
            availableNow: `available:${current}`,
            deepLinkHeadline: `headline:${current}`,
            loading: `loading:${current}`
          })
        },
        "../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../screens/ProfilePreviewScreen": {
          ProfilePreviewScreen: "ProfilePreviewScreen",
          toProfilePreviewPrompts: () => []
        },
        "../features/session/appLocale": { getAppLocale: () => locale },
        "../ui/theme": { uiTheme: { colors: {}, spacing: {}, font: {}, radius: {} } }
      },
      real: ["./linkedProfileResolutionModel"]
    }
  )
  let userId = options.demoMode ? "demo-1" : "remote-1"
  const render = () => runtime.render(() => LinkedProfileScreen({
    demoMode: options.demoMode === true,
    navigation: { navigate: () => undefined },
    route: { params: options.directProfile ? { profile: options.directProfile } : { userId } },
    sessionActor: {},
    sessionToken: "token"
  }))
  return {
    runtime,
    requests,
    reanimated,
    LoadingProfile,
    render,
    setLocale: (next: string) => { locale = next },
    setUserId: (next: string) => { userId = next }
  }
}

test("a deep-linked profile is requested once; re-renders and locale changes do not refetch", () => {
  const f = mount()
  f.render()
  f.setLocale("tr")
  f.render()
  f.render()
  assert.deepEqual(f.requests.map(({ userId }) => userId), ["remote-1"])
  assert.equal(f.requests[0].signal.aborted, false)
})

test("a new target aborts the previous request and starts one for the new user", () => {
  const f = mount()
  f.render()
  f.setUserId("remote-2")
  f.render()
  assert.deepEqual(f.requests.map(({ userId }) => userId), ["remote-1", "remote-2"])
  assert.equal(f.requests[0].signal.aborted, true)
  f.runtime.unmount()
  assert.equal(f.requests[1].signal.aborted, true)
})

test("a demo profile resolves with the current locale's labels", () => {
  const f = mount({ demoMode: true })
  f.setLocale("tr")
  const output = f.render() as Element
  // A profile that arrives after loading is revealed by a fade wrapper.
  assert.equal((output.type as { name?: string }).name, "LinkedProfileReveal")
  const content = output.props.children as Element
  assert.equal(content.type, "ProfilePreviewScreen")
  assert.equal(content.props.profileOverride.headline, "discover:tr")
  assert.equal(content.props.profileOverride.distanceLabel, "available:tr")
  assert.equal(f.requests.length, 0)
})

test("a demo direct profile renders at once, without the loading reveal", () => {
  const f = mount({ demoMode: true, directProfile: { userId: "direct-1", displayName: "Direct" } })
  const output = f.render() as Element
  assert.equal(output.type, "ProfilePreviewScreen")
  assert.equal(output.props.profileOverride.userId, "direct-1")
  assert.equal(f.requests.length, 0)
})

test("a production card profile is read again so name, bio and preferences reflect the current account", async () => {
  const f = mount({ directProfile: { userId: "partner", displayName: "Eren", bio: "old", tags: ["old"] } })
  assert.equal((f.render() as Element).type, f.LoadingProfile)
  assert.deepEqual(f.requests.map(({ userId }) => userId), ["partner"])
  f.requests[0].resolve({ profile: { userId: "partner", displayName: "Irmak", age: 25,
    bio: "new", vibeTags: ["Bookish"], prompts: [], distanceLabel: "Nearby" }, decision: { capability: "mutual-like" } })
  await new Promise((resolve) => setImmediate(resolve))
  const content = (f.runtime.output as Element).props.children as Element
  assert.equal(content.props.profileOverride.displayName, "Irmak")
  assert.equal(content.props.profileOverride.bio, "new")
  assert.deepEqual(content.props.profileOverride.tags, ["Bookish"])
  f.runtime.unmount()
})

test("a pending deep link shows the loading placeholder until the profile resolves", () => {
  const f = mount()
  const output = f.render() as Element
  assert.equal(output.type, f.LoadingProfile)
})

function renderLoading(reduceMotion: boolean) {
  const f = mount({ reduceMotion })
  const tree = f.runtime.render(() => f.LoadingProfile()) as Element
  return { f, tree }
}

test("the loading placeholder is one progress element labelled by the loading copy", () => {
  const { tree } = renderLoading(false)
  assert.equal(tree.props.accessible, true)
  assert.equal(tree.props.accessibilityRole, "progressbar")
  assert.equal(tree.props.accessibilityLabel, "loading:en")
  assert.deepEqual(tree.props.accessibilityState, { busy: true })
  const [skeleton, label] = tree.props.children as Element[]
  assert.equal(skeleton.props.accessibilityElementsHidden, true)
  assert.equal(skeleton.props.importantForAccessibility, "no-hide-descendants")
  assert.equal(label.props.children, "loading:en")
})

test("the skeleton pulses on the UI thread, and stays static with Reduce Motion", () => {
  const animated = renderLoading(false)
  assert.deepEqual(
    animated.f.reanimated.calls.filter(({ kind }) => kind === "withRepeat").map(({ args }) => args.slice(1)),
    [[-1, true]]
  )
  animated.f.runtime.unmount()
  assert.ok(animated.f.reanimated.calls.some(({ kind }) => kind === "cancelAnimation"))

  const reduced = renderLoading(true)
  assert.equal(reduced.f.reanimated.calls.some(({ kind }) => kind === "withRepeat"), false)
  const skeleton = (reduced.tree.props.children as Element[])[0]
  const pulseStyle = (skeleton.props.style as Record<string, unknown>[]).at(-1)
  assert.deepEqual(pulseStyle, { opacity: 1 })
})
