import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import * as onboardingCompletion from "./onboardingCompletion"
import * as onboardingFlowModel from "./onboardingFlowModel"
import * as initialProfileAvatar from "./initialProfileAvatar"
import * as sessionApi from "./sessionApi"
import * as sessionLifecycle from "./sessionLifecycle"
import * as sessionModel from "./sessionModel"
import { createDemoSessionActor, type SessionActor } from "./sessionModel"
import * as sessionMutationCoordinator from "./sessionMutationCoordinator"
import * as sessionRefresh from "./sessionRefresh"
import type { UseSessionStateResult } from "./useSessionState"

// Mounts the real useSessionState hook and drives restore, foreground refresh,
// logout, login and profile/avatar/room actions through its own API. Only the
// network and storage boundaries are replaced, with deferred promises, so the
// interleavings are deterministic. The guarantee: a late response after
// unmount, logout or another login never writes or publishes, the newest
// mutation wins, and rotated credentials survive.

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

function productionActor(userId: string, token: string): SessionActor {
  const demo = createDemoSessionActor({ displayName: `User ${userId}`, age: 24 })
  return {
    ...demo,
    session: { ...demo.session, mode: "production", userId, sessionToken: token },
    profile: { ...demo.profile, userId }
  }
}

const AUTH_EXPIRED = "Sign in again to continue."

interface MountOptions {
  /** The first account snapshot request fails with an expired-session error. */
  recover?: boolean
  /** shouldRefreshSessionSoon starts true (startup refresh). */
  refreshSoon?: boolean
  /** clearSessionActor storage waits until `clearing` resolves. */
  pauseClear?: boolean
  /** The first saveSessionActor call waits until `saveBarrier` resolves. */
  pauseSave?: boolean
}

function mount(options: MountOptions = {}) {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub()
  const actor = productionActor("user-a", "token-a")
  const rotated: SessionActor = { ...actor, session: { ...actor.session, sessionToken: "token-a-rotated" } }
  const snapshot = {
    profile: { ...actor.profile, displayName: "Server profile" },
    onboarding: { profile: "complete" as const, avatar: "incomplete" as const, room: "incomplete" as const },
    moderation: null
  }

  const profile = deferred<typeof snapshot>()
  const profileStarted = deferred<void>()
  const refresh = deferred<SessionActor>()
  const refreshStarted = deferred<void>()
  const clearing = deferred<void>()
  const clearStarted = deferred<void>()
  const saveBarrier = deferred<void>()
  const saveStarted = deferred<void>()
  let saveCalls = 0
  const network = { barrier: deferred<void>(), started: deferred<void>() }

  const saves: SessionActor[] = []
  const errors: unknown[] = []
  const clears: unknown[] = []
  const avatarSaves: unknown[] = []
  let stored: SessionActor | null = actor
  let refreshSoon = options.refreshSoon ?? false
  let profileCalls = 0
  let refreshCalls = 0
  let profileSignal: AbortSignal | undefined
  let refreshSignal: AbortSignal | undefined
  let nextLogin: SessionActor | null = null

  const pausedNetwork = async () => {
    network.started.resolve()
    await network.barrier.promise
  }

  const { useSessionState } = loadSourceWithFakeReact<{ useSessionState: () => UseSessionStateResult }>(
    "features/session/useSessionState.ts",
    runtime,
    {
      modules: {
        "react-native": reactNative.module,
        "@react-native-async-storage/async-storage": {},
        "../../config/env": {
          IS_BLUMI_DEMO_ENABLED: true,
          IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET: false,
          MOBILE_HTTP_BASE_URL: "https://fixture.invalid"
        },
        "../../analytics/productAnalytics": { captureProductEvent: () => undefined },
        "../discovery/discoveryFiltersModel": { loadLocalDiscoveryFiltersFallback: async () => undefined },
        "../discovery/discoveryFirstFrameAssets": { warmDiscoveryFirstFrameAssets: async () => undefined },
        "../avatarV2/avatarApi": {
          saveProductionAvatar: async () => {
            avatarSaves.push("save")
            await pausedNetwork()
            return { kind: "updated", selection: { presetId: "sunset", revision: 1, loadout: {} } }
          }
        },
        "../avatarV2/avatarV2Catalog": { AVATAR_V2_CATALOG: [] },
        "../avatarV2/avatarV2Persistence": { resolveInitialAvatarV2: () => ({}) },
        "../avatarV2/avatarSelectionModel": {
          normalizeCompleteAvatarSelection: () => null,
          userAvatarToLoadout: () => ({})
        },
        "../capabilities/capabilityApi": {
          createCapabilityResolutionSingleFlight: (read: unknown) => read,
          createFailClosedCapabilityResolution: () => ({ capabilities: {} }),
          getSessionScopedCapabilities: (_token: unknown, state: { capabilities: unknown }) => state.capabilities,
          resolveProductionCapabilities: async () => ({ capabilities: {} }),
          SUPPORTED_MOBILE_CAPABILITIES: []
        },
        "../roomV2/personalRoomDecorApi": { savePersonalRoomDecorReplacingCurrent: async () => ({ kind: "saved" }) },
        "./sessionApi": {
          ...sessionApi,
          fetchProductionAccountSnapshot: async (_url: string, _token: string, _fetch: unknown, signal: AbortSignal) => {
            profileSignal = signal
            profileCalls += 1
            if (options.recover && profileCalls === 1) throw new Error(AUTH_EXPIRED)
            profileStarted.resolve()
            return profile.promise // Deliberately ignores abort to exercise late completions.
          },
          updateProductionProfile: async (_url: string, _token: string, input: { displayName: string }) => {
            await pausedNetwork()
            return { ...actor.profile, displayName: input.displayName }
          },
          completeProductionOnboardingStep: async () => {
            await pausedNetwork()
            return { profile: "complete", avatar: "complete", room: "complete" }
          },
          completeFirebaseAccount: async () => {
            assert.ok(nextLogin, "a test login needs an actor")
            return nextLogin
          },
          acknowledgeAccountModeration: async () => null
        },
        "./sessionPushCleanup": { revokeProductionSessionAfterPushCleanup: async () => undefined },
        "./firebasePhoneAuth": {
          getVerifiedFirebasePhoneIdToken: async () => "fixture-id-token",
          confirmFirebasePhoneCode: async () => null,
          requestFirebasePhoneCode: async () => null,
          signOutFirebasePhoneAuth: async () => undefined
        },
        "./accountModeration": { needsModerationInterruption: () => false },
        "./sessionLifecycle": sessionLifecycle,
        "./sessionMutationCoordinator": sessionMutationCoordinator,
        "./initialProfileAvatar": initialProfileAvatar,
        "./onboardingFlowModel": onboardingFlowModel,
        "./onboardingCompletion": onboardingCompletion,
        "./sessionModel": sessionModel,
        "./sessionRefresh": {
          ...sessionRefresh,
          refreshAndPersistSession: async (_url: string, _actor: SessionActor, input: { signal: AbortSignal }) => {
            refreshCalls += 1
            refreshSignal = input.signal
            refreshStarted.resolve()
            return refresh.promise // Deliberately ignores abort to exercise late completions.
          },
          shouldRefreshSessionSoon: () => refreshSoon
        },
        "./sessionStorage": {
          loadSessionActor: async () => actor,
          loadHasSeenIntro: async () => true,
          clearSessionActor: async (mode: unknown) => {
            clears.push(mode)
            clearStarted.resolve()
            if (options.pauseClear) await clearing.promise
            stored = null
          },
          resetNativeUiTestSessionState: async () => undefined,
          saveHasSeenIntro: async () => undefined,
          saveSessionActor: async (next: SessionActor) => {
            saveCalls += 1
            if (options.pauseSave && saveCalls === 1) {
              saveStarted.resolve()
              await saveBarrier.promise
            }
            saves.push(next)
            stored = next
          }
        },
        "./preAuthOnboardingDraft": { replayPreAuthOnboardingDraft: async () => undefined },
        "./sessionPersistence": { getSecureSessionStorageRecoveryMessage: () => null },
        "./sessionErrorCopy": {
          getSessionErrorMessageForDisplay: (error: unknown) => {
            errors.push(error)
            return String(error)
          }
        },
        "../referrals/referralApi": { claimReferralInvite: async () => undefined },
        "../referrals/referralStorage": {
          clearPendingReferralCode: async () => undefined,
          loadPendingReferral: async () => null,
          savePendingReferral: async () => undefined
        },
        "../referrals/referralCaptureSignal": { subscribeToPendingReferralCapture: () => () => undefined },
        "../referrals/referralModel": {
          resolvePendingReferralClaim: () => ({ kind: "discard" }),
          shouldClaimCapturedReferral: () => false
        }
      }
    }
  )

  runtime.render(() => useSessionState())
  const result = () => runtime.output as UseSessionStateResult
  return {
    runtime, actor, rotated, snapshot, profile, profileStarted, refresh, refreshStarted,
    clearing, clearStarted, saveBarrier, saveStarted, network, saves, errors, clears, avatarSaves,
    result,
    current: () => result().sessionActor,
    stored: () => stored,
    profileSignal: () => profileSignal,
    refreshSignal: () => refreshSignal,
    profileCalls: () => profileCalls,
    refreshCalls: () => refreshCalls,
    appStateListeners: () => reactNative.appStateListenerCount(),
    /** Reads the hook's state after unmount without mounting it again. */
    peekAfterUnmount: () => (runtime.rerender() as UseSessionStateResult).sessionActor,
    foreground: () => {
      refreshSoon = true
      reactNative.emitAppState("background")
      reactNative.emitAppState("active")
    },
    login: async (next: SessionActor) => {
      nextLogin = next
      await result().registerSessionActor({ phoneNumber: "+900000000000", verificationCode: "000000" } as never)
    }
  }
}

for (const recover of [true, false]) {
  test(`startup profile publishes server state with latest credentials after ${recover ? "auth recovery" : "external rotation"}`, async () => {
    const f = mount({ recover })
    if (recover) {
      await f.refreshStarted.promise
      f.refresh.resolve(f.rotated)
    } else {
      await f.profileStarted.promise
      f.foreground()
      await f.refreshStarted.promise
      f.refresh.resolve(f.rotated)
      await settle()
    }
    await f.profileStarted.promise
    f.profile.resolve(f.snapshot)
    await settle()

    assert.equal(f.current()?.session.sessionToken, f.rotated.session.sessionToken)
    assert.equal(f.stored()?.session.sessionToken, f.rotated.session.sessionToken)
    assert.equal(f.current()?.profile.displayName, f.snapshot.profile.displayName)
    assert.deepEqual(f.current()?.session.onboarding, f.snapshot.onboarding)
    assert.deepEqual(f.stored()?.session.onboarding, f.snapshot.onboarding)
    assert.ok(f.saves.length >= 1)
    assert.ok(f.saves.every((saved) => saved.session.sessionToken === f.rotated.session.sessionToken))
    assert.deepEqual(f.errors, [])
    f.runtime.unmount()
  })
}

test("startup profile resolving after unmount cannot save, publish or report errors", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.runtime.unmount()
  assert.ok(f.profileSignal()?.aborted)
  f.profile.resolve(f.snapshot)
  await settle()
  assert.equal(f.saves.length, 0)
  assert.deepEqual(f.errors, [])
  assert.equal(f.peekAfterUnmount()?.profile.displayName, f.actor.profile.displayName)
})

test("startup profile queued behind persistence cannot save or publish after unmount", async () => {
  const f = mount({ pauseSave: true })
  await f.profileStarted.promise
  // A foreground credential rotation holds the persistence queue.
  f.foreground()
  await f.refreshStarted.promise
  f.refresh.resolve(f.rotated)
  await f.saveStarted.promise
  f.profile.resolve(f.snapshot)
  await settle()
  f.runtime.unmount()
  f.saveBarrier.resolve()
  await settle()
  assert.ok(f.saves.every((saved) => saved.profile.displayName !== f.snapshot.profile.displayName))
  assert.notEqual(f.stored()?.profile.displayName, f.snapshot.profile.displayName)
  assert.notEqual(f.peekAfterUnmount()?.profile.displayName, f.snapshot.profile.displayName)
  assert.ok(f.profileSignal()?.aborted)
})

test("startup profile late rejection after unmount cannot start auth recovery", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.runtime.unmount()
  f.profile.reject(new Error(AUTH_EXPIRED))
  await settle()
  assert.equal(f.refreshCalls(), 0)
  assert.equal(f.saves.length, 0)
  assert.deepEqual(f.clears, [])
  assert.deepEqual(f.errors, [])
})

test("startup profile cannot replace a newer user edit", async () => {
  const f = mount()
  await f.profileStarted.promise
  const editing = f.result().updateSessionProfile({ displayName: "Newer edit" })
  // The edit aborts the startup sync; its late snapshot must not win.
  f.profile.resolve(f.snapshot)
  await f.network.started.promise
  f.network.barrier.resolve()
  await editing
  await settle()
  assert.equal(f.current()?.profile.displayName, "Newer edit")
  assert.equal(f.stored()?.profile.displayName, "Newer edit")
  assert.equal(f.saves.length, 1)
  f.runtime.unmount()
})

test("a profile save never writes the avatar body", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.profile.resolve(f.snapshot)
  await settle()
  f.network.barrier.resolve()
  await f.result().updateSessionProfile({ displayName: "Renamed" })
  assert.equal(f.current()?.profile.displayName, "Renamed")
  assert.deepEqual(f.avatarSaves, [])
  f.runtime.unmount()
})

test("foreground refresh late failure after unmount cannot publish errors or clear storage", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.foreground()
  await f.refreshStarted.promise
  f.runtime.unmount()
  f.refresh.reject(new Error(AUTH_EXPIRED))
  f.profile.resolve(f.snapshot)
  await settle()
  assert.equal(f.saves.length, 0)
  assert.deepEqual(f.clears, [])
  assert.deepEqual(f.errors, [])
  assert.deepEqual(f.stored(), f.actor)
})

test("startup auth clear already in progress cannot publish after unmount", async () => {
  const f = mount({ recover: true, pauseClear: true })
  await f.refreshStarted.promise
  f.refresh.reject(new Error(AUTH_EXPIRED))
  await f.clearStarted.promise
  f.runtime.unmount()
  f.clearing.resolve()
  await settle()
  assert.equal(f.saves.length, 0)
  assert.deepEqual(f.errors, [])
  assert.equal(f.peekAfterUnmount()?.session.userId, f.actor.session.userId)
})

for (const foreground of [false, true]) {
  test(`${foreground ? "foreground" : "startup"} refresh cannot persist or publish after unmount`, async () => {
    const f = mount({ refreshSoon: !foreground })
    if (foreground) {
      await f.profileStarted.promise
      f.foreground()
    }
    await f.refreshStarted.promise
    f.runtime.unmount()
    assert.ok(f.refreshSignal()?.aborted)
    assert.equal(f.appStateListeners(), 0)
    f.refresh.resolve(f.rotated)
    f.profile.resolve(f.snapshot)
    await settle()
    assert.equal(f.saves.length, 0)
    assert.deepEqual(f.errors, [])
    assert.equal(f.peekAfterUnmount()?.session.sessionToken, f.actor.session.sessionToken)
  })
}

const lateActions: Record<string, (session: UseSessionStateResult) => Promise<unknown>> = {
  updateSessionProfile: (session) => session.updateSessionProfile({ displayName: "Late edit" }),
  saveAvatarSelectionOutcome: (session) => session.saveAvatarSelectionOutcome({} as never),
  completeAvatarSetup: (session) => session.completeAvatarSetup({} as never),
  completeRoomSetup: (session) => session.completeRoomSetup()
}

const relogins = [
  { label: "another login", userId: "user-b", token: "token-b" },
  { label: "a new login of the same user", userId: "user-a", token: "token-a-new-login" }
]

for (const [name, run] of Object.entries(lateActions)) for (const relogin of relogins) {
  test(`${name}: late network response cannot write after logout and ${relogin.label}`, async () => {
    const f = mount()
    await f.profileStarted.promise
    f.profile.resolve(f.snapshot)
    await settle()
    const savesBefore = f.saves.length

    const action = run(f.result())
    const rejected = assert.rejects(action, /session changed/i)
    await f.network.started.promise

    await f.result().clearSessionActor()
    assert.equal(f.current(), null)
    assert.equal(f.stored(), null)
    const next = productionActor(relogin.userId, relogin.token)
    await f.login(next)
    assert.equal(f.current()?.session.sessionToken, relogin.token)

    f.network.barrier.resolve()
    await rejected
    await settle()
    assert.deepEqual(f.current(), next)
    assert.deepEqual(f.stored(), next)
    assert.ok(f.saves.slice(savesBefore).every((saved) => saved.session.sessionToken === relogin.token))
    f.runtime.unmount()
  })
}
