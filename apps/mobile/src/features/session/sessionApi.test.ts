import assert from "node:assert/strict"
import test from "node:test"
import {
  AccountAccessError,
  acknowledgeAccountModeration,
  deleteProductionAccount,
  completeFirebaseAccount,
  requestFirebaseAccountActionChallenge,
  verifyFirebaseAccountAction,
  downloadAccountDataExport,
  fetchProductionProfile,
  revokeProductionSession,
  submitAccountRecoveryRequest,
  updateProductionProfile,
  updateSessionActorProfile,
  confirmPhoneChange
} from "./sessionApi"
import * as sessionApi from "./sessionApi"
import { createDemoSessionActor } from "./sessionModel"
import { LEGAL_DOCUMENT_VERSION } from "../legal/legalPolicyMetadata"
import { registerBoundedRequestTests } from "../network/boundedRequestContract"
import { ACCOUNT_RECOVERY_REQUIRED_MESSAGE } from "./accountRecoveryCopy"

const TEST_TERMS_ACCEPTANCE = Object.freeze({
  version: LEGAL_DOCUMENT_VERSION,
  locale: "tr" as const
})

test("profile updates create a new session actor without mutating the source", () => {
  const actor = createDemoSessionActor({
    displayName: "Ece",
    age: 24,
    avatarPresetId: "sunset"
  })

  const updated = updateSessionActorProfile(actor, {
    displayName: "Ece Deniz",
    age: 25,
    bio: "Coffee walks.",
    gender: "woman",
    interests: ["coffee", "jazz"]
  })

  assert.notEqual(updated, actor)
  assert.notEqual(updated.profile, actor.profile)
  assert.equal(actor.profile.displayName, "Ece")
  assert.equal(actor.profile.age, 24)
  assert.equal(updated.profile.displayName, "Ece Deniz")
  assert.equal(updated.profile.age, 25)
  assert.equal(updated.profile.bio, "Coffee walks.")
  assert.equal(updated.profile.gender, "woman")
  assert.deepEqual(updated.profile.interests, ["coffee", "jazz"])
  assert.equal(updated.profile.location, undefined)
  assert.deepEqual(updated.profile.avatar, actor.profile.avatar)
})

test("identity and discovery preferences update independently from avatar body", () => {
  const actor = createDemoSessionActor({
    displayName: "Ece",
    age: 24,
    avatarPresetId: "avatar_v2_body_default"
  })
  const originalAvatar = actor.profile.avatar

  const updated = updateSessionActorProfile(actor, {
    displayName: "Ece",
    age: 24,
    identityGender: "man",
    discoveryPreferences: {
      ageMin: 23,
      ageMax: 34,
      genders: ["woman"],
      vibes: ["coffee"],
      radiusKm: 25
    }
  })

  assert.equal(updated.profile.identityGender, "man")
  assert.deepEqual(updated.profile.discoveryPreferences, {
    ageMin: 23,
    ageMax: 34,
    genders: ["woman"],
    vibes: ["coffee"],
    radiusKm: 25
  })
  assert.deepEqual(updated.profile.avatar, originalAvatar)
  assert.deepEqual(actor.profile.avatar, originalAvatar)
})

test("Firebase completion preserves server identity and incomplete onboarding", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const input = {
    idToken: "test-firebase-proof",
    authIntent: "create" as const,
    termsAcceptance: TEST_TERMS_ACCEPTANCE
  }
  const actor = await completeFirebaseAccount("https://api.blumi.test", input, async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      session: {
        accountId: "account-1",
        sessionId: "session-1",
        mode: "production",
        userId: "user-1",
        sessionToken: "production-token",
        expiresAt: "2999-01-01T00:00:00.000Z",
        onboarding: { profile: "incomplete", avatar: "incomplete", room: "incomplete" }
      },
      profile: { userId: "user-1", displayName: "", avatar: { presetId: "dusk" } }
    }), { status: 200 })
  })

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/auth/firebase/complete")
  assert.equal(calls[0]?.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), input)
  assert.equal(actor.session.mode, "production")
  assert.deepEqual(actor.session.onboarding, {
    profile: "incomplete", avatar: "incomplete", room: "incomplete"
  })
})

test("Firebase auth requests never log submitted identity proofs", { concurrency: false }, async () => {
  const idToken = "test-firebase-proof"
  const entries: unknown[][] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => { entries.push(args) }
  console.error = (...args: unknown[]) => { entries.push(args) }
  try {
    await completeFirebaseAccount("https://api.blumi.test", {
      idToken, authIntent: "sign-in"
    }, async () => new Response(JSON.stringify({
      session: {
        accountId: "account-1", sessionId: "session-1", mode: "production",
        userId: "user-1", sessionToken: "production-token",
        expiresAt: "2999-01-01T00:00:00.000Z",
        onboarding: { profile: "complete", avatar: "complete", room: "complete" }
      },
      profile: { userId: "user-1", displayName: "", avatar: { presetId: "dusk" } }
    }), { status: 200 }))
    await assert.rejects(completeFirebaseAccount("https://api.blumi.test", {
      idToken, authIntent: "sign-in"
    }, async () => new Response(JSON.stringify({
      error: `Invalid proof ${idToken}.`
    }), { status: 401 })))
    await assert.rejects(verifyFirebaseAccountAction("https://api.blumi.test", "token", {
      idToken, challengeId: "challenge", purpose: "account_deletion"
    }, async () => new Response(JSON.stringify({
      error: `Invalid proof ${idToken}.`
    }), { status: 401 })))
  } finally {
    console.log = originalLog
    console.error = originalError
  }
  assert.equal(JSON.stringify(entries).includes(idToken), false)
})

test("Firebase completion and reauthentication errors redact submitted proofs", async () => {
  const idToken = "test-firebase-proof"
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    error: `Invalid proof ${idToken}; repeated ${idToken}.`
  }), { status: 401 })
  const rejectsPrivateProof = (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /invalid proof/i)
    assert.equal(error.message.includes(idToken), false)
    return true
  }
  await assert.rejects(completeFirebaseAccount("https://api.blumi.test", {
    idToken, authIntent: "sign-in"
  }, fetcher), rejectsPrivateProof)
  await assert.rejects(verifyFirebaseAccountAction("https://api.blumi.test", "token", {
    idToken, challengeId: "challenge", purpose: "account_data_export"
  }, fetcher), rejectsPrivateProof)
})

test("Firebase sensitive actions reject incomplete challenge and proof responses", async () => {
  for (const payload of [{ expiresAt: "2999-01-01T00:05:00.000Z" }, { challengeId: "challenge" }]) {
    await assert.rejects(requestFirebaseAccountActionChallenge("https://api.blumi.test", "token", {
      purpose: "account_deletion"
    }, async () => new Response(JSON.stringify(payload), { status: 202 })), /start phone verification/i)
  }
  for (const payload of [{ expiresAt: "2999-01-01T00:05:00.000Z" }, { confirmationToken: "proof" }]) {
    await assert.rejects(verifyFirebaseAccountAction("https://api.blumi.test", "token", {
      idToken: "test-firebase-proof", challengeId: "challenge", purpose: "account_deletion"
    }, async () => new Response(JSON.stringify(payload), { status: 200 })), /verify your phone/i)
  }
})

test("a Firebase challenge keeps the account phone the server names, and only a well-formed one", async () => {
  const challenge = (body: Record<string, unknown>) => requestFirebaseAccountActionChallenge("https://api.blumi.test", "token", {
    purpose: "account_deletion"
  }, async () => new Response(JSON.stringify({ challengeId: "challenge", expiresAt: "2999-01-01T00:05:00.000Z", ...body }), { status: 200 }))
  assert.equal((await challenge({ targetPhoneNumber: "+900000000001" })).targetPhoneNumber, "+900000000001")
  assert.equal("targetPhoneNumber" in (await challenge({})), false, "an older server names none")
  assert.equal("targetPhoneNumber" in (await challenge({ targetPhoneNumber: "not a phone" })), false)
})

test("a Firebase challenge keeps the server's withheld flag only when it is exactly true", async () => {
  const challenge = (body: Record<string, unknown>) => requestFirebaseAccountActionChallenge("https://api.blumi.test", "token", {
    purpose: "account_deletion", targetPhoneNumber: "+900000000001"
  }, async () => new Response(JSON.stringify({ challengeId: "challenge", expiresAt: "2999-01-01T00:05:00.000Z", ...body }), { status: 200 }))
  assert.equal((await challenge({ targetPhoneNumberWithheld: true })).targetPhoneNumberWithheld, true)
  assert.equal("targetPhoneNumberWithheld" in (await challenge({})), false, "an older server sends no flag")
  assert.equal("targetPhoneNumberWithheld" in (await challenge({ targetPhoneNumberWithheld: "yes" })), false)
})

test("account deletion calls the production account boundary", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  await deleteProductionAccount(
    "https://api.blumi.test",
    "production-token",
    "deletion-confirmation-token",
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/account")
  assert.equal(fetchCalls[0]?.init?.method, "DELETE")
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer production-token"
  )
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    confirmationToken: "deletion-confirmation-token"
  })
})

test("account deletion reauthentication uses the authenticated Firebase challenge and proof", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return calls.length === 1
      ? new Response(JSON.stringify({ challengeId: "delete-challenge", expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 202 })
      : new Response(JSON.stringify({ confirmationToken: "delete-token", expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 200 })
  }
  const challenge = await requestFirebaseAccountActionChallenge("https://api.blumi.test", "production-token", {
    purpose: "account_deletion"
  }, fetcher)
  const confirmation = await verifyFirebaseAccountAction("https://api.blumi.test", "production-token", {
    idToken: "test-firebase-proof", challengeId: challenge.challengeId, purpose: "account_deletion"
  }, fetcher)
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/firebase/challenge")
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/firebase/reauth")
  for (const call of calls) {
    assert.equal(call.init?.method, "POST")
    assert.equal((call.init?.headers as Record<string, string>).authorization, "Bearer production-token")
  }
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { purpose: "account_deletion" })
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    idToken: "test-firebase-proof", challengeId: "delete-challenge", purpose: "account_deletion"
  })
  assert.equal(confirmation.confirmationToken, "delete-token")
})

test("account data export uses a Firebase proof before authenticated download", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        challengeId: "export-challenge", expiresAt: "2999-01-01T00:05:00.000Z"
      }), { status: 202 })
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({
        confirmationToken: "export-token", expiresAt: "2999-01-01T00:05:00.000Z"
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      schemaVersion: "2026-07-21", exportedAt: "2026-07-21T10:00:00.000Z",
      account: { phoneNumber: "[redacted]" }, exclusions: ["staff-only records"], data: {}
    }) + "\n", { status: 200, headers: { "content-type": "application/json", "x-blumi-export-format": "json-v1" } })
  }
  const challenge = await requestFirebaseAccountActionChallenge("https://api.blumi.test", "production-token", {
    purpose: "account_data_export"
  }, fetcher)
  const confirmation = await verifyFirebaseAccountAction("https://api.blumi.test", "production-token", {
    idToken: "test-firebase-proof", challengeId: challenge.challengeId, purpose: "account_data_export"
  }, fetcher)
  let downloadedJson = ""
  const exported = await downloadAccountDataExport("https://api.blumi.test", "production-token",
    confirmation.confirmationToken, fetcher, undefined,
    () => ({ uri: "file:///cache/test-export.json", write: (chunk) => { downloadedJson += new TextDecoder().decode(chunk) },
      close: () => {}, dispose: async () => {} })
  )
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/firebase/challenge")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { purpose: "account_data_export" })
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/firebase/reauth")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    idToken: "test-firebase-proof", challengeId: "export-challenge", purpose: "account_data_export"
  })
  assert.equal(calls[2]?.url, "https://api.blumi.test/v1/account/export")
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { confirmationToken: "export-token" })
  assert.equal((calls[2]?.init?.headers as Record<string, string>).authorization, "Bearer production-token")
  assert.equal(JSON.parse(downloadedJson).account.phoneNumber, "[redacted]")
  assert.equal(exported.uri, "file:///cache/test-export.json")
})

test("lost-phone recovery submits a Firebase ID token for the new number", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ status: "accepted" }), { status: 202 })
  }

  await submitAccountRecoveryRequest(
    "https://api.blumi.test",
    {
      oldPhoneNumber: "+905551112233",
      newPhoneNumber: "+905559998877",
      idToken: "firebase-id-token"
    },
    fetcher
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/recovery/requests")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    oldPhoneNumber: "+905551112233",
    newPhoneNumber: "+905559998877",
    idToken: "firebase-id-token"
  })
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, undefined)
})

test("phone change binds Firebase proofs to current and new-number challenges", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return calls.length === 1 || calls.length === 3
      ? new Response(JSON.stringify({ challengeId: `challenge-${calls.length}`, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 202 })
      : calls.length === 2 || calls.length === 4
        ? new Response(JSON.stringify({ confirmationToken: `token-${calls.length}`, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 200 })
        : new Response(null, { status: 204 })
  }
  const currentChallenge = await requestFirebaseAccountActionChallenge("https://api.blumi.test", "production-token", {
    purpose: "phone_change_current"
  }, fetcher)
  const current = await verifyFirebaseAccountAction("https://api.blumi.test", "production-token", {
    idToken: "test-current-proof", challengeId: currentChallenge.challengeId, purpose: "phone_change_current"
  }, fetcher)
  const nextChallenge = await requestFirebaseAccountActionChallenge("https://api.blumi.test", "production-token", {
    purpose: "phone_change_new", targetPhoneNumber: "+905559998877"
  }, fetcher)
  const next = await verifyFirebaseAccountAction("https://api.blumi.test", "production-token", {
    idToken: "test-new-proof", challengeId: nextChallenge.challengeId, purpose: "phone_change_new",
    currentPhoneConfirmationToken: current.confirmationToken
  }, fetcher)
  await confirmPhoneChange("https://api.blumi.test", "production-token", current.confirmationToken,
    next.confirmationToken, fetcher)

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/firebase/challenge")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { purpose: "phone_change_current" })
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/firebase/reauth")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    idToken: "test-current-proof", challengeId: "challenge-1", purpose: "phone_change_current"
  })
  assert.equal(calls[2]?.url, "https://api.blumi.test/v1/account/firebase/challenge")
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    purpose: "phone_change_new", targetPhoneNumber: "+905559998877"
  })
  assert.equal(calls[3]?.url, "https://api.blumi.test/v1/account/firebase/reauth")
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
    idToken: "test-new-proof", challengeId: "challenge-3", purpose: "phone_change_new",
    currentPhoneConfirmationToken: "token-2"
  })
  assert.equal(calls[4]?.url, "https://api.blumi.test/v1/account/phone-change/confirm")
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), {
    currentPhoneConfirmationToken: "token-2", newPhoneConfirmationToken: "token-4"
  })
  for (const call of calls) {
    assert.equal((call.init?.headers as Record<string, string>).authorization, "Bearer production-token")
  }
})

test("account deletion surfaces backend errors", async () => {
  await assert.rejects(
    deleteProductionAccount(
      "https://api.blumi.test",
      "expired-token",
      "stale-confirmation-token",
      async () => new Response(JSON.stringify({
        error: "Sign in again to continue."
      }), { status: 401 })
    ),
    /Sign in again/
  )
})

test("sign out revokes the active production session", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  await revokeProductionSession(
    "https://api.blumi.test/",
    "production-token",
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/auth/session")
  assert.equal(fetchCalls[0]?.init?.method, "DELETE")
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer production-token"
  )
})

test("production profile update calls the account profile boundary", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  const legacyProfileInput = {
    displayName: "Defne Yildiz",
    age: 24,
    avatarPresetId: "sunset",
    bio: "Slow coffee, fast wit.",
    gender: "woman" as const,
    interests: ["coffee", "music"],
    locationLat: 41.01,
    locationLng: 28.97
  } as Parameters<typeof updateProductionProfile>[2]
  const profile = await updateProductionProfile(
    "https://api.blumi.test/",
    "production-token",
    legacyProfileInput,
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        profile: {
          userId: "user-1",
          displayName: "Defne Yildiz",
          age: 24,
          bio: "Slow coffee, fast wit.",
          gender: "woman",
          interests: ["coffee", "music"],
          location: { lat: 41.01, lng: 28.97 },
          avatar: { presetId: "sunset" }
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/users/me")
  assert.equal(fetchCalls[0]?.init?.method, "PATCH")
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer production-token"
  )
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    displayName: "Defne Yildiz",
    age: 24,
    avatarPresetId: "sunset",
    bio: "Slow coffee, fast wit.",
    gender: "woman",
    interests: ["coffee", "music"],
  })
  assert.equal(profile.displayName, "Defne Yildiz")
  assert.equal(profile.avatar.presetId, "sunset")
  assert.equal(profile.bio, "Slow coffee, fast wit.")
  assert.deepEqual(profile.interests, ["coffee", "music"])
  assert.equal(profile.location, undefined)
})

test("production profile fetch loads the latest account profile", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  const profile = await fetchProductionProfile(
    "https://api.blumi.test/",
    "production-token",
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        profile: {
          userId: "user-1",
          displayName: "Defne",
          age: 25,
          bio: "Bookstores and tea.",
          gender: "woman",
          interests: ["books", "tea"],
          location: { lat: 40.99, lng: 29.02 },
          avatar: { presetId: "dusk" }
        },
        onboarding: {
          profile: "complete",
          avatar: "incomplete",
          room: "incomplete"
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/users/me")
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer production-token"
  )
  assert.equal(profile.displayName, "Defne")
  assert.equal(profile.age, 25)
  assert.equal(profile.bio, "Bookstores and tea.")
  assert.deepEqual(profile.interests, ["books", "tea"])
  assert.equal(profile.location, undefined)
})

test("production account snapshot reconciles profile and onboarding together", async () => {
  const snapshot = await sessionApi.fetchProductionAccountSnapshot(
    "https://api.blumi.test",
    "production-token",
    async () => new Response(JSON.stringify({
      profile: {
        userId: "user-1",
        displayName: "Defne",
        age: 25,
        avatar: { presetId: "dusk" }
      },
      onboarding: {
        profile: "complete",
        avatar: "complete",
        room: "incomplete"
      },
      moderation: {
        status: "warned",
        updatedAt: "2026-07-21T09:00:00.000Z"
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  )

  assert.equal(snapshot.profile.displayName, "Defne")
  assert.deepEqual(snapshot.onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "incomplete"
  })
  assert.equal(snapshot.moderation?.status, "warned")
})

test("production account snapshot opts into V2 avatar reads only after resolution", async () => {
  let headers: Record<string, string> | undefined
  await sessionApi.fetchProductionAccountSnapshot(
    "https://api.blumi.test",
    "production-token",
    async (_url, init) => {
      headers = init?.headers as Record<string, string>
      return new Response(JSON.stringify({
        profile: {
          userId: "user-1",
          displayName: "Defne",
          age: 25,
          avatar: { presetId: "dusk" }
        },
        onboarding: {
          profile: "complete",
          avatar: "complete",
          room: "complete"
        },
        moderation: { status: "active", updatedAt: "2026-08-11T10:00:00.000Z" }
      }), { status: 200 })
    },
    undefined,
    { avatar_loadout_v2_read: true }
  )

  assert.equal(
    headers?.["x-blumi-client-capabilities"],
    "avatar_loadout_v2_read"
  )
})

test("account moderation acknowledgement uses the authenticated safety boundary", async () => {
  const moderation = await acknowledgeAccountModeration(
    "https://api.blumi.test/",
    "production-token",
    async (url, init) => {
      assert.equal(
        String(url),
        "https://api.blumi.test/v1/account/moderation/acknowledge"
      )
      assert.equal(init?.method, "POST")
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer production-token"
      )
      return new Response(JSON.stringify({
        moderation: { status: "active", updatedAt: "2026-07-21T10:00:00.000Z" }
      }), { status: 200 })
    }
  )

  assert.equal(moderation.status, "active")
})

test("restricted current-account response preserves the machine-readable status", async () => {
  await assert.rejects(
    sessionApi.fetchProductionAccountSnapshot(
      "https://api.blumi.test",
      "production-token",
      async () => new Response(JSON.stringify({
        code: "ACCOUNT_SUSPENDED",
        status: "suspended",
        suspendedUntil: "2026-07-28T09:00:00.000Z",
        error: "Your account is currently restricted."
      }), { status: 403 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof AccountAccessError)
      assert.equal(error.moderation.status, "suspended")
      assert.equal(error.moderation.suspendedUntil, "2026-07-28T09:00:00.000Z")
      return true
    }
  )
})

test("production profile update rejects backend and malformed profile responses", async () => {
  await assert.rejects(
    updateProductionProfile(
      "https://api.blumi.test",
      "expired-token",
      { displayName: "Defne" },
      async () => new Response(JSON.stringify({
        error: "Sign in again to continue."
      }), { status: 401 })
    ),
    /Sign in again/
  )

  await assert.rejects(
    updateProductionProfile(
      "https://api.blumi.test",
      "production-token",
      { displayName: "Defne" },
      async () => new Response(JSON.stringify({
        profile: { userId: "user-1", displayName: "Defne" },
        onboarding: {
          profile: "complete",
          avatar: "incomplete",
          room: "incomplete"
        }
      }), { status: 200 })
    ),
    /saved profile/
  )
})

test("production profile fetch rejects backend and malformed profile responses", async () => {
  await assert.rejects(
    fetchProductionProfile(
      "https://api.blumi.test",
      "expired-token",
      async () => new Response(JSON.stringify({
        error: "Sign in again to continue."
      }), { status: 401 })
    ),
    /Sign in again/
  )

  await assert.rejects(
    fetchProductionProfile(
      "https://api.blumi.test",
      "production-token",
      async () => new Response(JSON.stringify({
        profile: { userId: "user-1", displayName: "Defne" },
        onboarding: {
          profile: "complete",
          avatar: "incomplete",
          room: "incomplete"
        }
      }), { status: 200 })
    ),
    /saved profile/
  )
})

test("Firebase completion rejects missing account or session identifiers", async () => {
  await assert.rejects(
    completeFirebaseAccount(
      "https://api.blumi.test",
      {
        idToken: "test-firebase-proof",
        authIntent: "create",
        termsAcceptance: TEST_TERMS_ACCEPTANCE
      },
      async () => new Response(JSON.stringify({
        session: {
          mode: "production",
          userId: "user-1",
          sessionToken: "production-token",
          expiresAt: "2999-01-01T00:00:00.000Z"
        },
        profile: {
          userId: "user-1",
          displayName: "",
          avatar: { presetId: "dusk" }
        }
      }), { status: 200 })
    ),
    /account setup/i
  )
})

test("Firebase completion rejects a response without an explicit mode", async () => {
  await assert.rejects(
    completeFirebaseAccount(
      "https://api.blumi.test",
      {
        idToken: "test-firebase-proof",
        authIntent: "create",
        termsAcceptance: TEST_TERMS_ACCEPTANCE
      },
      async () => new Response(JSON.stringify({
        session: {
          accountId: "account-1",
          sessionId: "session-1",
          userId: "user-1",
          sessionToken: "production-token",
          expiresAt: "2999-01-01T00:00:00.000Z"
        },
        profile: {
          userId: "user-1",
          displayName: "",
          avatar: { presetId: "dusk" }
        }
      }), { status: 200 })
    ),
    /account setup/i
  )
})

test("Firebase completion rejects an explicit demo identity", async () => {
  await assert.rejects(
    completeFirebaseAccount(
      "https://api.blumi.test",
      {
        idToken: "test-firebase-proof",
        authIntent: "create",
        termsAcceptance: TEST_TERMS_ACCEPTANCE
      },
      async () => new Response(JSON.stringify({
        session: {
          userId: "demo-user",
          sessionToken: "demo-session-token",
          expiresAt: "2999-01-01T00:00:00.000Z",
          accountId: "demo-user",
          sessionId: "demo-session",
          mode: "demo",
          onboarding: {
            profile: "complete",
            avatar: "complete",
            room: "complete"
          }
        },
        profile: {
          userId: "demo-user",
          displayName: "Demo Vibe",
          avatar: { presetId: "sunset" }
        }
      }), { status: 200 })
    ),
    /account setup/i
  )
})

test("returning Firebase completion preserves completed server onboarding", async () => {
  const actor = await completeFirebaseAccount(
    "https://api.blumi.test",
    {
      idToken: "test-firebase-proof",
      authIntent: "create",
      termsAcceptance: TEST_TERMS_ACCEPTANCE
    },
    async () => new Response(JSON.stringify({
      session: {
        accountId: "account-1",
        sessionId: "session-1",
        mode: "production",
        userId: "user-1",
        sessionToken: "production-token",
        expiresAt: "2999-01-01T00:00:00.000Z",
        onboarding: {
          profile: "complete",
          avatar: "complete",
          room: "complete"
        }
      },
      profile: {
        userId: "user-1",
        displayName: "",
        avatar: { presetId: "dusk" }
      }
    }), { status: 200 })
  )

  assert.equal(actor.session.onboarding.profile, "complete")
  assert.equal(actor.session.onboarding.avatar, "complete")
  assert.equal(actor.session.onboarding.room, "complete")
})

test("Firebase completion rejects a response without authoritative onboarding", async () => {
  await assert.rejects(
    completeFirebaseAccount(
      "https://api.blumi.test",
      {
        idToken: "test-firebase-proof",
        authIntent: "create",
        termsAcceptance: TEST_TERMS_ACCEPTANCE
      },
      async () => new Response(JSON.stringify({
        session: {
          accountId: "account-1",
          sessionId: "session-1",
          mode: "production",
          userId: "user-1",
          sessionToken: "production-token",
          expiresAt: "2999-01-01T00:00:00.000Z"
        },
        profile: {
          userId: "user-1",
          displayName: "Defne",
          avatar: { presetId: "dusk" }
        }
      }), { status: 200 })
    ),
    /onboarding|account setup/i
  )
})

test("production setup completion uses the authenticated durable boundary", async () => {
  const completeProductionOnboardingStep = (
    sessionApi as unknown as Record<string, unknown>
  ).completeProductionOnboardingStep
  assert.equal(
    typeof completeProductionOnboardingStep,
    "function",
    "sessionApi must expose the server-authoritative onboarding mutation"
  )

  const fetchCalls: { url: string; init?: RequestInit }[] = []
  const onboarding = await (
    completeProductionOnboardingStep as (
      baseHttpUrl: string,
      sessionToken: string,
      step: "profile" | "avatar" | "room",
      fetcher: typeof fetch
    ) => Promise<{
      profile: "incomplete" | "complete"
      avatar: "incomplete" | "complete"
      room: "incomplete" | "complete"
      completedAt?: string
    }>
  )(
    "https://api.blumi.test/",
    "production-token",
    "avatar",
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        onboarding: {
          profile: "complete",
          avatar: "complete",
          room: "incomplete"
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(
    fetchCalls[0]?.url,
    "https://api.blumi.test/v1/users/me/onboarding"
  )
  assert.equal(fetchCalls[0]?.init?.method, "PATCH")
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer production-token"
  )
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    step: "avatar"
  })
  assert.deepEqual(onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "incomplete"
  })
})

const API = "https://api.blumi.test"

registerBoundedRequestTests([
  {
    name: "Firebase account completion POST",
    run: (fetcher) => sessionApi.completeFirebaseAccount(API, {
      idToken: "firebase-id-token",
      authIntent: "sign-in"
    }, fetcher)
  },
  {
    name: "account deletion DELETE",
    run: (fetcher) => deleteProductionAccount(API, "token", "confirmation", fetcher)
  },
  {
    name: "Firebase reauth POST",
    run: (fetcher) => sessionApi.verifyFirebaseAccountAction(API, "token", {
      idToken: "firebase-id-token",
      challengeId: "challenge-1",
      purpose: "account_deletion"
    }, fetcher)
  },
  {
    name: "Firebase challenge POST",
    run: (fetcher) => sessionApi.requestFirebaseAccountActionChallenge(API, "token", {
      purpose: "account_deletion"
    }, fetcher)
  },
  {
    name: "recovery request POST",
    run: (fetcher) => submitAccountRecoveryRequest(API, {
      oldPhoneNumber: "+905551112233",
      newPhoneNumber: "+905551112244",
      idToken: "firebase-id-token"
    }, fetcher)
  },
  {
    name: "phone change confirm POST",
    run: (fetcher) => confirmPhoneChange(API, "token", "current", "next", fetcher)
  },
  {
    name: "moderation acknowledgement POST",
    run: (fetcher) => acknowledgeAccountModeration(API, "token", fetcher)
  },
  {
    name: "session revoke DELETE",
    run: (fetcher) => revokeProductionSession(API, "token", fetcher)
  },
  {
    name: "profile PATCH",
    run: (fetcher) => updateProductionProfile(API, "token", { displayName: "Defne" }, fetcher)
  },
  {
    name: "onboarding step PATCH",
    run: (fetcher) => sessionApi.completeProductionOnboardingStep(API, "token", "profile", fetcher)
  },
  {
    name: "account snapshot GET",
    run: (fetcher) => sessionApi.fetchProductionAccountSnapshot(API, "token", fetcher)
  }
])

test("session API forwards caller cancellation and skips pre-aborted requests", async () => {
  const controller = new AbortController()
  let calls = 0
  let transportSignal: AbortSignal | null | undefined
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = sessionApi.fetchProductionAccountSnapshot(API, "token", async (_url, init) => {
    calls += 1
    transportSignal = init?.signal
    entered()
    return new Promise<Response>(() => {})
  }, controller.signal)
  const rejected = assert.rejects(request, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
  await assert.rejects(
    revokeProductionSession(API, "token", async () => {
      calls += 1
      return new Response(null, { status: 204 })
    }, controller.signal),
    { name: "AbortError" }
  )
  assert.equal(calls, 1)
})

test("session API keeps unreadable error bodies on their existing fallback copy", async () => {
  await assert.rejects(
    updateProductionProfile(API, "token", { displayName: "Defne" },
      async () => new Response("<html>bad gateway</html>", { status: 502 })),
    /could not save your profile yet/i
  )
  await assert.rejects(
    sessionApi.fetchProductionAccountSnapshot(API, "token",
      async () => new Response("", { status: 503 })),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error instanceof AccountAccessError, false)
      assert.match(error.message, /could not refresh your profile yet/i)
      return true
    }
  )
})

test("Firebase completion maps 409 ACCOUNT_RECOVERY_REQUIRED to the recovery message", async () => {
  const fetcher = (async () => new Response(
    JSON.stringify({ code: "ACCOUNT_RECOVERY_REQUIRED", error: "Server wording" }),
    { status: 409, headers: { "content-type": "application/json" } }
  )) as typeof fetch
  await assert.rejects(
    sessionApi.completeFirebaseAccount(API, { idToken: "firebase-id-token", authIntent: "sign-in" }, fetcher),
    (error: Error) => error.message === ACCOUNT_RECOVERY_REQUIRED_MESSAGE
  )
})

test("Firebase registration for a phone that already has an account asks the user to sign in", async () => {
  const fetcher = (async () => new Response(
    JSON.stringify({ code: "ACCOUNT_ALREADY_EXISTS", error: "Server wording" }),
    { status: 409, headers: { "content-type": "application/json" } }
  )) as typeof fetch
  await assert.rejects(
    sessionApi.completeFirebaseAccount(API, {
      idToken: "firebase-id-token",
      authIntent: "create",
      termsAcceptance: TEST_TERMS_ACCEPTANCE
    }, fetcher),
    (error: Error) => sessionApi.isAccountAlreadyExistsMessage(error.message)
  )
})

test("signing into the existing account reuses the verified phone as a sign-in, never a registration", async () => {
  const bodies: unknown[] = []
  const actor = await sessionApi.signInExistingFirebaseAccount(API, async () => "verified-id-token", (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({
      session: {
        accountId: "account-1",
        sessionId: "session-2",
        mode: "production",
        userId: "user-1",
        sessionToken: "production-token",
        expiresAt: "2999-01-01T00:00:00.000Z",
        onboarding: { profile: "complete", avatar: "complete", room: "complete" }
      },
      profile: { userId: "user-1", displayName: "Ece", avatar: { presetId: "dusk" } }
    }), { status: 200 })
  }) as typeof fetch)
  assert.deepEqual(bodies, [{ idToken: "verified-id-token", authIntent: "sign-in" }])
  assert.equal(actor.session.userId, "user-1")
})

test("signing into the existing account without a verified phone asks for a new code and sends nothing", async () => {
  let requests = 0
  const fetcher = (async () => { requests += 1; return new Response("{}") }) as typeof fetch
  for (const readToken of [async () => null, async () => { throw new Error("native") }]) {
    await assert.rejects(
      sessionApi.signInExistingFirebaseAccount(API, readToken, fetcher),
      /new code/
    )
  }
  assert.equal(requests, 0)
})
