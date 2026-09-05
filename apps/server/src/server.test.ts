import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService, type AuthService } from "./auth/authService"
import { createInMemoryAuthRepository } from "./auth/authRepository"
import {
  createAccountRecord,
  createDefaultAvatarSelection,
  createBlumiBackendStore,
  type AccountRecord
} from "./auth/authStore"
import { createChatService } from "./chat/chatService"
import { createEconomyService } from "./economy/economyService"
import { createNotificationService } from "./notifications/notificationService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  createSeedDiscoverProfiles
} from "./matches/matchRepository"
import { createMatchService } from "./matches/matchService"
import {createDiscoverySnapshotService,createInMemoryDiscoverySnapshots} from "./matches/discoverySnapshot"
import { createSafetyService } from "./safety/safetyService"
import { createServer } from "./server"
import {
  createAdminTokenService,
  mintAdminToken
} from "./admin/adminTokenService"

const TEST_DISCOVERY_AVATAR = createSeedDiscoverProfiles()[0]!.avatar

test("discovery capacity returns typed 429 but leaves the existing cursor usable", async()=>{
  const authService=createAuthService({store:createBlumiBackendStore(),codeFactory:()=>"482931"})
  const discoverySnapshots=createDiscoverySnapshotService(createInMemoryDiscoverySnapshots(async()=>createSeedDiscoverProfiles()))
  const app=createServer({authService,discoverySnapshots})
  try {
    const token=await registerTestSession(app,"+905551115053")
    await makeAccountEligible(authService,token)
    const resolved=await authService.getSession(token)
    const filters=resolved!.account.profile.discoveryPreferences ?? {ageMin:18,ageMax:99,genders:[],vibes:[]}
    const pages=[]
    for(let i=0;i<30;i++) pages.push(await discoverySnapshots.page({userId:resolved!.account.userId,filters,limit:1}))
    const headers={authorization:`Bearer ${token}`}
    const limited=await app.inject({method:"GET",url:"/v1/discover?limit=1",headers})
    assert.equal(limited.statusCode,429)
    assert.equal(limited.json().code,"DISCOVERY_REFRESH_LIMIT")
    assert.ok(Number(limited.headers["retry-after"])>0)
    const continuation=await app.inject({method:"GET",url:`/v1/discover?limit=1&cursor=${encodeURIComponent(pages[0]!.page.nextCursor!)}`,headers})
    assert.equal(continuation.statusCode,200)
    assert.equal(continuation.json().profiles.length,1)
  } finally {await app.close()}
})

test("app-link verification endpoints expose the configured native identities", async () => {
  const app = createServer({
    appLinks: {
      appleAppId: "TEAM123.com.blumi.mobile",
      androidPackageName: "com.blumi.mobile",
      androidSha256CertFingerprints: ["AA:BB:CC"]
    }
  })

  const apple = await app.inject({
    method: "GET",
    url: "/.well-known/apple-app-site-association"
  })
  assert.equal(apple.statusCode, 200)
  assert.match(apple.headers["content-type"] ?? "", /application\/json/)
  assert.deepEqual(apple.json(), {
    applinks: {
      apps: [],
      details: [{
        appID: "TEAM123.com.blumi.mobile",
        components: [{ "/": "/*" }]
      }]
    }
  })

  const android = await app.inject({
    method: "GET",
    url: "/.well-known/assetlinks.json"
  })
  assert.equal(android.statusCode, 200)
  assert.deepEqual(android.json(), [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.blumi.mobile",
      sha256_cert_fingerprints: ["AA:BB:CC"]
    }
  }])

  await app.close()
})

test("send-code accepts only E.164 phone numbers", async () => {
  const app = createServer()

  const invalid = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "555 111 22 33" }
  })
  assert.equal(invalid.statusCode, 400)

  const valid = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  assert.equal(valid.statusCode, 202)
  assert.equal(valid.json().ok, true)
})

test("verify creates an explicit production session", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const response = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })

  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.session.mode, "production")
  assert.match(body.session.accountId, /^account_/)
  assert.match(body.session.sessionId, /^session_/)
  assert.match(body.session.sessionToken, /^dv_/)
  assert.deepEqual(body.session.onboarding, {
    profile: "incomplete",
    avatar: "incomplete",
    room: "incomplete"
  })
  assert.equal(body.profile.userId, body.session.userId)
  assert.equal(authService.store.sessionsByTokenHash.has(body.session.sessionToken), false)
})

test("send-code rate limits rapid SMS requests", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  const first = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  assert.equal(first.statusCode, 202)

  const second = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  assert.equal(second.statusCode, 429)
  assert.equal(second.headers["retry-after"], "30")
})

test("send-code does not store an OTP when the SMS provider fails", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931",
    smsProvider: {
      sendVerificationCode() {
        throw new Error("SMS provider unavailable")
      }
    }
  })
  const app = createServer({ authService })

  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })

  assert.equal(response.statusCode, 503)
  assert.equal(response.json().error, "We could not send a code right now. Try again shortly.")
  assert.doesNotMatch(JSON.stringify(response.json()), /provider/i)
  assert.equal(await authService.repository.getPendingOtp("+905551112233"), null)
})

test("auth infrastructure failures use the generic 500 contract", async () => {
  const store = createBlumiBackendStore()
  const baseRepository = createInMemoryAuthRepository(store)
  const sendFailureService = createAuthService({
    store,
    repository: {
      ...baseRepository,
      async claimOtpSend() {
        throw new Error("relation blumi_pending_otps leaked detail")
      }
    }
  })
  const sendFailureApp = createServer({ authService: sendFailureService })
  const sendResponse = await sendFailureApp.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })

  assert.equal(sendResponse.statusCode, 500)
  assert.equal(sendResponse.json().error, "Something went wrong.")
  assert.doesNotMatch(JSON.stringify(sendResponse.json()), /relation|pending_otps/i)
  await sendFailureApp.close()

  const verifyFailureService = createAuthService({
    store,
    repository: {
      ...baseRepository,
      async finalizeOtpSignIn() {
        throw new Error("database host leaked detail")
      }
    }
  })
  const verifyFailureApp = createServer({ authService: verifyFailureService })
  const verifyResponse = await verifyFailureApp.inject({
    method: "POST",
    url: "/v1/auth/verify",
    payload: {
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })

  assert.equal(verifyResponse.statusCode, 500)
  assert.equal(verifyResponse.json().error, "Something went wrong.")
  assert.doesNotMatch(JSON.stringify(verifyResponse.json()), /database host/i)
  await verifyFailureApp.close()
})

test("register alias matches the mobile client contract", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "111222" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const response = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: {
      phoneNumber: "+905551112233",
      verificationCode: "111222",
      termsAcceptance: {
        version: "test-terms-v1",
        locale: "en"
      }
    }
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().session.mode, "production")
})

test("returning OTP login and refresh preserve server onboarding state", async () => {
  const phoneNumber = "+905551112233"
  const completedAt = "2026-07-13T09:00:00.000Z"
  const store = createBlumiBackendStore()
  const account = createAccountRecord(
    phoneNumber,
    new Date("2026-07-12T09:00:00.000Z")
  )
  store.accountsByPhone.set(phoneNumber, {
    ...account,
    onboarding: {
      profile: "complete",
      avatar: "complete",
      room: "complete",
      completedAt
    }
  } as AccountRecord)
  const authService = createAuthService({
    store,
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  await authService.sendCode(phoneNumber)
  const signedIn = await app.inject({
    method: "POST",
    url: "/v1/auth/verify",
    payload: {
      phoneNumber,
      verificationCode: "482931"
    }
  })

  assert.equal(signedIn.statusCode, 200)
  assert.deepEqual(signedIn.json().session.onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "complete",
    completedAt
  })

  const refreshed = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    headers: {
      authorization: `Bearer ${signedIn.json().session.sessionToken}`
    }
  })

  assert.equal(refreshed.statusCode, 200)
  assert.deepEqual(
    refreshed.json().session.onboarding,
    signedIn.json().session.onboarding
  )
  await app.close()
})

test("authenticated onboarding completion is idempotent and monotonic", async () => {
  const phoneNumber = "+905551112233"
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  await authService.sendCode(phoneNumber)
  const signedIn = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber,
      verificationCode: "482931"
    }
  })
  const headers = {
    authorization: `Bearer ${signedIn.json().session.sessionToken}`
  }
  await authService.updateProfile(signedIn.json().session.sessionToken, {
    displayName: "Mina",
    age: 24,
    avatarPresetId: "avatar_v2_body_default"
  })
  const missingGender = await app.inject({
    method: "PATCH",
    url: "/v1/users/me/onboarding",
    headers,
    payload: { step: "profile" }
  })
  assert.equal(missingGender.statusCode, 409)
  await authService.updateProfile(signedIn.json().session.sessionToken, {
    gender: "woman"
  })
  const expectedStatuses = [
    {
      profile: "complete",
      avatar: "incomplete",
      room: "incomplete"
    },
    {
      profile: "complete",
      avatar: "complete",
      room: "incomplete"
    },
    {
      profile: "complete",
      avatar: "complete",
      room: "complete"
    }
  ] as const

  for (const [index, step] of ["profile", "avatar", "room"].entries()) {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/onboarding",
      headers,
      payload: { step }
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().onboarding.profile, expectedStatuses[index]?.profile)
    assert.equal(response.json().onboarding.avatar, expectedStatuses[index]?.avatar)
    assert.equal(response.json().onboarding.room, expectedStatuses[index]?.room)
  }

  const repeated = await app.inject({
    method: "PATCH",
    url: "/v1/users/me/onboarding",
    headers,
    payload: { step: "profile" }
  })
  assert.equal(repeated.statusCode, 200)
  assert.equal(repeated.json().onboarding.profile, "complete")
  assert.equal(repeated.json().onboarding.avatar, "complete")
  assert.equal(repeated.json().onboarding.room, "complete")
  assert.match(repeated.json().onboarding.completedAt, /^\d{4}-\d{2}-\d{2}T/)

  const clearedGender = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers,
    payload: { gender: "   " }
  })
  assert.equal(clearedGender.statusCode, 400)

  const invalid = await app.inject({
    method: "PATCH",
    url: "/v1/users/me/onboarding",
    headers,
    payload: { step: "account" }
  })
  assert.equal(invalid.statusCode, 400)
  await app.close()
})

test("fresh accounts cannot bypass 18+ profile setup or enter product APIs", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551110099" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551110099",
      verificationCode: "482931"
    }
  })
  const headers = {
    authorization: `Bearer ${registered.json().session.sessionToken}`
  }

  const blockedDiscover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers
  })
  assert.equal(blockedDiscover.statusCode, 403)
  assert.equal(blockedDiscover.json().code, "ONBOARDING_REQUIRED")

  const prematureProfile = await app.inject({
    method: "PATCH",
    url: "/v1/users/me/onboarding",
    headers,
    payload: { step: "profile" }
  })
  assert.equal(prematureProfile.statusCode, 409)

  const profile = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers,
    payload: {
      displayName: "Lina",
      age: 24,
      gender: "woman",
      avatarPresetId: "avatar_v2_body_default"
    }
  })
  assert.equal(profile.statusCode, 200)

  for (const step of ["profile", "avatar", "room"] as const) {
    const completed = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/onboarding",
      headers,
      payload: { step }
    })
    assert.equal(completed.statusCode, 200)
  }

  const discover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers
  })
  assert.equal(discover.statusCode, 200)
})

test("wrong and expired codes are rejected without demo fallback", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/verify",
    payload: {
      phoneNumber: "+905551112233",
      verificationCode: "000000"
    }
  })

  assert.equal(response.statusCode, 401)
  assert.doesNotMatch(JSON.stringify(response.json()), /demo/i)
})

test("users/me requires a bearer token and returns profile for valid sessions", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken

  const missing = await app.inject({
    method: "GET",
    url: "/v1/users/me"
  })
  assert.equal(missing.statusCode, 401)

  const me = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().profile.userId, registered.json().profile.userId)
  assert.deepEqual(me.json().onboarding, registered.json().session.onboarding)

  const storedAccount = authService.store.accountsByPhone.get("+905551112233")
  assert.ok(storedAccount)
  authService.store.accountsByPhone.set("+905551112233", {
    ...storedAccount,
    profile: {
      ...storedAccount.profile,
      gender: "non-binary"
    }
  })
  const legacyMe = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(legacyMe.statusCode, 200)
  assert.equal(legacyMe.json().profile.gender, "non-binary")
})

test("profile updates are immutable and validate age range", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken

  const updated = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      displayName: "Defne",
      age: 24,
      bio: "  Coffee, walks,   honest conversation.  ",
      gender: " woman ",
      identityGender: "woman",
      discoveryPreferences: {
        ageMin: 23,
        ageMax: 35,
        genders: ["man"],
        vibes: ["coffee"],
        radiusKm: 50
      },
      interests: ["coffee", "music", "coffee", "  weekend trips  "],
      location: {
        lat: 41.0082,
        lng: 28.9784
      }
    }
  })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.json().profile.displayName, "Defne")
  assert.equal(updated.json().profile.age, 24)
  assert.equal(updated.json().profile.avatar.presetId, "avatar_v2_body_default")
  assert.equal(updated.json().profile.bio, "Coffee, walks, honest conversation.")
  assert.equal(updated.json().profile.gender, "woman")
  assert.equal(updated.json().profile.identityGender, "woman")
  assert.deepEqual(updated.json().profile.discoveryPreferences, {
    ageMin: 23,
    ageMax: 35,
    genders: ["man"],
    vibes: ["coffee"],
    radiusKm: 50
  })
  assert.deepEqual(updated.json().profile.interests, [
    "coffee",
    "music",
    "weekend trips"
  ])
  assert.deepEqual(updated.json().profile.location, {
    lat: 41.0082,
    lng: 28.9784
  })

  const rejectedLegacyGenderWrite = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: { gender: "non-binary" }
  })
  assert.equal(rejectedLegacyGenderWrite.statusCode, 400)
  assert.match(rejectedLegacyGenderWrite.json().error, /valid gender/i)

  const invalidAge = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      age: 15
    }
  })
  assert.equal(invalidAge.statusCode, 400)
  assert.match(invalidAge.json().error, /18 to 99/)

  const invalidName = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      displayName: " "
    }
  })
  assert.equal(invalidName.statusCode, 400)
  assert.match(invalidName.json().error, /display name/)

  const invalidAvatarPreset = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      displayName: "Defne",
      avatarPresetId: "x".repeat(65)
    }
  })
  assert.equal(invalidAvatarPreset.statusCode, 400)
  assert.match(invalidAvatarPreset.json().error, /avatar body/)

  const unchanged = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(unchanged.json().profile.displayName, "Defne")
  assert.equal(unchanged.json().profile.age, 24)
  assert.deepEqual(unchanged.json().profile.interests, [
    "coffee",
    "music",
    "weekend trips"
  ])

  const clearedOptionalProfile = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      bio: "",
      interests: []
    }
  })
  assert.equal(clearedOptionalProfile.statusCode, 200)
  assert.equal(clearedOptionalProfile.json().profile.bio, undefined)
  assert.equal(clearedOptionalProfile.json().profile.interests, undefined)
})

test("auth refresh rotates sessions and invalidates the previous token", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken

  const refreshed = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(refreshed.statusCode, 200)
  assert.match(refreshed.json().session.sessionToken, /^dv_/)
  assert.notEqual(refreshed.json().session.sessionToken, token)

  const oldTokenMe = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(oldTokenMe.statusCode, 401)

  const newTokenMe = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${refreshed.json().session.sessionToken}`
    }
  })
  assert.equal(newTokenMe.statusCode, 200)
  assert.equal(newTokenMe.json().profile.userId, registered.json().profile.userId)
})

test("sign out revokes the bearer session idempotently", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken
  const headers = { authorization: `Bearer ${token}` }

  const first = await app.inject({
    method: "DELETE",
    url: "/v1/auth/session",
    headers
  })
  const duplicate = await app.inject({
    method: "DELETE",
    url: "/v1/auth/session",
    headers
  })
  const me = await app.inject({ method: "GET", url: "/v1/users/me", headers })

  assert.equal(first.statusCode, 204)
  assert.equal(duplicate.statusCode, 204)
  assert.equal(me.statusCode, 401)
})

test("account deletion requires a purpose-specific reauthentication and removes the production session and profile", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const app = createServer({ authService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken

  const legacyDelete = await app.inject({
    method: "DELETE",
    url: "/v1/account",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(legacyDelete.statusCode, 403)
  assert.equal(legacyDelete.json().code, "REAUTH_REQUIRED")

  const challenge = await app.inject({
    method: "POST",
    url: "/v1/account/deletion/challenge",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(challenge.statusCode, 202)
  const verified = await app.inject({
    method: "POST",
    url: "/v1/account/deletion/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { verificationCode: "482931" }
  })
  assert.equal(verified.statusCode, 200)
  const deleted = await app.inject({
    method: "DELETE",
    url: "/v1/account",
    headers: { authorization: `Bearer ${token}` },
    payload: { confirmationToken: verified.json().confirmationToken }
  })
  assert.equal(deleted.statusCode, 204)

  const me = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(me.statusCode, 401)
})

test("discover endpoints require a session and record local decisions", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  const unauthenticated = await app.inject({
    method: "GET",
    url: "/v1/discover"
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken
  await makeAccountEligible(authService, token)

  const discover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(discover.statusCode, 200)
  assert.ok(discover.json().profiles.length >= 1)
  assert.deepEqual(Object.keys(discover.json().page).sort(), ["hasMore", "nextCursor"])
  assert.equal(typeof discover.json().page.hasMore, "boolean")
  assert.ok(["healthy", "low", "exhausted"].includes(discover.json().supply.state))
  assert.equal(discover.json().supply.scope, "global")

  const like = await app.inject({
    method: "POST",
    url: `/v1/discover/${discover.json().profiles[0].userId}/like`,
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(like.statusCode, 200)
  assert.equal(like.json().decision.decision, "like")
  assert.equal(like.json().matched, false)

  const linkedProfile = await app.inject({
    method: "GET",
    url: `/v1/discover/${discover.json().profiles[0].userId}`,
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(linkedProfile.statusCode, 200)
  assert.equal(
    linkedProfile.json().profile.userId,
    discover.json().profiles[0].userId
  )

  const refreshedDiscover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(refreshedDiscover.statusCode, 200)
  assert.equal(
    refreshedDiscover
      .json()
      .profiles.some(
        (profile: { userId: string }) =>
          profile.userId === discover.json().profiles[0].userId
      ),
    false
  )
})

test("linked Discover profiles stay visible but only grant decisions that pass the persisted server policy", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const profiles = [
    {
      userId: "linked_eligible",
      displayName: "Mert",
      age: 26,
      gender: "man",
      distanceLabel: "",
      vibeTags: ["coffee"],
      avatar: TEST_DISCOVERY_AVATAR,
      avatarPresetId: "default"
    },
    {
      userId: "linked_filter_mismatch",
      displayName: "Ada",
      age: 26,
      gender: "woman",
      distanceLabel: "",
      vibeTags: ["coffee"],
      avatar: TEST_DISCOVERY_AVATAR,
      avatarPresetId: "default"
    },
    {
      userId: "linked_existing_match",
      displayName: "Emir",
      age: 27,
      gender: "man",
      distanceLabel: "",
      vibeTags: ["coffee"],
      avatar: TEST_DISCOVERY_AVATAR,
      avatarPresetId: "default"
    },
    {
      userId: "linked_blocked",
      displayName: "Arda",
      age: 25,
      gender: "man",
      distanceLabel: "",
      vibeTags: ["coffee"],
      avatar: TEST_DISCOVERY_AVATAR,
      avatarPresetId: "default"
    }
  ]
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const matchService = createMatchService({ repository })
  const app = createServer({ authService, matchService })
  const token = await registerTestSession(app, "+905551112245")
  await makeAccountEligible(authService, token)
  const configuredProfile = await authService.updateProfile(token, {
    discoveryPreferences: {
      ageMin: 24,
      ageMax: 30,
      genders: ["man"],
      vibes: ["coffee"],
      radiusKm: 50
    }
  })
  assert.ok(configuredProfile)
  const headers = { authorization: `Bearer ${token}` }
  const me = await app.inject({ method: "GET", url: "/v1/users/me", headers })
  const currentUserId = me.json().profile.userId as string

  const filterOverride = await app.inject({
    method: "GET",
    url: "/v1/discover/linked_filter_mismatch?ageMin=18&ageMax=99&gender=woman&vibe=coffee",
    headers
  })
  assert.equal(filterOverride.statusCode, 200)
  assert.equal(filterOverride.json().profile.userId, "linked_filter_mismatch")
  assert.deepEqual(filterOverride.json().decision, { capability: "view-only" })

  for (const action of ["like", "pass"] as const) {
    const denied = await app.inject({
      method: "POST",
      url: `/v1/discover/linked_filter_mismatch/${action}`,
      headers
    })
    assert.equal(denied.statusCode, 409)
    assert.equal(denied.json().code, "DISCOVERY_DECISION_NOT_ELIGIBLE")
  }

  const eligible = await app.inject({
    method: "GET",
    url: "/v1/discover/linked_eligible",
    headers
  })
  assert.equal(eligible.statusCode, 200)
  assert.deepEqual(eligible.json().decision, { capability: "mutual-like" })

  const liked = await app.inject({
    method: "POST",
    url: "/v1/discover/linked_eligible/like",
    headers
  })
  assert.equal(liked.statusCode, 200)

  const decidedProfile = await app.inject({
    method: "GET",
    url: "/v1/discover/linked_eligible",
    headers
  })
  assert.equal(decidedProfile.statusCode, 200)
  assert.deepEqual(decidedProfile.json().decision, { capability: "view-only" })

  const repeatedDecision = await app.inject({
    method: "POST",
    url: "/v1/discover/linked_eligible/pass",
    headers
  })
  assert.equal(repeatedDecision.statusCode, 409)
  assert.equal(repeatedDecision.json().code, "DISCOVERY_DECISION_NOT_ELIGIBLE")

  await repository.createMatch({
    matchId: "linked_match",
    participantUserIds: [currentUserId, "linked_existing_match"],
    matchedAt: "2026-07-29T10:00:00.000Z"
  })
  const existingMatch = await app.inject({
    method: "GET",
    url: "/v1/discover/linked_existing_match",
    headers
  })
  assert.equal(existingMatch.statusCode, 200)
  assert.deepEqual(existingMatch.json().decision, { capability: "view-only" })

  const existingMatchDecision = await app.inject({
    method: "POST",
    url: "/v1/discover/linked_existing_match/like",
    headers
  })
  assert.equal(existingMatchDecision.statusCode, 409)
  assert.equal(existingMatchDecision.json().code, "DISCOVERY_DECISION_NOT_ELIGIBLE")

  const self = await app.inject({
    method: "GET",
    url: `/v1/discover/${currentUserId}`,
    headers
  })
  assert.equal(self.statusCode, 404)

  const block = await app.inject({
    method: "POST",
    url: "/v1/safety/blocks",
    headers,
    payload: { blockedUserId: "linked_blocked" }
  })
  assert.equal(block.statusCode, 201)
  const blocked = await app.inject({
    method: "GET",
    url: "/v1/discover/linked_blocked",
    headers
  })
  assert.equal(blocked.statusCode, 404)
  await app.close()
})

test("linked Discover profile exposes view-only when the persisted decision quota is exhausted", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const profiles = Array.from({ length: 11 }, (_, index) => ({
    userId: `linked_quota_${index + 1}`,
    displayName: `Mert ${index + 1}`,
    age: 26,
    gender: "man",
    distanceLabel: "",
    vibeTags: ["coffee"],
    avatar: TEST_DISCOVERY_AVATAR,
    avatarPresetId: "default"
  }))
  const app = createServer({
    authService,
    matchService: createMatchService({
      repository: createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
    })
  })
  const token = await registerTestSession(app, "+905551112246")
  await makeAccountEligible(authService, token)
  await authService.updateProfile(token, {
    discoveryPreferences: {
      ageMin: 24,
      ageMax: 30,
      genders: ["man"],
      vibes: ["coffee"],
      radiusKm: 50
    }
  })
  const headers = { authorization: `Bearer ${token}` }

  for (const profile of profiles.slice(0, 10)) {
    const passed = await app.inject({
      method: "POST",
      url: `/v1/discover/${profile.userId}/pass`,
      headers
    })
    assert.equal(passed.statusCode, 200)
  }

  const exhausted = await app.inject({
    method: "GET",
    url: `/v1/discover/${profiles[10]!.userId}`,
    headers
  })
  assert.equal(exhausted.statusCode, 200)
  assert.deepEqual(exhausted.json().decision, { capability: "view-only" })

  const staleDecision = await app.inject({
    method: "POST",
    url: `/v1/discover/${profiles[10]!.userId}/like`,
    headers
  })
  assert.equal(staleDecision.statusCode, 429)
  assert.equal(staleDecision.json().code, "DISCOVERY_DECISION_QUOTA_EXHAUSTED")
  await app.close()
})

test("Discover returns quota metadata and hard-blocks an eleventh persisted decision", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const profiles = createSeedDiscoverProfiles().map((profile, index) => ({
    ...profile,
    userId: `quota_candidate_${index + 1}`,
    gender: "woman"
  }))
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  })
  const app = createServer({ authService, matchService })
  const token = await registerTestSession(app, "+905551112244")
  await makeAccountEligible(authService, token)
  const headers = { authorization: `Bearer ${token}` }

  const discover = await app.inject({ method: "GET", url: "/v1/discover", headers })
  assert.equal(discover.statusCode, 200)
  assert.deepEqual(discover.json().quota, {
    limit: 10,
    extensionDecisions: 0,
    used: 0,
    remaining: 10,
    resetsAt: discover.json().quota.resetsAt,
    rewardedAd: { available: false, extensionDecisions: 10 }
  })

  for (const profile of profiles.slice(0, 10)) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/discover/${profile.userId}/pass`,
      headers
    })
    assert.equal(response.statusCode, 200)
  }

  const retry = await app.inject({
    method: "POST",
    url: `/v1/discover/${profiles[9]!.userId}/pass`,
    headers
  })
  assert.equal(retry.statusCode, 200)
  assert.equal(retry.json().quota.used, 10)

  const limited = await app.inject({
    method: "POST",
    url: `/v1/discover/${profiles[10]!.userId}/like`,
    headers
  })
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.json().code, "DISCOVERY_DECISION_QUOTA_EXHAUSTED")
  assert.equal(limited.json().quota.remaining, 0)
  assert.equal(limited.json().quota.rewardedAd.available, false)
  await app.close()
})

test("discover pagination keeps the buffered profile for the next page", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })
  const token = await registerTestSession(app, "+905551110010")
  await makeAccountEligible(authService, token)

  const firstPage = await app.inject({
    method: "GET",
    url: "/v1/discover?limit=1",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(firstPage.statusCode, 200)
  assert.equal(firstPage.json().profiles.length, 1)
  assert.match(firstPage.json().page.nextCursor, /^v2\./)

  const secondPage = await app.inject({
    method: "GET",
    url: `/v1/discover?limit=1&cursor=${encodeURIComponent(firstPage.json().page.nextCursor)}`,
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(secondPage.statusCode, 200)
  assert.equal(secondPage.json().profiles.length, 1)
  assert.notEqual(
    secondPage.json().profiles[0].userId,
    firstPage.json().profiles[0].userId
  )

  const legacyPage = await app.inject({method:"GET",url:"/v1/discover?cursor=v1%3A1",
    headers:{authorization:`Bearer ${token}`}})
  assert.equal(legacyPage.statusCode,400)
  assert.equal(legacyPage.json().code,"DISCOVERY_CURSOR_INVALID")

  await app.close()
})

test("discover rate limits rapid refreshes per authenticated session", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })

  const firstToken = await registerTestSession(app, "+905551110001")
  const secondToken = await registerTestSession(app, "+905551110002")
  await makeAccountEligible(authService, firstToken)
  await makeAccountEligible(authService, secondToken)

  for (let requestIndex = 0; requestIndex < 30; requestIndex += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/v1/discover",
      headers: { authorization: `Bearer ${firstToken}` }
    })
    assert.equal(response.statusCode, 200, `request ${requestIndex + 1}`)
  }

  const limited = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: { authorization: `Bearer ${firstToken}` }
  })
  assert.equal(limited.statusCode, 429)
  assert.match(limited.headers["retry-after"] ?? "", /^\d+$/)
  assert.equal(
    limited.json().error,
    "You are refreshing Discover too quickly. Try again in a moment."
  )
  assert.equal(limited.json().statusCode, 429)
  assert.match(limited.json().requestId, /^[0-9a-f-]{36}$/)

  const independentSession = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: { authorization: `Bearer ${secondToken}` }
  })
  assert.equal(independentSession.statusCode, 200)
})

test("discovery watch persists for the account and can be cancelled", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })
  const token = await registerTestSession(app, "+905551110009")
  await makeAccountEligible(authService, token)

  const empty = await app.inject({
    method: "GET",
    url: "/v1/discover/watch",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(empty.statusCode, 200)
  assert.equal(empty.json().watch, null)

  const activated = await app.inject({
    method: "PUT",
    url: "/v1/discover/watch",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(activated.statusCode, 200)
  assert.equal(activated.json().watch.status, "active")
  assert.deepEqual(activated.json().watch.preferences, {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  })

  const cancelled = await app.inject({
    method: "DELETE",
    url: "/v1/discover/watch",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(cancelled.statusCode, 204)
})

test("discover excludes blocked profiles and rejects blocked decisions", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const safetyService = createSafetyService()
  const app = createServer({ authService, safetyService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken
  await makeAccountEligible(authService, token)

  const discover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  const blockedUserId = discover.json().profiles[0].userId

  const block = await app.inject({
    method: "POST",
    url: "/v1/safety/blocks",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      blockedUserId
    }
  })
  assert.equal(block.statusCode, 201)

  const refreshedDiscover = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(
    refreshedDiscover
      .json()
      .profiles.some((profile: { userId: string }) => profile.userId === blockedUserId),
    false
  )

  const blockedLike = await app.inject({
    method: "POST",
    url: `/v1/discover/${blockedUserId}/like`,
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(blockedLike.statusCode, 400)
  assert.match(blockedLike.json().error, /not available/)
})

test("discover validates and applies age, gender, and vibe filters", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([
      {
        userId: "matching_profile",
        displayName: "Ada",
        age: 28,
        gender: "woman",
        distanceLabel: "",
        vibeTags: ["Coffee Dates"],
        avatar: TEST_DISCOVERY_AVATAR,
        avatarPresetId: "default"
      },
      {
        userId: "wrong_gender",
        displayName: "Mert",
        age: 28,
        gender: "man",
        distanceLabel: "",
        vibeTags: ["coffee dates"],
        avatar: TEST_DISCOVERY_AVATAR,
        avatarPresetId: "default"
      },
      {
        userId: "legacy_gender",
        displayName: "Deniz",
        age: 28,
        gender: "non-binary",
        distanceLabel: "",
        vibeTags: ["coffee dates"],
        avatar: TEST_DISCOVERY_AVATAR,
        avatarPresetId: "default"
      }
    ]))
  })
  const app = createServer({ authService, matchService })

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const authorization = `Bearer ${registered.json().session.sessionToken}`
  await makeAccountEligible(
    authService,
    registered.json().session.sessionToken
  )

  const unfiltered = await app.inject({
    method: "GET",
    url: "/v1/discover",
    headers: { authorization }
  })
  assert.equal(unfiltered.statusCode, 200)
  assert.deepEqual(
    unfiltered.json().profiles.map((profile: { userId: string }) => profile.userId),
    ["matching_profile", "wrong_gender"]
  )

  const filtered = await app.inject({
    method: "GET",
    url: "/v1/discover?ageMin=24&ageMax=35&gender=woman&vibe=coffee%20dates",
    headers: { authorization }
  })
  assert.equal(filtered.statusCode, 200)
  assert.deepEqual(
    filtered.json().profiles.map((profile: { userId: string }) => profile.userId),
    ["matching_profile"]
  )

  for (const url of [
    "/v1/discover?ageMin=40&ageMax=20",
    "/v1/discover?ageMin=17",
    "/v1/discover?gender=unknown",
    "/v1/discover?gender=non-binary"
  ]) {
    const invalid = await app.inject({ method: "GET", url, headers: { authorization } })
    assert.equal(invalid.statusCode, 400)
  }
})

test("thread endpoints require session access and send messages", async () => {
  const backendStore = createBlumiBackendStore()
  const authService = createAuthService({
    store: backendStore,
    codeFactory: () => "482931"
  })
  let messageId = 0
  const chatService = createChatService({
    idFactory: () => `message_${++messageId}`
  })
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const safetyService = createSafetyService()
  const app = createServer({
    authService,
    chatService,
    matchService,
    safetyService
  })

  const unauthenticated = await app.inject({
    method: "GET",
    url: "/v1/threads"
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const userId = registered.json().session.userId
  const token = registered.json().session.sessionToken
  await makeAccountEligible(authService, token, "Current User")

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112244" }
  })
  const partner = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112244",
      verificationCode: "482931"
    }
  })
  const partnerUserId = partner.json().session.userId
  await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: {
      authorization: `Bearer ${partner.json().session.sessionToken}`
    },
    payload: {
      displayName: "Defne"
    }
  })
  const legacyPartnerAccount = await authService.repository.findAccountByUserId(
    partnerUserId
  )
  assert.ok(legacyPartnerAccount)
  await authService.repository.saveAccount({
    ...legacyPartnerAccount,
    profile: {
      ...legacyPartnerAccount.profile,
      avatar: { presetId: legacyPartnerAccount.profile.avatar.presetId }
    }
  })

  const forbiddenThread = await app.inject({
    method: "POST",
    url: "/v1/threads",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      threadId: "thread_created",
      participantUserIds: [userId, partnerUserId]
    }
  })
  assert.equal(forbiddenThread.statusCode, 403)

  await matchService.repository.createMatch({
    matchId: "match_chat_authorized",
    participantUserIds: [userId, partnerUserId],
    matchedAt: "2026-06-27T09:00:00.000Z"
  })

  const createdThread = await app.inject({
    method: "POST",
    url: "/v1/threads",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      threadId: "attacker_controlled_thread_id",
      participantUserIds: [userId, partnerUserId]
    }
  })
  assert.equal(createdThread.statusCode, 201)
  assert.equal(
    createdThread.json().thread.threadId,
    "thread_match_match_chat_authorized"
  )
  assert.deepEqual(
    new Set(createdThread.json().thread.participantUserIds),
    new Set([userId, partnerUserId])
  )
  assert.equal(
    createdThread
      .json()
      .thread.participants.find((participant: { userId: string }) => participant.userId === userId)
      ?.avatar?.presetId,
    "avatar_v2_body_default"
  )
  assert.equal(
    createdThread
      .json()
      .thread.participants.find((participant: { userId: string }) => participant.userId === partnerUserId)
      ?.avatar,
    undefined
  )

  const duplicateThread = await app.inject({
    method: "POST",
    url: "/v1/threads",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      threadId: "another_client_supplied_id",
      participantUserIds: [partnerUserId, userId]
    }
  })
  assert.equal(duplicateThread.statusCode, 200)
  assert.equal(
    duplicateThread.json().thread.threadId,
    createdThread.json().thread.threadId
  )

  await chatService.createThread({
    threadId: "thread_server",
    miniRoomId: "room_server",
    participantUserIds: [userId, partnerUserId],
    participants: [
      { userId, displayName: "Current User" },
      { userId: partnerUserId, displayName: "Defne" }
    ]
  })

  const threads = await app.inject({
    method: "GET",
    url: "/v1/threads",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(threads.statusCode, 200)
  assert.ok(
    threads
      .json()
      .threads.some((thread: { threadId: string }) => thread.threadId === "thread_server")
  )

  const sent = await app.inject({
    method: "POST",
    url: "/v1/threads/thread_server/messages",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      body: "  hello   from Blumi  "
    }
  })
  assert.equal(sent.statusCode, 201)
  assert.equal(sent.json().message.body, "hello from Blumi")
  assert.equal(sent.json().message.messageId, "message_1")

  await safetyService.blockUser(partnerUserId, userId)

  const blockedCreate = await app.inject({
    method: "POST",
    url: "/v1/threads",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      participantUserIds: [userId, partnerUserId]
    }
  })
  assert.equal(blockedCreate.statusCode, 403)

  const blockedSend = await app.inject({
    method: "POST",
    url: "/v1/threads/thread_server/messages",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: { body: "must not be persisted" }
  })
  assert.equal(blockedSend.statusCode, 403)
  assert.deepEqual(
    (await chatService.listMessages(userId, "thread_server")).map(
      (message) => message.messageId
    ),
    ["message_1"]
  )

  await safetyService.unblockUser(partnerUserId, userId)

  await chatService.sendMessage(
    userId,
    "thread_server",
    "second",
    new Date("2026-06-27T10:01:00.000Z")
  )
  await chatService.sendMessage(
    userId,
    "thread_server",
    "third",
    new Date("2026-06-27T10:02:00.000Z")
  )

  const messages = await app.inject({
    method: "GET",
    url: "/v1/threads/thread_server/messages",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(messages.statusCode, 200)
  assert.equal(messages.json().messages.length, 3)

  const paged = await app.inject({
    method: "GET",
    url: "/v1/threads/thread_server/messages?before=message_3&limit=1",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(paged.statusCode, 200)
  assert.deepEqual(
    paged.json().messages.map((message: { messageId: string }) => message.messageId),
    ["message_2"]
  )

  const read = await app.inject({
    method: "POST",
    url: "/v1/threads/thread_server/read",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(read.statusCode, 200)
  assert.equal(read.json().threadId, "thread_server")
  assert.match(read.json().readAt, /^\d{4}-\d{2}-\d{2}T/)
})

test("safety endpoints require sessions and derive actor from auth", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const safetyService = createSafetyService({
    idFactory: () => "report_fixed"
  })
  const app = createServer({ authService, safetyService })

  const unauthenticated = await app.inject({
    method: "POST",
    url: "/v1/safety/blocks",
    payload: { blockedUserId: "target_user" }
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const userId = registered.json().session.userId
  const token = registered.json().session.sessionToken

  const block = await app.inject({
    method: "POST",
    url: "/v1/safety/blocks",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      actorUserId: "forged_user",
      blockedUserId: "target_user"
    }
  })
  assert.equal(block.statusCode, 201)
  assert.equal(block.json().block.actorUserId, userId)
  assert.equal(block.json().block.blockedUserId, "target_user")

  const report = await app.inject({
    method: "POST",
    url: "/v1/safety/reports",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      actorUserId: "forged_user",
      reportedUserId: "reported_user",
      reason: "spam",
      note: "  suspicious profile  "
    }
  })
  assert.equal(report.statusCode, 201)
  assert.equal(report.json().report.reportId, "report_fixed")
  assert.equal(report.json().report.actorUserId, userId)
  assert.equal(report.json().report.note, "suspicious profile")
  assert.equal(report.json().block.blockedUserId, "reported_user")

  const blocks = await app.inject({
    method: "GET",
    url: "/v1/safety/blocks",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(blocks.statusCode, 200)
  assert.equal(blocks.json().blocks.length, 2)

  const unblock = await app.inject({
    method: "DELETE",
    url: "/v1/safety/blocks/target_user",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(unblock.statusCode, 204)
})

test("economy endpoints require sessions and complete server-priced purchases", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const economyService = createEconomyService()
  const app = createServer({ authService, economyService })

  const unauthenticated = await app.inject({
    method: "GET",
    url: "/v1/economy/balance"
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken
  await makeAccountEligible(authService, token)

  const balance = await app.inject({
    method: "GET",
    url: "/v1/economy/balance",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(balance.statusCode, 200)
  assert.equal(balance.json().inventory.coins, 1250)

  const dailyReward = await app.inject({
    method: "POST",
    url: "/v1/economy/rewards/daily",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: { coins: 999999 }
  })
  const repeatedDailyReward = await app.inject({
    method: "POST",
    url: "/v1/economy/rewards/daily",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(dailyReward.statusCode, 200)
  assert.equal(dailyReward.json().claimed, true)
  assert.equal(dailyReward.json().rewardCoins, 25)
  assert.equal(dailyReward.json().inventory.coins, 1275)
  assert.equal(repeatedDailyReward.json().claimed, false)
  assert.equal(repeatedDailyReward.json().inventory.coins, 1275)

  const purchase = await app.inject({
    method: "POST",
    url: "/v1/economy/purchase",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      priceCoins: 1
    }
  })
  assert.equal(purchase.statusCode, 201)
  assert.equal(purchase.json().priceCoins, 390)
  assert.equal(purchase.json().inventory.coins, 885)

  const repeat = await app.inject({
    method: "POST",
    url: "/v1/economy/purchase",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan"
    }
  })
  assert.equal(repeat.statusCode, 400)
  assert.match(repeat.json().error, /already own/)

  const resolved = await authService.getSession(token)
  assert.ok(resolved)
  const maleAvatarUpdate = await authService.repository.updateAvatarSelection({
    accountId: resolved.account.accountId,
    expectedRevision: resolved.account.profile.avatar.revision ?? 0,
    selection: createDefaultAvatarSelection("avatar_v2_body_male_light", 1),
    now: new Date("2026-07-14T12:00:00.000Z")
  })
  assert.equal(maleAvatarUpdate.kind, "updated")

  const incompatiblePurchase = await app.inject({
    method: "POST",
    url: "/v1/economy/purchase",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      type: "avatar",
      itemId: "avatar_v2_top_sage_ribbon_knit_jacket",
      avatarBodyId: "avatar_v2_body_default"
    }
  })
  assert.equal(incompatiblePurchase.statusCode, 400)
  assert.match(incompatiblePurchase.json().error, /does not fit your avatar/i)
})

test("device endpoints register and remove authenticated push tokens", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const notificationService = createNotificationService()
  const app = createServer({ authService, notificationService })

  const unauthenticated = await app.inject({
    method: "POST",
    url: "/v1/devices",
    payload: {
      platform: "ios",
      pushToken: "token_1"
    }
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const userId = registered.json().session.userId
  const token = registered.json().session.sessionToken
  await makeAccountEligible(authService, token)

  const created = await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      platform: "ios",
      pushToken: "  token_1  "
    }
  })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().device.userId, userId)
  assert.equal(created.json().device.platform, "ios")
  assert.equal(created.json().device.pushToken, "token_1")

  assert.equal(
    (await notificationService.repository.listDevices(userId)).length,
    1
  )

  const legacyPathRemoval = await app.inject({
    method: "DELETE",
    url: "/v1/devices/token_1",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(legacyPathRemoval.statusCode, 404)
  assert.equal(
    (await notificationService.repository.listDevices(userId)).length,
    1
  )

  const removed = await app.inject({
    method: "DELETE",
    url: "/v1/devices",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: { pushToken: "token_1" }
  })
  assert.equal(removed.statusCode, 204)
  assert.equal(
    (await notificationService.repository.listDevices(userId)).length,
    0
  )
})

test("admin report endpoints require key and resolve moderation reports", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const safetyService = createSafetyService({
    idFactory: () => "report_fixed"
  })
  const app = createServer({
    authService,
    safetyService,
    adminKey: "admin_secret",
    allowLegacyAdminKey: true
  })

  const missingKey = await app.inject({
    method: "GET",
    url: "/v1/admin/reports"
  })
  assert.equal(missingKey.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const registered = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = registered.json().session.sessionToken

  await app.inject({
    method: "POST",
    url: "/v1/safety/reports",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      reportedUserId: "reported_user",
      reason: "spam",
      note: "  suspicious  behavior  "
    }
  })

  const reports = await app.inject({
    method: "GET",
    url: "/v1/admin/reports?status=pending&limit=10",
    headers: {
      "x-admin-key": "admin_secret"
    }
  })
  assert.equal(reports.statusCode, 200)
  assert.equal(reports.json().reports.length, 1)
  assert.equal(reports.json().reports[0].reportId, "report_fixed")
  assert.equal(reports.json().reports[0].status, "pending")
  assert.equal(reports.json().reports[0].queue.priority, "standard")
  assert.equal(reports.json().reports[0].queue.targetMinutes, 1440)
  assert.equal(typeof reports.json().reports[0].queue.dueAt, "string")

  const detail = await app.inject({
    method: "GET",
    url: "/v1/admin/reports/report_fixed",
    headers: {
      "x-admin-key": "admin_secret"
    }
  })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().report.note, "suspicious behavior")

  const resolved = await app.inject({
    method: "POST",
    url: "/v1/admin/reports/report_fixed/resolve",
    headers: {
      "x-admin-key": "admin_secret"
    },
    payload: {
      action: "dismiss",
      note: "  not actionable  "
    }
  })
  assert.equal(resolved.statusCode, 200)
  assert.equal(resolved.json().report.status, "dismissed")
  assert.equal(resolved.json().report.resolution.action, "dismiss")
  assert.equal(resolved.json().report.resolution.adminNote, "not actionable")
})

test("legacy admin keys stay limited to reports and cannot read account recovery PII", async () => {
  const app = createServer({
    adminKey: "admin_secret",
    allowLegacyAdminKey: true
  })
  const response = await app.inject({
    method: "GET",
    url: "/v1/admin/account-recovery",
    headers: { "x-admin-key": "admin_secret" }
  })
  assert.equal(response.statusCode, 403)
  await app.close()
})

test("notification preference endpoints are authenticated and only update the current account", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const notificationService = createNotificationService()
  const app = createServer({ authService, notificationService })

  const unauthenticated = await app.inject({
    method: "GET",
    url: "/v1/notification-preferences"
  })
  assert.equal(unauthenticated.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112234" }
  })
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber: "+905551112234", verificationCode: "482931" }
  })
  const token = verified.json().session.sessionToken as string
  const userId = verified.json().session.userId as string
  await makeAccountEligible(authService, token)

  const defaultPreferences = await app.inject({
    method: "GET",
    url: "/v1/notification-preferences",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(defaultPreferences.statusCode, 200)
  assert.equal(defaultPreferences.json().preferences.maxPushesPerHour, 6)

  const updated = await app.inject({
    method: "PUT",
    url: "/v1/notification-preferences",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      likesEnabled: false,
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
      quietHoursUtcOffsetMinutes: 180,
      maxPushesPerHour: 3
    }
  })
  assert.equal(updated.statusCode, 200)
  assert.deepEqual(updated.json().preferences.quietHours, { startMinute: 22 * 60, endMinute: 7 * 60 })
  assert.equal(updated.json().preferences.likesEnabled, false)
  assert.equal(updated.json().preferences.maxPushesPerHour, 3)
  assert.equal((await notificationService.getPreferences(userId)).likesEnabled, false)

  const invalid = await app.inject({
    method: "PUT",
    url: "/v1/notification-preferences",
    headers: { authorization: `Bearer ${token}` },
    payload: { maxPushesPerHour: 0 }
  })
  assert.equal(invalid.statusCode, 400)

  await app.close()
})

test("scoped admin bearer tokens enforce least privilege and persist audit identity", async () => {
  const signingKey = { keyId: "active", secret: Buffer.alloc(32, 9) }
  const adminTokenService = createAdminTokenService({ keys: [signingKey] })
  const safetyService = createSafetyService({ idFactory: () => "report_scoped" })
  await safetyService.reportUser(
    "reporter",
    { reportedUserId: "reported", reason: "spam" },
    new Date("2026-07-14T12:00:00.000Z")
  )
  const now = new Date()
  const readToken = mintAdminToken({
    key: signingKey,
    operatorId: "moderator-read",
    tokenId: "read-token",
    scopes: ["reports:read"],
    now,
    ttlSeconds: 600
  })
  const resolveToken = mintAdminToken({
    key: signingKey,
    operatorId: "moderator-resolve",
    tokenId: "resolve-token",
    scopes: ["reports:resolve"],
    now,
    ttlSeconds: 600
  })
  const app = createServer({ safetyService, adminTokenService })

  const rejectedLegacyHeader = await app.inject({
    method: "GET",
    url: "/v1/admin/reports",
    headers: { "x-admin-key": "not-explicitly-enabled" }
  })
  assert.equal(rejectedLegacyHeader.statusCode, 401)

  const listed = await app.inject({
    method: "GET",
    url: "/v1/admin/reports",
    headers: { authorization: `Bearer ${readToken}` }
  })
  assert.equal(listed.statusCode, 200)

  const forbidden = await app.inject({
    method: "POST",
    url: "/v1/admin/reports/report_scoped/resolve",
    headers: { authorization: `Bearer ${readToken}` },
    payload: { action: "warn" }
  })
  assert.equal(forbidden.statusCode, 403)

  const resolved = await app.inject({
    method: "POST",
    url: "/v1/admin/reports/report_scoped/resolve",
    headers: { authorization: `Bearer ${resolveToken}` },
    payload: { action: "warn" }
  })
  assert.equal(resolved.statusCode, 200)
  assert.equal(resolved.json().report.resolution.resolvedByAdminId, "moderator-resolve")
  assert.equal(resolved.json().report.resolution.resolvedByTokenId, "resolve-token")

  const secondResolution = await app.inject({
    method: "POST",
    url: "/v1/admin/reports/report_scoped/resolve",
    headers: { authorization: `Bearer ${resolveToken}` },
    payload: { action: "dismiss" }
  })
  assert.equal(secondResolution.statusCode, 409)

  const missingReport = await app.inject({
    method: "POST",
    url: "/v1/admin/reports/missing-report/resolve",
    headers: { authorization: `Bearer ${resolveToken}` },
    payload: { action: "warn" }
  })
  assert.equal(missingReport.statusCode, 404)
  await app.close()
})

test("production server refuses legacy admin key compatibility", () => {
  assert.throws(
    () => createServer({
      nodeEnv: "production",
      adminKey: "legacy-key",
      allowLegacyAdminKey: true
    }),
    /legacy admin/i
  )
})

test("profile prompt route persists fixed questions and rejects malformed values", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const app = createServer({ authService })
  const token = await registerTestSession(app, "+905553330011")
  const headers = { authorization: `Bearer ${token}` }

  const saved = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers,
    payload: {
      prompts: [{ promptId: "small_joy", answer: "  Fresh coffee.  " }]
    }
  })
  assert.equal(saved.statusCode, 200)
  assert.deepEqual(saved.json().profile.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee." }
  ])

  const malformed = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers,
    payload: { prompts: "write this for me" }
  })
  assert.equal(malformed.statusCode, 400)
  await app.close()
})

async function makeAccountEligible(
  authService: AuthService,
  sessionToken: string,
  displayName = "Test User"
): Promise<void> {
  const profile = await authService.updateProfile(sessionToken, {
    displayName,
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  assert.ok(profile)
  for (const step of ["profile", "avatar", "room"] as const) {
    const onboarding = await authService.completeOnboardingStep(
      sessionToken,
      step
    )
    assert.ok(onboarding)
  }
}

async function registerTestSession(
  app: ReturnType<typeof createServer>,
  phoneNumber: string
): Promise<string> {
  const sent = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber }
  })
  assert.equal(sent.statusCode, 202)
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber, verificationCode: "482931" }
  })
  assert.equal(verified.statusCode, 200)
  return verified.json().session.sessionToken
}
