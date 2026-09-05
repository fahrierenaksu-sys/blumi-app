import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { completeAndPersistSessionSetupStep } from "./onboardingCompletion"
import { createDemoSessionActor, type SessionActor } from "./sessionModel"
import { createSessionMutationCoordinator } from "./sessionMutationCoordinator"

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
