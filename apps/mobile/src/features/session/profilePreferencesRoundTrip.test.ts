import assert from "node:assert/strict"
import test from "node:test"
import type { UserProfile } from "@blumi/contracts"
import {
  fetchProductionAccountSnapshot,
  updateProductionProfile
} from "./sessionApi"
import { analyzeProfileEditDraft } from "./profileEditModel"

const API = "https://api.blumi.test"
const FAKE_TOKEN = "fake-session-token"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })
}

function createFakeProfileServer(initial: Record<string, unknown>) {
  let stored: Record<string, unknown> = { ...initial }
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      )
      stored = { ...stored, ...defined }
    }
    return jsonResponse({
      profile: stored,
      onboarding: { profile: "complete", avatar: "complete", room: "complete" }
    })
  }
  return { fetcher, replace: (next: Record<string, unknown>) => { stored = next } }
}

const BASE_PROFILE = {
  userId: "user-fake-1",
  displayName: "Test Person",
  age: 24,
  gender: "woman",
  avatar: { presetId: "avatar_v2_body_default" }
}

const CHOSEN_PREFERENCES = {
  ageMin: 23,
  ageMax: 34,
  genders: ["man"],
  vibes: ["coffee"],
  radiusKm: 50
} as const

function openProfileEdit(profile: UserProfile) {
  return analyzeProfileEditDraft({
    current: profile,
    draft: {
      displayName: profile.displayName,
      ageText: String(profile.age ?? ""),
      bio: profile.bio ?? "",
      gender: profile.identityGender ?? profile.gender ?? "",
      interestsText: ""
    }
  })
}

test("saved identity and discovery preferences survive save, refresh and profile edit", async () => {
  const server = createFakeProfileServer(BASE_PROFILE)

  const saved = await updateProductionProfile(API, FAKE_TOKEN, {
    displayName: "Test Person",
    age: 24,
    gender: "woman",
    identityGender: "woman",
    discoveryPreferences: { ...CHOSEN_PREFERENCES, genders: ["man"], vibes: ["coffee"] }
  }, server.fetcher)
  const refreshed = await fetchProductionAccountSnapshot(API, FAKE_TOKEN, server.fetcher)
  const edit = openProfileEdit(refreshed.profile)

  for (const profile of [saved, refreshed.profile]) {
    assert.equal(profile.identityGender, "woman")
    assert.deepEqual(profile.discoveryPreferences, CHOSEN_PREFERENCES)
  }
  assert.deepEqual(edit.update.discoveryPreferences, CHOSEN_PREFERENCES)
  assert.equal(edit.update.identityGender, "woman")
  assert.equal(edit.hasChanges, false)
})

test("accounts saved before identity and discovery preferences still load", async () => {
  const server = createFakeProfileServer(BASE_PROFILE)

  const snapshot = await fetchProductionAccountSnapshot(API, FAKE_TOKEN, server.fetcher)

  assert.equal(snapshot.profile.discoveryPreferences, undefined)
  assert.equal(snapshot.profile.displayName, "Test Person")
})

test("invalid server preferences fail loudly instead of becoming defaults", async () => {
  const server = createFakeProfileServer(BASE_PROFILE)
  server.replace({
    ...BASE_PROFILE,
    discoveryPreferences: { ageMin: 50, ageMax: 20, genders: ["robot"], vibes: [], radiusKm: 7 }
  })

  await assert.rejects(
    fetchProductionAccountSnapshot(API, FAKE_TOKEN, server.fetcher),
    /could not read your saved profile/
  )

  server.replace({ ...BASE_PROFILE, identityGender: "unknown-value" })
  await assert.rejects(
    fetchProductionAccountSnapshot(API, FAKE_TOKEN, server.fetcher),
    /could not read your saved profile/
  )
})
