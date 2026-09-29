import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { completeAndPersistSessionSetupStep } from "./onboardingCompletion"
import { createDemoSessionActor, type SessionActor } from "./sessionModel"
import { createSessionMutationCoordinator, SessionMutationCancelledError } from "./sessionMutationCoordinator"
import { createSessionRefreshCoordinator, isSessionRefreshCancelled } from "./sessionRefresh"

function fixture() {
  const actor = createDemoSessionActor({ displayName: "A", age: 24, avatarPresetId: "sunset" })
  let current: SessionActor | null = actor
  let stored: SessionActor | null = actor
  const coordinator = createSessionMutationCoordinator({
    current: () => current,
    save: async (next) => { stored = next },
    publish: (next) => { current = next }
  })
  return { actor, coordinator, current: () => current, stored: () => stored,
    replace: (next: SessionActor | null) => { current = next },
    clear: async () => { stored = null } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const settleLifecycle = () => new Promise<void>((resolve) => setImmediate(resolve))

// Execute the current startup/foreground effect bodies and refresh runner. React
// rendering and native storage are outside this deterministic interleaving test.
function startupFixture(options: { recover?: boolean; refreshSoon?: boolean; pauseClear?: boolean } = {}) {
  const relative = "src/features/session/useSessionState.ts"
  const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  let startup = "", foreground = "", refreshRunner = ""
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source)
      const body = node.arguments[0]?.getText(source) ?? ""
      if (name === "useEffect" && body.includes("async function syncProductionProfile")) startup = body
      if (name === "useEffect" && body.includes('AppState.addEventListener("change"')) foreground = body
      if (name === "createSessionRefreshCoordinator") refreshRunner = body
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(startup && foreground && refreshRunner)

  const demo = createDemoSessionActor({ displayName: "Before", age: 24 })
  const actor: SessionActor = { ...demo, session: { ...demo.session, mode: "production" } }
  const rotated: SessionActor = { ...actor, session: { ...actor.session, sessionToken: "fixture-rotated" } }
  const snapshot = {
    profile: { ...actor.profile, displayName: "Server profile" },
    onboarding: { profile: "complete" as const, avatar: "incomplete" as const, room: "incomplete" as const },
    moderation: null
  }
  const profile = deferred<typeof snapshot>(), profileStarted = deferred<void>()
  const refresh = deferred<SessionActor>(), refreshStarted = deferred<void>()
  const clearing = deferred<void>(), clearStarted = deferred<void>()
  const sessionActorRef = { current: null as SessionActor | null }
  const productionSyncRef: { current: { controller: AbortController; promise: Promise<void> } | null } = { current: null }
  const saves: SessionActor[] = [], publications: SessionActor[] = [], updates: string[] = []
  let stored: SessionActor | null = actor
  let foregroundListener: ((state: string) => void) | undefined
  let listenerRemoved = false, profileSignal: AbortSignal | undefined, refreshSignal: AbortSignal | undefined
  let profileCalls = 0, refreshCalls = 0, refreshSoon = options.refreshSoon ?? false
  const setSessionActor = (next: SessionActor | null | ((current: SessionActor | null) => SessionActor | null)) => {
    sessionActorRef.current = typeof next === "function" ? next(sessionActorRef.current) : next
    if (sessionActorRef.current) publications.push(sessionActorRef.current)
    updates.push("actor")
  }
  const saveSessionActor = async (next: SessionActor) => { saves.push(next); stored = next }
  const mutationCoordinator = createSessionMutationCoordinator({
    current: () => sessionActorRef.current, save: saveSessionActor, publish: setSessionActor
  })
  const context = vm.createContext({
    Error, AbortController, SessionMutationCancelledError, mutationCoordinator,
    sessionActorRef, productionSyncRef, accountMutationGenerationRef: { current: 0 },
    appStateRef: { current: "background" },
    AppState: { addEventListener: (_event: string, listener: (state: string) => void) => {
      foregroundListener = listener
      return { remove: () => { listenerRemoved = true; foregroundListener = undefined } }
    } },
    setSessionActor, saveSessionActor,
    // The startup fixture exercises session ordering without native asset or
    // AsyncStorage warmup; the pre-Main warmup has its own focused tests.
    warmDiscoveryBeforeMain: () => {},
    setAccountModeration: () => updates.push("moderation"),
    setErrorMessage: () => updates.push("error"),
    setHasSeenIntro: () => updates.push("intro"),
    setIsHydrating: () => updates.push("hydration"),
    commitResolvedCapabilities: () => updates.push("capabilities"),
    loadSessionActor: async () => actor, loadHasSeenIntro: async () => true,
    clearStoredSessionActor: async () => {
      updates.push("clear")
      clearStarted.resolve()
      if (options.pauseClear) await clearing.promise
      stored = null
    },
    IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET: false,
    shouldRefreshSessionSoon: () => refreshSoon,
    shouldApplyProductionAccountSync: (started: number, current: number) => started === current,
    resolveCapabilitiesForSession: async () => ({ capabilities: {} }),
    capabilitiesForToken: () => ({}),
    fetchProductionAccountSnapshot: async (_url: string, _token: string, _fetch: unknown, signal: AbortSignal) => {
      profileSignal = signal
      profileCalls += 1
      if (options.recover && profileCalls === 1) throw new Error("Sign in again to continue.")
      profileStarted.resolve()
      return profile.promise
    },
    refreshAndPersistSession: async (_url: string, _actor: SessionActor, input: { signal: AbortSignal }) => {
      refreshCalls += 1
      refreshSignal = input.signal
      refreshStarted.resolve()
      return refresh.promise // Deliberately ignore abort to exercise late completions.
    },
    isAuthSessionError: (error: unknown) => error instanceof Error && error.message.includes("Sign in again"),
    isSessionRefreshCancelled, AccountAccessError: class extends Error {},
    needsModerationInterruption: () => false, getErrorMessage: String,
    captureProductEvent: () => {}, MOBILE_HTTP_BASE_URL: "https://fixture.invalid",
    fetch: () => { throw new Error("Unexpected real network request") }
  })
  function evaluate(expression: string): any {
    return vm.runInContext(ts.transpileModule(`(${expression})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText, context)
  }
  const refreshCoordinator = createSessionRefreshCoordinator(evaluate(refreshRunner))
  context.refreshCoordinator = refreshCoordinator
  const cleanupStartup = evaluate(startup)() as () => void
  const cleanupForeground = evaluate(foreground)() as () => void
  return {
    actor, rotated, snapshot, profile, profileStarted, refresh, refreshStarted, clearing, clearStarted,
    saves, publications, updates, mutationCoordinator, refreshCoordinator, productionSyncRef,
    current: () => sessionActorRef.current, stored: () => stored,
    profileSignal: () => profileSignal, refreshSignal: () => refreshSignal,
    refreshCalls: () => refreshCalls, listenerRemoved: () => listenerRemoved,
    foreground: () => { refreshSoon = true; foregroundListener?.("active") },
    cleanup: () => { cleanupStartup(); cleanupForeground() }
  }
}

for (const recover of [true, false]) {
  test(`startup profile publishes server state with latest credentials after ${recover ? "auth recovery" : "external rotation"}`, async () => {
    const f = startupFixture({ recover })
    let externalRotation: Promise<SessionActor> | undefined
    if (recover) {
      await f.refreshStarted.promise
      f.refresh.resolve(f.rotated)
    } else {
      await f.profileStarted.promise
      externalRotation = f.refreshCoordinator.refresh(f.actor)
      await f.refreshStarted.promise
      f.refresh.resolve(f.rotated)
      await externalRotation
    }
    await f.profileStarted.promise
    const syncing = f.productionSyncRef.current!.promise
    f.profile.resolve(f.snapshot)
    await syncing
    assert.ok(f.current()?.session.sessionToken === f.rotated.session.sessionToken)
    assert.ok(f.stored()?.session.sessionToken === f.rotated.session.sessionToken)
    assert.equal(f.current()?.profile.displayName, f.snapshot.profile.displayName)
    assert.deepEqual(f.current()?.session.onboarding, f.snapshot.onboarding)
    assert.deepEqual(f.stored()?.session.onboarding, f.snapshot.onboarding)
    assert.equal(f.saves.length, 2)
    assert.ok(f.saves.every((actor) => actor.session.sessionToken === f.rotated.session.sessionToken))
    f.cleanup()
  })
}

test("startup profile queued behind persistence cannot save or publish after unmount", async () => {
  const f = startupFixture()
  await f.profileStarted.promise
  const syncing = f.productionSyncRef.current!.promise
  const barrier = deferred<void>(), entered = deferred<void>()
  const blocking = f.mutationCoordinator.clear(async () => { entered.resolve(); await barrier.promise })
  await entered.promise
  f.profile.resolve(f.snapshot)
  await settleLifecycle()
  f.cleanup()
  const updates = f.updates.length
  barrier.resolve()
  await Promise.all([blocking, syncing])
  assert.equal(f.saves.length, 0)
  assert.equal(f.updates.length, updates)
  assert.ok(f.profileSignal()?.aborted)
})

test("startup profile late rejection after unmount cannot start auth recovery", async () => {
  const f = startupFixture()
  await f.profileStarted.promise
  const syncing = f.productionSyncRef.current!.promise
  f.cleanup()
  const updates = f.updates.length
  f.profile.reject(new Error("Sign in again to continue."))
  await settleLifecycle()
  assert.equal(f.refreshCalls(), 0)
  await syncing
  assert.equal(f.saves.length, 0)
  assert.equal(f.updates.length, updates)
})

test("startup profile cannot replace a newer user mutation", async () => {
  const f = startupFixture()
  await f.profileStarted.promise
  const syncing = f.productionSyncRef.current!.promise
  const edited = { ...f.actor, profile: { ...f.actor.profile, displayName: "Newer edit" } }
  await f.mutationCoordinator.commit(f.mutationCoordinator.capture(f.actor), edited)
  f.profile.resolve(f.snapshot)
  await syncing
  assert.equal(f.current()?.profile.displayName, edited.profile.displayName)
  assert.deepEqual(f.stored(), edited)
  assert.equal(f.saves.length, 1)
  f.cleanup()
})

test("foreground refresh late failure after unmount cannot publish errors or clear storage", async () => {
  const f = startupFixture()
  await f.profileStarted.promise
  f.foreground()
  await f.refreshStarted.promise
  const syncing = f.productionSyncRef.current!.promise
  f.cleanup()
  const updates = f.updates.length
  f.refresh.reject(new Error("Sign in again to continue."))
  f.profile.resolve(f.snapshot)
  await syncing
  await settleLifecycle()
  assert.equal(f.saves.length, 0)
  assert.equal(f.updates.length, updates)
  assert.deepEqual(f.stored(), f.actor)
})

test("startup auth clear already in progress cannot publish after unmount", async () => {
  const f = startupFixture({ recover: true, pauseClear: true })
  await f.refreshStarted.promise
  const syncing = f.productionSyncRef.current!.promise
  f.refresh.reject(new Error("Sign in again to continue."))
  await f.clearStarted.promise
  f.cleanup()
  const updates = f.updates.length
  f.clearing.resolve()
  await syncing
  assert.equal(f.updates.length, updates)
  assert.equal(f.saves.length, 0)
})

for (const foreground of [false, true]) {
  test(`${foreground ? "foreground" : "startup"} refresh cannot persist or publish after unmount`, async () => {
    const f = startupFixture({ refreshSoon: !foreground })
    if (foreground) { await f.profileStarted.promise; f.foreground() }
    await f.refreshStarted.promise
    const syncing = f.productionSyncRef.current!.promise
    f.cleanup()
    const updates = f.updates.length
    assert.ok(f.refreshSignal()?.aborted)
    assert.ok(f.productionSyncRef.current?.controller.signal.aborted)
    assert.ok(f.listenerRemoved())
    f.refresh.resolve(f.rotated)
    f.profile.resolve(f.snapshot)
    await syncing
    await settleLifecycle()
    assert.equal(f.saves.length, 0)
    assert.equal(f.updates.length, updates)
  })
}

test("late mutation cannot restore a logged out session", async () => {
  const f = fixture()
  const ticket = f.coordinator.capture(f.actor)
  f.coordinator.invalidate()
  f.replace(null)
  await f.coordinator.clear(f.clear)
  await assert.rejects(f.coordinator.commit(ticket, f.actor), /session changed/i)
  assert.equal(f.current(), null)
  assert.equal(f.stored(), null)
})

test("prior login cannot overwrite a new login, including the same user", async () => {
  const f = fixture()
  const ticket = f.coordinator.capture(f.actor)
  f.coordinator.invalidate()
  const next = { ...f.actor, session: { ...f.actor.session, sessionToken: "new-login" } }
  f.replace(next)
  await assert.rejects(f.coordinator.commit(ticket, f.actor), /session changed/i)
  assert.equal(f.current()?.session.sessionToken, "new-login")
})

test("legitimate token rotation is preserved while profile result is applied", async () => {
  const f = fixture()
  const ticket = f.coordinator.capture(f.actor)
  f.replace({ ...f.actor, session: { ...f.actor.session, sessionToken: "rotated" } })
  await f.coordinator.commit(ticket, { ...f.actor, profile: { ...f.actor.profile, displayName: "Updated" } })
  assert.equal(f.stored()?.session.sessionToken, "rotated")
  assert.equal(f.current()?.profile.displayName, "Updated")
})

test("rotation arriving during a paused mutation write is serialized and wins credentials", async () => {
  const f = fixture()
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const paused = new Promise<void>((resolve) => { release = resolve })
  let stored = f.actor
  let first = true
  const coordinator = createSessionMutationCoordinator({ current: f.current,
    save: async (actor) => {
      if (first) { first = false; entered(); await paused }
      stored = actor
    }, publish: f.replace })
  const rotation = coordinator.capture(f.actor, false)
  const saving = coordinator.commit(coordinator.capture(f.actor), {
    ...f.actor, profile: { ...f.actor.profile, displayName: "Updated" }
  })
  await started
  const rotating = coordinator.rotate(rotation, {
    ...f.actor, session: { ...f.actor.session, sessionToken: "rotated-during-write" }
  })
  release()
  await Promise.all([saving, rotating])
  assert.equal(stored.session.sessionToken, "rotated-during-write")
  assert.equal(f.current()?.session.sessionToken, "rotated-during-write")
  assert.equal(f.current()?.profile.displayName, "Updated")
})

test("an older mutation response cannot overwrite the newest request result", async () => {
  const f = fixture()
  const older = f.coordinator.capture(f.actor)
  const newer = f.coordinator.capture(f.actor)
  await f.coordinator.commit(newer, { ...f.actor, profile: { ...f.actor.profile, displayName: "Newer" } })
  await assert.rejects(f.coordinator.commit(older, f.actor), /session changed/i)
  assert.equal(f.stored()?.profile.displayName, "Newer")
})

test("superseding a paused write restores last published persistence even if newer request fails", async () => {
  const f = fixture()
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const paused = new Promise<void>((resolve) => { release = resolve })
  let stored = f.actor
  let first = true
  const coordinator = createSessionMutationCoordinator({ current: f.current,
    save: async (actor) => { if (first) { first = false; entered(); await paused }; stored = actor },
    publish: f.replace })
  const saving = coordinator.commit(coordinator.capture(f.actor), {
    ...f.actor, profile: { ...f.actor.profile, displayName: "Stale" }
  })
  const rejected = assert.rejects(saving, /session changed/i)
  await started
  coordinator.capture(f.actor) // New request fails at the network boundary and never commits.
  release()
  await rejected
  assert.deepEqual(stored, f.current())
  assert.equal(stored.profile.displayName, "A")
})

test("logout clear waits for an already running persistence write and suppresses its UI result", async () => {
  const f = fixture()
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const paused = new Promise<void>((resolve) => { release = resolve })
  let stored: SessionActor | null = f.actor
  const coordinator = createSessionMutationCoordinator({ current: f.current,
    save: async (actor) => { entered(); await paused; stored = actor },
    publish: f.replace })
  const saving = coordinator.commit(coordinator.capture(f.actor), f.actor)
  const rejected = assert.rejects(saving, /session changed/i)
  await started
  coordinator.invalidate()
  f.replace(null)
  const clearing = coordinator.clear(async () => { stored = null })
  release()
  await Promise.all([rejected, clearing])
  assert.equal(stored, null)
  assert.equal(f.current(), null)
})

test("new login waits behind logout persistence and becomes the final actor", async () => {
  const f = fixture()
  f.coordinator.invalidate()
  f.replace(null)
  const clearing = f.coordinator.clear(f.clear)
  const next = { ...f.actor, session: { ...f.actor.session, userId: "B", sessionToken: "B-token" } }
  await f.coordinator.replace(next, f.coordinator.beginReplacement())
  await clearing
  assert.equal(f.stored()?.session.userId, "B")
  assert.equal(f.current()?.session.userId, "B")
})

test("registration response started before logout cannot establish a session", async () => {
  const f = fixture()
  const replacement = f.coordinator.beginReplacement()
  f.coordinator.invalidate()
  f.replace(null)
  await f.coordinator.clear(f.clear)
  await assert.rejects(f.coordinator.replace(f.actor, replacement), /session changed/i)
  assert.equal(f.stored(), null)
})

test("persistence failure does not publish or poison the logout queue", async () => {
  const f = fixture()
  const coordinator = createSessionMutationCoordinator({ current: f.current,
    save: async () => { throw new Error("storage unavailable") }, publish: f.replace })
  await assert.rejects(coordinator.commit(coordinator.capture(f.actor), f.actor), /storage unavailable/)
  coordinator.invalidate()
  f.replace(null)
  await coordinator.clear(f.clear)
  assert.equal(f.stored(), null)
})

test("a captured callback cannot write another account even without explicit invalidation", async () => {
  const f = fixture()
  const ticket = f.coordinator.capture(f.actor)
  f.replace({ ...f.actor, session: { ...f.actor.session, userId: "B" } })
  await assert.rejects(f.coordinator.commit(ticket, f.actor), /session changed/i)
  assert.throws(() => f.coordinator.capture(f.actor), /session changed/i)
})

test("a stale callback cannot invalidate the current account's pending mutation", async () => {
  const f = fixture()
  const next = { ...f.actor, session: { ...f.actor.session, userId: "B" } }
  f.replace(next)
  const ticket = f.coordinator.capture(next)
  assert.throws(() => f.coordinator.capture(f.actor), /session changed/i)
  await f.coordinator.commit(ticket, next)
  assert.equal(f.stored()?.session.userId, "B")
})

// Exercise the actual production callback bodies, with only their network/storage
// boundaries injected. This is not a mounted React/native rendering test.
for (const callback of ["persistProfileUpdate", "saveAvatarSelectionOutcome", "completeAvatarSetup", "completeRoomSetup"]) {
  test(`${callback}: late network response cannot write after logout and another login`, async () => {
    const f = fixture()
    const actor = { ...f.actor, session: { ...f.actor.session, mode: "production" as const } }
    f.replace(actor)
    const relative = "src/features/session/useSessionState.ts"
    const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
    const text = readFileSync(file, "utf8")
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    let expression = ""
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === callback &&
          node.initializer && ts.isCallExpression(node.initializer)) {
        expression = node.initializer.arguments[0].getText(source)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.ok(expression)
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const paused = new Promise<void>((resolve) => { release = resolve })
    const network = async () => { entered(); await paused }
    const context = vm.createContext({
      sessionActor: actor, mutationCoordinator: f.coordinator,
      SessionMutationCancelledError: Error,
      beginAccountMutation: async () => {},
      setIsBootstrapping: () => {}, setErrorMessage: () => {},
      getErrorMessage: String, captureProductEvent: () => {},
      updateSessionActorProfile: () => actor,
      updateProductionProfile: async () => { await network(); return actor.profile },
      persistUntouchedProfileStarterAvatar: async (value: SessionActor) => value,
      AVATAR_V2_CATALOG: {}, resolveInitialAvatarV2: () => ({}),
      normalizeCompleteAvatarSelection: () => null, userAvatarToLoadout: () => ({}),
      capabilitiesForToken: () => ({}),
      saveProductionAvatar: async () => { await network(); return { kind: "updated", selection: {} } },
      replaceSessionActorAvatar: (value: SessionActor) => value,
      getOnboardingSaveIntent: () => "update-and-complete",
      saveAvatarSelectionOutcome: async () => ({ kind: "updated", selection: {} }),
      completeProductionOnboardingStep: async () => { await network(); return actor.session.onboarding },
      completeAndPersistSessionSetupStep,
      MOBILE_HTTP_BASE_URL: "http://synthetic.invalid"
    })
    vm.runInContext(ts.transpileModule(`globalThis.run = ${expression}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText, context)
    const saving = context.run({}, null) as Promise<void>
    const rejected = assert.rejects(saving, /session changed/i)
    await started
    f.coordinator.invalidate()
    f.replace(null)
    await f.coordinator.clear(f.clear)
    const next = { ...actor, session: { ...actor.session, userId: "B", sessionToken: "B-token" } }
    await f.coordinator.replace(next, f.coordinator.beginReplacement())
    release()
    await rejected
    assert.equal(f.current()?.session.userId, "B")
    assert.equal(f.stored()?.session.userId, "B")
  })
}
