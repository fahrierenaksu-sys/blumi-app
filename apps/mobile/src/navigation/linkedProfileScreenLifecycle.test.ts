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

// Timers the test advances by hand (the skeleton delay, the push fallback).
function createFakeTimers() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; run: () => void }>()
  return {
    setTimeout: (run: () => void, ms = 0) => {
      const id = nextId++
      timers.set(id, { at: now + ms, run })
      return id
    },
    clearTimeout: (id: number) => { timers.delete(id) },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now || !timers.has(id)) continue
        timers.delete(id)
        timer.run()
      }
    }
  }
}

// One profile cache per test file run, shared by every mount like the app's
// module: a test that fills it reuses the same viewer with its own user ids.
const cacheRuntime = createFakeReactRuntime()
const profileCache = loadSourceWithFakeReact<Record<string, unknown>>(
  "features/discovery/discoverProfileCache.ts",
  cacheRuntime
)

function mount(options: { demoMode?: boolean; directProfile?: Record<string, unknown>; reduceMotion?: boolean; userId?: string } = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const timers = createFakeTimers()
  const timerGlobals = { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout }
  const transitionListeners = new Set<(event: { data?: { closing?: boolean } }) => void>()
  const navigation = {
    navigate: () => undefined,
    addListener: (_type: string, listener: (event: { data?: { closing?: boolean } }) => void) => {
      transitionListeners.add(listener)
      return () => { transitionListeners.delete(listener) }
    }
  }
  let locale = "en"
  const requests: { userId: string; signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = []
  class DiscoveryProfileUnavailableError extends Error {}
  const delayedSkeleton = loadSourceWithFakeReact("ui/useDelayedSkeleton.ts", runtime, { globals: timerGlobals })
  const afterPush = loadSourceWithFakeReact("navigation/useAfterPushTransition.ts", runtime, { globals: timerGlobals })
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
        "../ui/PressableScale": { PressableScale: "PressableScale" },
        "../features/avatarV2/candidateAvatarSnapshot": {
          createCandidateAvatarSnapshot: (input: { userId: string }) => ({ snapshotFor: input.userId })
        },
        "../features/demo/dummyProfiles": {
          DUMMY_PROFILES: [{ userId: "demo-1", displayName: "Demo", age: 24, bio: "Hello" }]
        },
        "../features/discovery/discoveryApi": {
          DiscoveryProfileUnavailableError,
          fetchDiscoverProfile: (_url: string, _token: string, userId: string, _fetch: unknown, signal: AbortSignal) =>
            new Promise((resolve, reject) => { requests.push({ userId, signal, resolve, reject }) })
        },
        "../features/discovery/discoverProfileCache": profileCache,
        "../ui/useDelayedSkeleton": delayedSkeleton,
        "./useAfterPushTransition": afterPush,
        // A fresh copy object per call, as a locale-aware copy lookup may return.
        "../features/discovery/profilePreviewCopy": {
          getProfilePreviewCopy: (current: string) => ({
            discoverProfile: `discover:${current}`,
            availableNow: `available:${current}`,
            loading: `loading:${current}`
          })
        },
        "../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../screens/ProfilePreviewScreen": {
          ProfilePreviewScreen: "ProfilePreviewScreen",
          toProfilePreviewPrompts: (prompts: unknown[] | undefined) => (prompts ?? []).map(() => "prompt")
        },
        "../features/session/appLocale": { getAppLocale: () => locale },
        "../ui/theme": { uiTheme: { colors: {}, spacing: {}, font: {}, radius: {} } }
      },
      real: ["./linkedProfileResolutionModel"]
    }
  )
  let userId = options.userId ?? (options.demoMode ? "demo-1" : "remote-1")
  const render = () => runtime.render(() => LinkedProfileScreen({
    demoMode: options.demoMode === true,
    navigation,
    route: { params: options.directProfile ? { profile: options.directProfile } : { userId } },
    sessionActor: {
      profile: {
        userId: "viewer-1",
        displayName: "Viewer",
        age: 27,
        bio: "Hello from me",
        interests: ["Tea"],
        prompts: [{ promptId: "small_joy", answer: "Rain" }],
        avatar: {}
      }
    },
    sessionToken: "token"
  }))
  return {
    runtime,
    requests,
    UnavailableError: DiscoveryProfileUnavailableError,
    timers,
    endPush: () => { for (const listener of [...transitionListeners]) listener({ data: { closing: false } }) },
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
  const content = f.render() as Element
  // It resolved before the skeleton delay, so it is simply there (no fade).
  assert.equal(content.type, "ProfilePreviewScreen")
  assert.equal(content.props.profileOverride.distanceLabel, "available:tr")
  assert.equal("headline" in content.props.profileOverride, false)
  assert.equal("vibeLine" in content.props.profileOverride, false)
  assert.equal(f.requests.length, 0)
})

test("a direct profile renders at once, without the loading reveal", () => {
  const f = mount({ directProfile: { userId: "direct-1", displayName: "Direct" } })
  const output = f.render() as Element
  assert.equal(output.type, "ProfilePreviewScreen")
  assert.equal(output.props.profileOverride.userId, "direct-1")
  assert.equal(f.requests.length, 0)
})

test("the viewer's own profile renders from the session at once, without a request", () => {
  const f = mount({ userId: "viewer-1" })
  const output = f.render() as Element
  assert.equal(output.type, "ProfilePreviewScreen")
  const profile = output.props.profileOverride
  assert.equal(profile.isSelf, true)
  assert.equal(profile.decisionCapability, "unavailable")
  assert.equal(profile.bio, "Hello from me")
  assert.deepEqual(profile.tags, ["Tea"])
  assert.deepEqual(profile.prompts, ["prompt"])
  assert.equal(profile.distanceLabel, "")
  assert.deepEqual(profile.avatarSnapshot, { snapshotFor: "viewer-1" })
  // Re-renders rebuild the profile but never start a request.
  f.render()
  assert.equal(f.requests.length, 0)
})

function remoteResponse(userId: string, displayName: string) {
  return {
    profile: { userId, displayName, age: 25, vibeTags: [], bio: "", prompts: [], distanceLabel: "near" },
    decision: { capability: "mutual-like" }
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

test("a pending deep link shows the plain page first and the skeleton only after the delay", () => {
  const f = mount()
  const first = f.render() as Element
  assert.notEqual(first.type, f.LoadingProfile, "no placeholder flashes for a fast load")
  f.timers.advance(299)
  assert.notEqual((f.runtime.output as Element | undefined)?.type, f.LoadingProfile)
  f.timers.advance(1)
  assert.equal((f.runtime.output as Element).type, f.LoadingProfile)
})

test("a profile that replaces the skeleton fades in; one that beat the delay is simply there", async () => {
  const slow = mount({ userId: "slow-1" })
  slow.render()
  slow.timers.advance(300)
  slow.requests[0].resolve(remoteResponse("slow-1", "Slow"))
  await flushPromises()
  assert.equal(((slow.runtime.output as Element).type as { name?: string }).name, "LinkedProfileReveal")

  const fast = mount({ userId: "fast-1" })
  fast.render()
  fast.requests[0].resolve(remoteResponse("fast-1", "Fast"))
  await flushPromises()
  const output = fast.runtime.output as Element
  assert.equal(output.type, "ProfilePreviewScreen")
  assert.equal(output.props.profileOverride.displayName, "Fast")
})

test("a profile loaded before opens on the push's first frame and refreshes only after the push", async () => {
  const first = mount({ userId: "cached-1" })
  first.render()
  first.requests[0].resolve(remoteResponse("cached-1", "Before"))
  await flushPromises()
  first.runtime.unmount()

  const again = mount({ userId: "cached-1" })
  const output = again.render() as Element
  assert.equal(output.type, "ProfilePreviewScreen")
  assert.equal(output.props.profileOverride.displayName, "Before")
  assert.equal(again.requests.length, 0, "nothing competes with the push")
  again.endPush()
  assert.equal(again.requests.length, 1)
  again.requests[0].resolve(remoteResponse("cached-1", "After"))
  await flushPromises()
  assert.equal((again.runtime.output as Element).props.profileOverride.displayName, "After")
})

test("a failed refresh keeps the cached profile; an unavailable one is dropped from the cache", async () => {
  const seed = mount({ userId: "cached-2" })
  seed.render()
  seed.requests[0].resolve(remoteResponse("cached-2", "Kept"))
  await flushPromises()
  seed.runtime.unmount()

  const offline = mount({ userId: "cached-2" })
  offline.render()
  offline.timers.advance(600)
  offline.requests[0].reject(new Error("offline"))
  await flushPromises()
  assert.equal((offline.runtime.output as Element).props.profileOverride.displayName, "Kept")
  offline.runtime.unmount()

  const gone = mount({ userId: "cached-2" })
  gone.render()
  gone.endPush()
  gone.requests[0].reject(new gone.UnavailableError("gone"))
  await flushPromises()
  assert.notEqual((gone.runtime.output as Element).type, "ProfilePreviewScreen")
  gone.runtime.unmount()

  const after = mount({ userId: "cached-2" })
  assert.notEqual((after.render() as Element).type, "ProfilePreviewScreen", "the dropped profile is not drawn again")
  assert.equal(after.requests.length, 1, "with nothing cached the request starts at once")
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
