import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type { UseSessionStateResult } from "./useSessionState"

// Characterizes useSessionState's lifecycle: session restore and the
// foreground listener run once per mount, their coordinators are torn down
// only on unmount, and action callbacks keep their identity across re-renders.
function mount() {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub()
  const calls: string[] = []
  const actor = {
    session: { mode: "demo", userId: "user-a", sessionToken: "demo-token", onboarding: {} },
    profile: { userId: "user-a", displayName: "Ada" }
  }
  const { useSessionState } = loadSourceWithFakeReact<{ useSessionState: () => UseSessionStateResult }>(
    "features/session/useSessionState.ts",
    runtime,
    {
      modules: {
        "react-native": reactNative.module,
        "../../config/env": {
          IS_BLUMI_DEMO_ENABLED: true,
          IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET: false,
          MOBILE_HTTP_BASE_URL: "https://fixture.invalid"
        },
        "../../analytics/productAnalytics": { captureProductEvent: () => undefined },
        "./sessionStorage": {
          loadSessionActor: async () => { calls.push("loadSessionActor"); return actor },
          loadHasSeenIntro: async () => { calls.push("loadHasSeenIntro"); return true },
          clearSessionActor: async () => undefined,
          resetNativeUiTestSessionState: async () => undefined,
          saveHasSeenIntro: async () => undefined,
          saveSessionActor: async () => undefined
        },
        "./sessionRefresh": {
          createSessionRefreshCoordinator: () => {
            calls.push("createRefreshCoordinator")
            return {
              refresh: async (current: unknown) => current,
              cancelAndWait: async () => { calls.push("cancelRefresh") }
            }
          },
          isSessionRefreshCancelled: () => false,
          refreshAndPersistSession: async () => { throw new Error("unused") },
          shouldRefreshSessionSoon: () => false
        },
        "../capabilities/capabilityApi": {
          createCapabilityResolutionSingleFlight: (read: unknown) => { calls.push("createCapabilityRead"); return read },
          createFailClosedCapabilityResolution: () => ({ capabilities: {} }),
          getSessionScopedCapabilities: (_token: unknown, state: { capabilities: unknown }) => state.capabilities,
          resolveProductionCapabilities: async () => ({ capabilities: {} }),
          SUPPORTED_MOBILE_CAPABILITIES: []
        },
        "./sessionModel": {
          isOnboardingComplete: () => false,
          shouldApplyProductionAccountSync: () => true
        },
        "../referrals/referralCaptureSignal": { subscribeToPendingReferralCapture: () => () => undefined }
      },
      real: ["./sessionMutationCoordinator"],
      inertUnknown: true
    }
  )
  const render = () => runtime.render(() => useSessionState())
  const result = () => runtime.output as UseSessionStateResult
  return { runtime, reactNative, calls, render, result }
}

const settle = async () => {
  for (let index = 0; index < 4; index += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

test("session restore and the foreground listener run once per mount", async () => {
  const f = mount()
  f.render()
  await settle()
  assert.equal(f.result().isHydrating, false)
  assert.equal(f.result().sessionActor?.profile.userId, "user-a")
  f.runtime.rerender()
  f.result().clearErrorMessage()
  f.runtime.rerender()
  await settle()
  assert.deepEqual(f.calls, ["createRefreshCoordinator", "createCapabilityRead", "loadSessionActor", "loadHasSeenIntro"])
  assert.equal(f.reactNative.appStateListenerCount(), 1)
  f.runtime.unmount()
  assert.deepEqual(f.calls.slice(4), ["cancelRefresh"])
  assert.equal(f.reactNative.appStateListenerCount(), 0)
})

test("session actions keep their identity across re-renders of the same session", async () => {
  const f = mount()
  f.render()
  await settle()
  const first = f.result()
  f.runtime.rerender()
  const second = f.result()
  for (const name of [
    "registerSessionActor",
    "registerSessionActorWithDraft",
    "updateSessionProfile",
    "completeProfileSetup",
    "saveAvatarSelectionOutcome",
    "saveAvatarSelection",
    "refreshAccountModeration",
    "clearSessionActor"
  ] as const) {
    assert.equal(second[name], first[name], `${name} identity`)
  }
})
