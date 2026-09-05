import assert from "node:assert/strict"
import test from "node:test"
import {
  createPreAuthOnboardingDraftStorage,
  getPreAuthOnboardingDraftScope,
  resolvePreAuthOnboardingDraftId,
  PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY,
  PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY
} from "./preAuthOnboardingStorage"
import {
  createPreAuthOnboardingDraft,
  setPreAuthAvatarDraft,
  setPreAuthProfileDraft
} from "./preAuthOnboardingDraft"

function createMemoryStore(initialValue: string | null = null) {
  const values = new Map<string, string>()
  if (initialValue !== null) {
    values.set(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY, initialValue)
  }

  return {
    values,
    removedKeys: [] as string[],
    async getItem(key: string) {
      return values.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      values.set(key, value)
    },
    async removeItem(key: string) {
      this.removedKeys.push(key)
      values.delete(key)
    }
  }
}

test("the first pre-auth save keeps the provider scope stable", () => {
  assert.equal(
    resolvePreAuthOnboardingDraftId(null, "attempt-1", 0),
    "attempt-1-0"
  )
  assert.equal(
    resolvePreAuthOnboardingDraftId("persisted-draft", "attempt-1", 0),
    "persisted-draft"
  )
})

test("pre-auth storage saves a v2 immutable envelope with an explicit resume step", async () => {
  const store = createMemoryStore()
  let generatedIds = 0
  const storage = createPreAuthOnboardingDraftStorage({
    store,
    createDraftId: () => `draft-${++generatedIds}`
  })
  const empty = createPreAuthOnboardingDraft()
  const withProfile = setPreAuthProfileDraft(empty, { displayName: "Ada" })

  const first = await storage.save(withProfile, "profile")
  const withAvatar = setPreAuthAvatarDraft(withProfile, { avatarId: "female-01" })
  const second = await storage.save(withAvatar, "avatar", first)

  assert.equal(first.version, 2)
  assert.equal(first.draftId, "draft-1")
  assert.equal(first.scope, getPreAuthOnboardingDraftScope("draft-1"))
  assert.equal(first.resumeStep, "profile")
  assert.equal(second.draftId, first.draftId)
  assert.equal(second.scope, first.scope)
  assert.equal(second.resumeStep, "avatar")
  assert.equal(generatedIds, 1)
  assert.deepEqual(first.draft, withProfile)
  assert.deepEqual(second.draft, withAvatar)
  assert.notEqual(first.draft, withProfile)
  assert.notEqual(second.draft, withAvatar)
  assert.equal(first.draft.avatar, null)
})

test("pre-auth storage loads a valid v2 snapshot without deriving over the explicit step", async () => {
  const store = createMemoryStore(
    JSON.stringify({
      version: 2,
      draftId: "draft-existing",
      scope: getPreAuthOnboardingDraftScope("draft-existing"),
      resumeStep: "avatar",
      draft: {
        profile: { displayName: "Ada" },
        avatar: { avatarId: "female-01" },
        room: null
      }
    })
  )
  const storage = createPreAuthOnboardingDraftStorage({
    store,
    createDraftId: () => "unused"
  })

  const loaded = await storage.load()

  assert.equal(loaded?.draftId, "draft-existing")
  assert.equal(loaded?.resumeStep, "avatar")
  assert.deepEqual(loaded?.draft.profile, { displayName: "Ada" })
  assert.deepEqual(store.removedKeys, [])
})

test("pre-auth storage migrates every valid v1 route and maps register to phone", async () => {
  const routeCases = [
    ["profile", "profile"],
    ["avatar", "avatar"],
    ["room", "room"],
    ["register", "phone"]
  ] as const

  for (const [resumeRoute, expectedStep] of routeCases) {
    const store = createMemoryStore()
    store.values.set(
      PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY,
      JSON.stringify({
        version: 1,
        draftId: `draft-${resumeRoute}`,
        scope: getPreAuthOnboardingDraftScope(`draft-${resumeRoute}`),
        resumeRoute,
        draft: { profile: null, avatar: null, room: null }
      })
    )
    const storage = createPreAuthOnboardingDraftStorage({ store })

    const loaded = await storage.load()

    assert.equal(loaded?.version, 2)
    assert.equal(loaded?.resumeStep, expectedStep)
    assert.equal(store.values.has(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY), true)
    assert.equal(store.values.has(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY), false)
  }
})

test("legacy v1 drafts without a stored route derive a safe migration step", async () => {
  const store = createMemoryStore()
  store.values.set(
    PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY,
    JSON.stringify({
      version: 1,
      draftId: "draft-legacy-derived",
      scope: getPreAuthOnboardingDraftScope("draft-legacy-derived"),
      draft: {
        profile: { displayName: "Ada" },
        avatar: { avatarId: "female-01" },
        room: { roomId: "starter" }
      }
    })
  )
  const storage = createPreAuthOnboardingDraftStorage({ store })

  const loaded = await storage.load()

  assert.equal(loaded?.resumeStep, "phone")
})

test("pre-auth storage fails closed and removes corrupt or structurally invalid values", async () => {
  const invalidValues = [
    "not-json",
    JSON.stringify({ version: 3, draftId: "draft-old", scope: "x", draft: {} }),
    JSON.stringify({
      version: 2,
      draftId: "draft-bad-scope",
      scope: "preauth-onboarding-draft:another-id",
      resumeStep: "profile",
      draft: { profile: null, avatar: null, room: null }
    }),
    JSON.stringify({
      version: 2,
      draftId: "draft-bad-slot",
      scope: getPreAuthOnboardingDraftScope("draft-bad-slot"),
      resumeStep: "profile",
      draft: { profile: "Ada", avatar: null, room: null }
    })
  ]

  for (const invalidValue of invalidValues) {
    const store = createMemoryStore(invalidValue)
    const storage = createPreAuthOnboardingDraftStorage({
      store,
      createDraftId: () => "unused"
    })

    assert.equal(await storage.load(), null)
    assert.equal(store.values.has(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY), false)
    assert.deepEqual(store.removedKeys, [PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY])
  }
})

test("pre-auth storage clear removes the persisted draft", async () => {
  const store = createMemoryStore("persisted")
  store.values.set(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY, "legacy")
  const storage = createPreAuthOnboardingDraftStorage({
    store,
    createDraftId: () => "unused"
  })

  await storage.clear()

  assert.equal(store.values.size, 0)
  assert.deepEqual(store.removedKeys, [
    PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY,
    PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY
  ])
})
