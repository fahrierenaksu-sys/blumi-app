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
import * as apiRequestError from "../network/apiRequestError"
import * as sensitiveReauthGate from "./sensitiveReauthGate"
import * as preAuthOnboardingDraft from "./preAuthOnboardingDraft"
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
/** What the API adapters throw for a server-verified invalid session (401). */
const authExpired = () => new apiRequestError.ApiRequestError({
  status: 401,
  code: "session_invalid",
  message: AUTH_EXPIRED
})

interface MountOptions {
  rejectOtp?: boolean
  rejectCodeRequest?: boolean
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
  const authCalls = { cachedTokens: 0, confirmations: 0, completions: 0, pendingPhoneChangeClears: 0 }

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
        "../roomV2/roomStarterModel": {
          saveOnboardingRoomKeepingSignupAlive: (room: unknown, save: (decor: unknown) => Promise<unknown>) => save(room)
        },
        "./sessionApi": {
          ...sessionApi,
          fetchProductionAccountSnapshot: async (_url: string, _token: string, _fetch: unknown, signal: AbortSignal) => {
            profileSignal = signal
            profileCalls += 1
            if (options.recover && profileCalls === 1) throw authExpired()
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
            authCalls.completions += 1
            assert.ok(nextLogin, "a test login needs an actor")
            return nextLogin
          },
          acknowledgeAccountModeration: async () => null
        },
        "./sessionPushCleanup": { revokeProductionSessionAfterPushCleanup: async () => undefined },
        "./firebasePhoneAuth": {
          getVerifiedFirebasePhoneIdToken: async () => {
            authCalls.cachedTokens += 1
            return "fixture-id-token"
          },
          confirmFirebasePhoneCode: async () => {
            authCalls.confirmations += 1
            if (options.rejectOtp) throw new Error("invalid code")
            return "fixture-id-token"
          },
          requestFirebasePhoneCode: async () => {
            if (options.rejectCodeRequest) throw new Error("provider unavailable")
            return { confirm: async () => null }
          },
          signOutFirebasePhoneAuth: async () => undefined
        },
        "./localQaEnvironment": {
          IS_LOCAL_QA_ENVIRONMENT: false,
          LOCAL_QA_PHONE_LIST: undefined,
          LOCAL_QA_CODE: undefined
        },
        "./localQaPhoneAuth": {
          requestLocalQaPhoneCode: async () => assert.fail("Firebase builds never use local QA sign-in"),
          completeLocalQaPhoneSignIn: async () => assert.fail("Firebase builds never use local QA sign-in")
        },
        "./useLocalQaDeepLinkSignIn": { useLocalQaDeepLinkSignIn: () => undefined },
        "../legal/legalPolicyMetadata": { LEGAL_DOCUMENT_VERSION: "test-terms-v1" },
        "./accountModeration": { needsModerationInterruption: () => false },
        "./sessionLifecycle": sessionLifecycle,
        "./sessionMutationCoordinator": sessionMutationCoordinator,
        "./initialProfileAvatar": initialProfileAvatar,
        "./onboardingFlowModel": onboardingFlowModel,
        "./onboardingCompletion": onboardingCompletion,
        "./sessionModel": sessionModel,
        "../network/apiRequestError": apiRequestError,
        "./sensitiveReauthGate": sensitiveReauthGate,
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
        "./preAuthOnboardingDraft": preAuthOnboardingDraft,
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
        },
        "../settings/pendingPhoneChange": {
          pendingPhoneChange: { clear: async () => { authCalls.pendingPhoneChangeClears += 1 } }
        }
      }
    }
  )

  runtime.render(() => useSessionState())
  const result = () => runtime.output as UseSessionStateResult
  return {
    runtime, actor, rotated, snapshot, profile, profileStarted, refresh, refreshStarted,
    clearing, clearStarted, saveBarrier, saveStarted, network, saves, errors, clears, avatarSaves,
    result, authCalls,
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
    login: async (next: SessionActor, requestCode = true) => {
      nextLogin = next
      if (requestCode) await result().requestVerificationCode({ phoneNumber: "+900000000000" })
      await result().registerSessionActor({ phoneNumber: "+900000000000", verificationCode: "000000" } as never)
    }
  }
}

test("signing out forgets a pending phone change", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.profile.resolve(f.snapshot)
  await settle()

  await f.result().clearSessionActor()

  assert.equal(f.current(), null)
  assert.equal(f.authCalls.pendingPhoneChangeClears, 1)
  f.runtime.unmount()
})

test("a cached Firebase identity cannot sign in without a new code request", async () => {
  const f = mount()
  await assert.rejects(f.login(f.actor, false), /Request a verification code/)
  assert.equal(f.authCalls.completions, 0)
  assert.equal(f.authCalls.cachedTokens, 0)
  f.runtime.unmount()
})

test("a cached Firebase identity never bypasses a rejected OTP", async () => {
  const f = mount({ rejectOtp: true })
  await assert.rejects(f.login(f.actor), /invalid code/)
  assert.equal(f.authCalls.confirmations, 1)
  assert.equal(f.authCalls.completions, 0)
  assert.equal(f.authCalls.cachedTokens, 0)
  f.runtime.unmount()
})

test("account creation also rejects an invalid OTP despite a cached Firebase identity", async () => {
  const f = mount({ rejectOtp: true })
  await f.result().requestVerificationCode({ phoneNumber: "+900000000000" })
  await assert.rejects(f.result().registerSessionActorWithDraft(
    { phoneNumber: "+900000000000", verificationCode: "000000" } as never,
    { profile: { displayName: "Fixture", age: 24, gender: "woman" }, avatar: {} as never, room: {} as never },
    async () => assert.fail("an invalid OTP must not clear the draft")
  ), /invalid code/)
  assert.equal(f.authCalls.confirmations, 1)
  assert.equal(f.authCalls.completions, 0)
  f.runtime.unmount()
})

test("a phone confirmation cannot be submitted for a different phone", async () => {
  const f = mount()
  await f.result().requestVerificationCode({ phoneNumber: "+900000000000" })
  await assert.rejects(f.result().registerSessionActor({
    phoneNumber: "+900000000001", verificationCode: "000000"
  } as never), /Request a verification code/)
  assert.equal(f.authCalls.confirmations, 0)
  assert.equal(f.authCalls.completions, 0)
  f.runtime.unmount()
})

test("a failed code request cannot fall back to a cached Firebase identity", async () => {
  const f = mount({ rejectCodeRequest: true })
  await assert.rejects(f.login(f.actor), /provider unavailable/)
  await assert.rejects(f.login(f.actor, false), /Request a verification code/)
  assert.equal(f.authCalls.completions, 0)
  f.runtime.unmount()
})

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
  f.profile.reject(authExpired())
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
  f.refresh.reject(authExpired())
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
  f.refresh.reject(authExpired())
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

// A refresh failure signs the user out only when the server verified the
// session is invalid. Gateway, rate-limit, timeout and transport failures keep
// the session; the real refreshSession produces each error from a response.
const refreshFailure = async (response: () => Response | Promise<Response>): Promise<Error> => {
  try {
    await sessionRefresh.refreshSession("https://fixture.invalid", "fixture-token", (async () => response()) as typeof fetch)
  } catch (error) {
    return error as Error
  }
  throw new Error("expected the refresh to fail")
}
const jsonFailure = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const SESSION_KEEPING_FAILURES: Array<[string, () => Response | Promise<Response>]> = [
  ["503 edge JSON without an error field", jsonFailure(503, { status: "error", code: 503, message: "unavailable" })],
  ["429 JSON without an error field", jsonFailure(429, { message: "rate limited", retryAfter: 30 })],
  ["502 gateway JSON", jsonFailure(502, { status: "error", code: 502, message: "Application failed to respond" })],
  ["503 server error body", jsonFailure(503, { error: "Service temporarily unavailable." })],
  ["502 HTML body", () => new Response("<html>bad gateway</html>", { status: 502 })],
  ["empty 500 body", () => new Response("", { status: 500 })],
  ["network failure", () => { throw new TypeError("Network request failed") }]
]

for (const [name, response] of SESSION_KEEPING_FAILURES) {
  test(`foreground refresh ${name} keeps the session`, async () => {
    const f = mount()
    await f.profileStarted.promise
    f.foreground()
    await f.refreshStarted.promise
    f.refresh.reject(await refreshFailure(response))
    await settle()
    assert.deepEqual(f.clears, [])
    assert.equal(f.current()?.session.userId, f.actor.session.userId)
    f.runtime.unmount()
  })
}

test("foreground refresh with a verified invalid session signs out", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.foreground()
  await f.refreshStarted.promise
  f.refresh.reject(await refreshFailure(jsonFailure(401, { error: "Sign in again to continue." })))
  await settle()
  assert.deepEqual(f.clears, ["production"])
  assert.equal(f.current(), null)
  f.runtime.unmount()
})

// A deletion or phone change that finishes late resets only the session it
// started in. Another login (or a new login of the same user) in between
// keeps the newer session.
for (const relogin of relogins) {
  test(`a late account-ending completion cannot reset the session after logout and ${relogin.label}`, async () => {
    const f = mount()
    await f.profileStarted.promise
    f.profile.resolve(f.snapshot)
    await settle()
    const resetStartedSession = f.result().bindSessionReset()

    await f.result().clearSessionActor()
    const next = productionActor(relogin.userId, relogin.token)
    await f.login(next)
    const clearsBefore = f.clears.length
    await resetStartedSession()
    await settle()

    assert.deepEqual(f.current(), next)
    assert.deepEqual(f.stored(), next)
    assert.equal(f.clears.length, clearsBefore)
    f.runtime.unmount()
  })
}

test("an account-ending completion still resets its own session after a token refresh", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.profile.resolve(f.snapshot)
  await settle()
  const resetStartedSession = f.result().bindSessionReset()
  f.foreground()
  await f.refreshStarted.promise
  f.refresh.resolve(f.rotated)
  await settle()

  await resetStartedSession()
  await settle()

  assert.equal(f.current(), null)
  assert.deepEqual(f.clears, ["production"])
})

// The server binds an SMS re-auth challenge to the requesting token; a
// rotation in between voids the code. Foreground refresh waits until the
// re-auth is over (or its hold expires).
test("foreground refresh waits while a sensitive re-auth code is pending", async () => {
  const f = mount()
  await f.profileStarted.promise
  f.profile.resolve(f.snapshot)
  await settle()
  const release = sensitiveReauthGate.holdSensitiveReauth()

  f.foreground()
  await settle()
  const refreshesWhileHeld = f.refreshCalls()
  release()
  f.foreground()
  await f.refreshStarted.promise

  assert.equal(refreshesWhileHeld, 0)
  assert.equal(f.refreshCalls(), 1)
  f.refresh.resolve(f.rotated)
  await settle()
  f.runtime.unmount()
})

test("a forgotten re-auth hold expires after the server challenge would have", () => {
  const startMs = Date.UTC(2026, 0, 1)
  const release = sensitiveReauthGate.holdSensitiveReauth(startMs)
  assert.equal(sensitiveReauthGate.isSensitiveReauthOpen(startMs + 1), true)
  assert.equal(
    sensitiveReauthGate.isSensitiveReauthOpen(startMs + sensitiveReauthGate.SENSITIVE_REAUTH_HOLD_MS + 1),
    false
  )
  release()
  assert.equal(sensitiveReauthGate.isSensitiveReauthOpen(startMs + 1), false)
})
