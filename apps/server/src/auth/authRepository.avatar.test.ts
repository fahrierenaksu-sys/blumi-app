import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import {
  createInMemoryAuthRepository
} from "./authRepository"
import {
  createAccountRecord,
  createBlumiBackendStore
} from "./authStore"

function createNextSelection(): CompleteAvatarSelection {
  return {
    presetId: "avatar_v2_body_male_light",
    revision: 99,
    loadout: {
      schemaVersion: 1,
      bodyId: "avatar_v2_body_male_light",
      faceId: "avatar_v2_face_default",
      eyesId: "avatar_v2_eyes_mocha_doe",
      noseId: "avatar_v2_nose_soft_button",
      mouthId: "avatar_v2_mouth_peach_whisper_smile",
      hairId: "avatar_v2_hair_mocha_ribbon_blowout",
      topId: "avatar_v2_top_default",
      bottomId: "avatar_v2_bottom_default",
      shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
      accessoryIds: ["avatar_v2_accessory_ivory_ribbon_beret"]
    }
  }
}

test("in-memory avatar CAS updates exactly one caller and deep-clones selection", async () => {
  const store = createBlumiBackendStore()
  const account = createAccountRecord("+905551112233")
  store.accountsByPhone.set(account.phoneNumber, account)
  const repository = createInMemoryAuthRepository(store)
  const now = new Date("2026-07-13T12:00:00.000Z")
  const selection = createNextSelection()

  const [first, second] = await Promise.all([
    repository.updateAvatarSelection({
      accountId: account.accountId,
      expectedRevision: 0,
      selection,
      now
    }),
    repository.updateAvatarSelection({
      accountId: account.accountId,
      expectedRevision: 0,
      selection,
      now
    })
  ])

  assert.deepEqual([first.kind, second.kind].sort(), ["conflict", "updated"])
  const updated = first.kind === "updated" ? first : second
  assert.equal(updated.kind, "updated")
  if (updated.kind !== "updated") return
  assert.equal(updated.account.profile.avatar.revision, 1)
  assert.equal(updated.account.profile.avatar.loadout?.bodyId, selection.loadout.bodyId)
  selection.loadout.accessoryIds.push("mutated-after-save")
  assert.deepEqual(updated.account.profile.avatar.loadout?.accessoryIds, [
    "avatar_v2_accessory_ivory_ribbon_beret"
  ])

  const stored = await repository.findAccountById(account.accountId)
  assert.deepEqual(stored?.profile.avatar.loadout?.accessoryIds, [
    "avatar_v2_accessory_ivory_ribbon_beret"
  ])
})

test("in-memory avatar CAS distinguishes missing accounts from conflicts", async () => {
  const store = createBlumiBackendStore()
  const account = createAccountRecord("+905551112233")
  store.accountsByPhone.set(account.phoneNumber, account)
  const repository = createInMemoryAuthRepository(store)
  const selection = createNextSelection()

  const conflict = await repository.updateAvatarSelection({
    accountId: account.accountId,
    expectedRevision: 1,
    selection,
    now: new Date()
  })
  const missing = await repository.updateAvatarSelection({
    accountId: "missing-account",
    expectedRevision: 0,
    selection,
    now: new Date()
  })

  assert.equal(conflict.kind, "conflict")
  assert.equal(missing.kind, "missing")
  if (conflict.kind === "conflict") {
    assert.equal(conflict.current.revision, 0)
  }
})

test("in-memory profile updates cannot overwrite a concurrent avatar CAS", async () => {
  const store = createBlumiBackendStore()
  const account = createAccountRecord("+905551112233")
  store.accountsByPhone.set(account.phoneNumber, account)
  const repository = createInMemoryAuthRepository(store)
  const staleProfile = (await repository.findAccountById(account.accountId))!.profile
  const selection = createNextSelection()

  await Promise.all([
    repository.updateAvatarSelection({
      accountId: account.accountId,
      expectedRevision: 0,
      selection,
      now: new Date("2026-07-13T12:00:00.000Z")
    }),
    repository.updateAccountProfile({
      accountId: account.accountId,
      profile: { displayName: "Concurrent Name" },
      now: new Date("2026-07-13T12:00:01.000Z")
    })
  ])

  const stored = await repository.findAccountById(account.accountId)
  assert.equal(stored?.profile.displayName, "Concurrent Name")
  assert.equal(stored?.profile.avatar.revision, 1)
  assert.equal(stored?.profile.avatar.loadout?.bodyId, selection.loadout.bodyId)
})

test("in-memory profile field patches compose without changing identity", async () => {
  const store = createBlumiBackendStore()
  const account = createAccountRecord("+905551112233")
  store.accountsByPhone.set(account.phoneNumber, account)
  const repository = createInMemoryAuthRepository(store)

  await Promise.all([
    repository.updateAccountProfile({
      accountId: account.accountId,
      profile: { bio: "Coffee walks" },
      now: new Date("2026-07-13T12:00:00.000Z")
    }),
    repository.updateAccountProfile({
      accountId: account.accountId,
      profile: { interests: ["music"] },
      now: new Date("2026-07-13T12:00:01.000Z")
    }),
    repository.updateAccountProfile({
      accountId: account.accountId,
      profile: { userId: "attacker" } as never,
      now: new Date("2026-07-13T12:00:02.000Z")
    })
  ])

  const stored = await repository.findAccountById(account.accountId)
  assert.equal(stored?.profile.bio, "Coffee walks")
  assert.deepEqual(stored?.profile.interests, ["music"])
  assert.equal(stored?.profile.userId, account.userId)
})

test("in-memory profile completion is atomic with gender prerequisites", async () => {
  const store = createBlumiBackendStore()
  const account = createAccountRecord("+905551112233")
  account.profile = {
    ...account.profile,
    displayName: "Mina",
    age: 24,
    gender: "woman"
  }
  store.accountsByPhone.set(account.phoneNumber, account)
  const repository = createInMemoryAuthRepository(store)

  await Promise.all([
    repository.updateAccountProfile({
      accountId: account.accountId,
      profile: { gender: null },
      now: new Date("2026-07-13T12:00:00.000Z")
    }),
    repository.completeOnboardingStep({
      accountId: account.accountId,
      step: "profile",
      now: new Date("2026-07-13T12:00:00.000Z")
    })
  ])

  const stored = await repository.findAccountById(account.accountId)
  assert.equal(stored?.profile.gender, undefined)
  assert.equal(stored?.onboarding.profile, "incomplete")

  const second = createAccountRecord("+905551112244")
  second.profile = {
    ...second.profile,
    displayName: "Ada",
    age: 26,
    gender: "woman"
  }
  store.accountsByPhone.set(second.phoneNumber, second)
  await Promise.all([
    repository.completeOnboardingStep({
      accountId: second.accountId,
      step: "profile",
      now: new Date("2026-07-13T12:01:00.000Z")
    }),
    repository.updateAccountProfile({
      accountId: second.accountId,
      profile: { gender: null },
      now: new Date("2026-07-13T12:01:00.000Z")
    })
  ])

  const secondStored = await repository.findAccountById(second.accountId)
  assert.equal(secondStored?.profile.gender, "woman")
  assert.equal(secondStored?.onboarding.profile, "complete")
})
