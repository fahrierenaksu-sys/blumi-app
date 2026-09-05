import assert from "node:assert/strict"
import test from "node:test"
import {
  AccountAccessError,
  acknowledgeAccountModeration,
  deleteProductionAccount,
  downloadAccountDataExport,
  fetchProductionProfile,
  requestAccountDataExportChallenge,
  requestAccountRecoveryChallenge,
  registerAccount,
  requestAccountDeletionChallenge,
  requestPhoneChangeCurrentChallenge,
  requestPhoneChangeNewNumberChallenge,
  revokeProductionSession,
  sendVerificationCode,
  submitAccountRecoveryRequest,
  updateProductionProfile,
  updateSessionActorProfile,
  verifyAccountDataExportCode,
  verifyAccountDeletionCode,
  verifyPhoneChangeCurrentCode,
  verifyPhoneChangeNewNumberCode,
  confirmPhoneChange
} from "./sessionApi"
import * as sessionApi from "./sessionApi"
import { createDemoSessionActor } from "./sessionModel"
import { LEGAL_DOCUMENT_VERSION } from "../legal/legalPolicyMetadata"

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
    interests: ["coffee", "jazz"],
    locationLat: 41.01,
    locationLng: 28.97
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
  assert.deepEqual(updated.profile.location, { lat: 41.01, lng: 28.97 })
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

test("register preserves the server-authoritative incomplete onboarding status", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  const actor = await registerAccount(
    "https://api.blumi.test",
    {
      phoneNumber: "+905551112233",
      verificationCode: "482931",
        termsAcceptance: {
        version: "2026.08.31",
        locale: "tr"
      }
    },
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        session: {
          accountId: "account-1",
          sessionId: "session-1",
          mode: "production",
          userId: "user-1",
          sessionToken: "production-token",
          expiresAt: "2999-01-01T00:00:00.000Z",
          onboarding: {
            profile: "incomplete",
            avatar: "incomplete",
            room: "incomplete"
          }
        },
        profile: {
          userId: "user-1",
          displayName: "",
          avatar: { presetId: "dusk" }
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/accounts/register")
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    phoneNumber: "+905551112233",
    verificationCode: "482931",
    termsAcceptance: {
      version: "2026.08.31",
      locale: "tr"
    }
  })
  assert.equal(actor.session.mode, "production")
  assert.equal(actor.session.onboarding.profile, "incomplete")
  assert.equal(actor.session.onboarding.avatar, "incomplete")
  assert.equal(actor.session.onboarding.room, "incomplete")
})

test("verification code request uses the SMS auth boundary", async () => {
  const fetchCalls: { url: string; init?: RequestInit }[] = []
  const result = await sendVerificationCode(
    "https://api.blumi.test",
    {
      phoneNumber: "+905551112233"
    },
    async (url, init) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        ok: true,
        expiresAt: "2999-01-01T00:05:00.000Z"
      }), {
        status: 202,
        headers: { "content-type": "application/json" }
      })
    }
  )

  assert.equal(fetchCalls[0]?.url, "https://api.blumi.test/v1/auth/send-code")
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    phoneNumber: "+905551112233"
  })
  assert.equal(result.expiresAt, "2999-01-01T00:05:00.000Z")
})

test("verification code request times out instead of leaving the CTA loading forever", async () => {
  await assert.rejects(
    sendVerificationCode(
      "https://api.blumi.test",
      { phoneNumber: "+905551112233" },
      (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"))
        }, { once: true })
      }),
      undefined,
      10
    ),
    /connection.*timed out/i
  )
})

test("verification code response parsing also times out", async () => {
  const hangingResponse = {
    ok: true,
    json: () => new Promise<never>(() => undefined)
  } as unknown as Response

  await assert.rejects(
    sendVerificationCode(
      "https://api.blumi.test",
      { phoneNumber: "+905551112233" },
      async () => hangingResponse,
      undefined,
      10
    ),
    /connection.*timed out/i
  )
})

test("auth requests never log a full phone number or verification code", {
  concurrency: false
}, async () => {
  const phoneNumber = "+905551112233"
  const verificationCode = "482931"
  const consoleEntries: unknown[][] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => {
    consoleEntries.push(args)
  }
  console.error = (...args: unknown[]) => {
    consoleEntries.push(args)
  }

  try {
    await sendVerificationCode(
      "https://api.blumi.test",
      { phoneNumber },
      async () => new Response(JSON.stringify({
        ok: true,
        expiresAt: "2999-01-01T00:05:00.000Z"
      }), { status: 202 })
    )
    await registerAccount(
      "https://api.blumi.test",
      {
        phoneNumber,
        verificationCode,
        termsAcceptance: {
          version: "2026.08.31",
          locale: "tr"
        }
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
            profile: "incomplete",
            avatar: "incomplete",
            room: "incomplete"
          }
        },
        profile: {
          userId: "user-1",
          displayName: "",
          avatar: { presetId: "dusk" }
        }
      }), { status: 200 })
    )
    await assert.rejects(
      sendVerificationCode(
        "https://api.blumi.test",
        { phoneNumber },
        async () => new Response(JSON.stringify({
          error: `Could not send to ${phoneNumber}.`
        }), { status: 503 })
      )
    )
    await assert.rejects(
      registerAccount(
        "https://api.blumi.test",
        {
          phoneNumber,
          verificationCode,
          termsAcceptance: {
            version: "2026.08.31",
            locale: "tr"
          }
        },
        async () => new Response(JSON.stringify({
          error: `Code ${verificationCode} is invalid for ${phoneNumber}.`
        }), { status: 401 })
      )
    )
  } finally {
    console.log = originalLog
    console.error = originalError
  }

  const renderedEntries = consoleEntries
    .flatMap((entry) => entry.map((value) =>
      typeof value === "string" ? value : JSON.stringify(value)
    ))
    .join(" ")
  assert.equal(renderedEntries.includes(phoneNumber), false)
  assert.equal(renderedEntries.includes(verificationCode), false)
})

test("auth errors redact submitted phone numbers and verification codes", async () => {
  const phoneNumber = "+905551112233"
  const verificationCode = "482931"

  await assert.rejects(
    sendVerificationCode(
      "https://api.blumi.test",
      { phoneNumber },
      async () => new Response(JSON.stringify({
        error: `Could not send to ${phoneNumber}.`
      }), { status: 503 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /could not send/i)
      assert.equal(error.message.includes(phoneNumber), false)
      return true
    }
  )

  await assert.rejects(
    registerAccount(
      "https://api.blumi.test",
      { phoneNumber, verificationCode, termsAcceptance: TEST_TERMS_ACCEPTANCE },
      async () => new Response(JSON.stringify({
        error: `Code ${verificationCode} is invalid for ${phoneNumber}.`
      }), { status: 401 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /invalid/i)
      assert.equal(error.message.includes(phoneNumber), false)
      assert.equal(error.message.includes(verificationCode), false)
      return true
    }
  )
})

test("verification code request rejects malformed success payloads", async () => {
  await assert.rejects(
    sendVerificationCode(
      "https://api.blumi.test",
      {
        phoneNumber: "+905551112233"
      },
      async () => new Response(JSON.stringify({ ok: true }), { status: 202 })
    ),
    /SMS code window/i
  )
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

test("account deletion reauthentication uses dedicated challenge and verify boundaries", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return calls.length === 1
      ? new Response(JSON.stringify({ ok: true, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 202 })
      : new Response(JSON.stringify({ confirmationToken: "delete-token", expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 200 })
  }
  await requestAccountDeletionChallenge("https://api.blumi.test", "production-token", fetcher)
  const confirmation = await verifyAccountDeletionCode("https://api.blumi.test", "production-token", { verificationCode: "482931" }, fetcher)
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/deletion/challenge")
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/deletion/confirm")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { verificationCode: "482931" })
  assert.equal(confirmation.confirmationToken, "delete-token")
})

test("account data export uses dedicated challenge, verify, and download boundaries", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        ok: true,
        expiresAt: "2999-01-01T00:05:00.000Z"
      }), { status: 202 })
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({
        confirmationToken: "export-token",
        expiresAt: "2999-01-01T00:05:00.000Z"
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      schemaVersion: "2026-07-21",
      exportedAt: "2026-07-21T10:00:00.000Z",
      account: { phoneNumber: "+905551112233" },
      exclusions: ["staff-only records"], data: {}
    }) + "\n", { status: 200, headers: { "content-type": "application/json", "x-blumi-export-format": "json-v1" } })
  }

  await requestAccountDataExportChallenge(
    "https://api.blumi.test",
    "production-token",
    fetcher
  )
  const confirmation = await verifyAccountDataExportCode(
    "https://api.blumi.test",
    "production-token",
    "482931",
    fetcher
  )
  let downloadedJson = ""
  const exported = await downloadAccountDataExport(
    "https://api.blumi.test",
    "production-token",
    confirmation.confirmationToken,
    fetcher,
    undefined,
    () => ({ uri: "file:///cache/test-export.json", write: (chunk) => { downloadedJson += new TextDecoder().decode(chunk) },
      close: () => {}, dispose: async () => {} })
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/export/challenge")
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/export/confirm")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { verificationCode: "482931" })
  assert.equal(calls[2]?.url, "https://api.blumi.test/v1/account/export")
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { confirmationToken: "export-token" })
  assert.equal(
    JSON.parse(downloadedJson).account.phoneNumber,
    "+905551112233"
  )
  assert.equal(exported.uri, "file:///cache/test-export.json")
})

test("lost-phone recovery verifies only the new number before creating a generic review request", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return calls.length === 1
      ? new Response(JSON.stringify({ ok: true, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 202 })
      : new Response(JSON.stringify({ status: "accepted" }), { status: 202 })
  }

  await requestAccountRecoveryChallenge(
    "https://api.blumi.test",
    "+905559998877",
    fetcher
  )
  await submitAccountRecoveryRequest(
    "https://api.blumi.test",
    {
      oldPhoneNumber: "+905551112233",
      newPhoneNumber: "+905559998877",
      verificationCode: "482931"
    },
    fetcher
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/recovery/challenge")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    phoneNumber: "+905559998877"
  })
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/recovery/requests")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    oldPhoneNumber: "+905551112233",
    newPhoneNumber: "+905559998877",
    verificationCode: "482931"
  })
  assert.equal((calls[1]?.init?.headers as Record<string, string>).authorization, undefined)
})

test("phone change uses current-proof, new-number, and confirm boundaries", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return calls.length === 1 || calls.length === 3
      ? new Response(JSON.stringify({ ok: true, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 202 })
      : calls.length === 2 || calls.length === 4
        ? new Response(JSON.stringify({ confirmationToken: `token-${calls.length}`, expiresAt: "2999-01-01T00:05:00.000Z" }), { status: 200 })
        : new Response(null, { status: 204 })
  }

  await requestPhoneChangeCurrentChallenge(
    "https://api.blumi.test",
    "production-token",
    fetcher
  )
  const current = await verifyPhoneChangeCurrentCode(
    "https://api.blumi.test",
    "production-token",
    "482931",
    fetcher
  )
  await requestPhoneChangeNewNumberChallenge(
    "https://api.blumi.test",
    "production-token",
    "+905559998877",
    current.confirmationToken,
    fetcher
  )
  const next = await verifyPhoneChangeNewNumberCode(
    "https://api.blumi.test",
    "production-token",
    "593804",
    fetcher
  )
  await confirmPhoneChange(
    "https://api.blumi.test",
    "production-token",
    current.confirmationToken,
    next.confirmationToken,
    fetcher
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/account/phone-change/current/challenge")
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/account/phone-change/current/confirm")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { verificationCode: "482931" })
  assert.equal(calls[2]?.url, "https://api.blumi.test/v1/account/phone-change/new/challenge")
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    phoneNumber: "+905559998877",
    currentPhoneConfirmationToken: "token-2"
  })
  assert.equal(calls[3]?.url, "https://api.blumi.test/v1/account/phone-change/new/confirm")
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { verificationCode: "593804" })
  assert.equal(calls[4]?.url, "https://api.blumi.test/v1/account/phone-change/confirm")
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), {
    currentPhoneConfirmationToken: "token-2",
    newPhoneConfirmationToken: "token-4"
  })
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
  const profile = await updateProductionProfile(
    "https://api.blumi.test/",
    "production-token",
    {
      displayName: "Defne Yildiz",
      age: 24,
      avatarPresetId: "sunset",
      bio: "Slow coffee, fast wit.",
      gender: "woman",
      interests: ["coffee", "music"],
      locationLat: 41.01,
      locationLng: 28.97
    },
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
    locationLat: 41.01,
    locationLng: 28.97
  })
  assert.equal(profile.displayName, "Defne Yildiz")
  assert.equal(profile.avatar.presetId, "sunset")
  assert.equal(profile.bio, "Slow coffee, fast wit.")
  assert.deepEqual(profile.interests, ["coffee", "music"])
  assert.deepEqual(profile.location, { lat: 41.01, lng: 28.97 })
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
  assert.deepEqual(profile.location, { lat: 40.99, lng: 29.02 })
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

test("production registration rejects missing account or session identifiers", async () => {
  await assert.rejects(
    registerAccount(
      "https://api.blumi.test",
      {
        phoneNumber: "+905551112233",
        verificationCode: "482931",
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

test("production registration rejects a response without an explicit mode", async () => {
  await assert.rejects(
    registerAccount(
      "https://api.blumi.test",
      {
        phoneNumber: "+905551112233",
        verificationCode: "482931",
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

test("production registration rejects an explicit demo identity", async () => {
  await assert.rejects(
    registerAccount(
      "https://api.blumi.test",
      {
        phoneNumber: "+905551112233",
        verificationCode: "482931",
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

test("returning production registration preserves completed server onboarding", async () => {
  const actor = await registerAccount(
    "https://api.blumi.test",
    {
      phoneNumber: "+905551112233",
      verificationCode: "482931",
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

test("production registration rejects a response without authoritative onboarding", async () => {
  await assert.rejects(
    registerAccount(
      "https://api.blumi.test",
      {
        phoneNumber: "+905551112233",
        verificationCode: "482931",
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
