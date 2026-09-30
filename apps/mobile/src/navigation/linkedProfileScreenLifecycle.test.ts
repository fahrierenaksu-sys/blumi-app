import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// Characterizes LinkedProfileScreen's profile request lifecycle: one request per
// target, aborted on target change, and never restarted by a locale change.
function mount(options: { demoMode?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  let locale = "en"
  const requests: { userId: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = []
  class DiscoveryProfileUnavailableError extends Error {}
  const { LinkedProfileScreen } = loadSourceWithFakeReact<{ LinkedProfileScreen: (props: unknown) => any }>(
    "navigation/LinkedProfileScreen.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
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
            deepLinkHeadline: `headline:${current}`
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
    route: { params: { userId } },
    sessionActor: {},
    sessionToken: "token"
  }))
  return {
    runtime,
    requests,
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
  const output = f.render() as { type: unknown; props: { profileOverride: Record<string, unknown> } }
  assert.equal(output.type, "ProfilePreviewScreen")
  assert.equal(output.props.profileOverride.headline, "discover:tr")
  assert.equal(output.props.profileOverride.distanceLabel, "available:tr")
  assert.equal(f.requests.length, 0)
})
