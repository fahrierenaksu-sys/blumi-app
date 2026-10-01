import assert from "node:assert/strict"
import test from "node:test"
import type { FastifyInstance, InjectOptions } from "fastify"
import { createAuthService, type AuthService } from "../auth/authService"
import type { FirebaseAuthVerifier } from "../auth/firebaseAuth"
import { createAvatarService } from "../avatar/avatarService"
import { createChatService } from "../chat/chatService"
import type { RevenueCatPurchaseVerifier } from "../commerce/revenueCatPurchaseVerifier"
import type { ConnectionService } from "../connections/connectionService"
import { createEconomyService } from "../economy/economyService"
import { createMatchService } from "../matches/matchService"
import { createNotificationService } from "../notifications/notificationService"
import { createPersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"
import { assertRequestValidationPolicy } from "./routeHelpers"

// Every route that defers schema errors to its handler, and what that handler
// does with them. Changing a route's policy must be a reviewed edit here.
const ENFORCED_ROUTES = [
  "DELETE /v1/devices",
  "DELETE /v1/safety/blocks/:blockedUserId",
  "GET /v1/discover",
  "GET /v1/discover/:userId",
  "GET /v1/threads/:threadId/messages",
  "GET /v1/threads/:threadId/room-invites",
  "PATCH /v1/users/me",
  "PATCH /v1/users/me/onboarding",
  "POST /v1/account/deletion/confirm",
  "POST /v1/account/export/confirm",
  "POST /v1/account/firebase/challenge",
  "POST /v1/account/firebase/reauth",
  "POST /v1/account/phone-change/current/confirm",
  "POST /v1/account/phone-change/new/challenge",
  "POST /v1/account/phone-change/new/confirm",
  "POST /v1/account/recovery/challenge",
  "POST /v1/accounts/register",
  "POST /v1/auth/firebase/complete",
  "POST /v1/auth/send-code",
  "POST /v1/auth/verify",
  "POST /v1/commerce/coin-packs/reconcile",
  "POST /v1/connections/decision",
  "POST /v1/devices",
  "POST /v1/discover/:userId/like",
  "POST /v1/discover/:userId/pass",
  "POST /v1/room-invites/:inviteId/cancel",
  "POST /v1/room-invites/:inviteId/decision",
  "POST /v1/room-sessions/:roomSessionId/join",
  "POST /v1/room-sessions/:roomSessionId/leave",
  "POST /v1/safety/blocks",
  "POST /v1/safety/reports",
  "POST /v1/threads",
  "POST /v1/threads/:threadId/messages",
  "POST /v1/threads/:threadId/read",
  "POST /v1/threads/:threadId/room-invites",
  "PUT /v1/chat-preferences",
  "PUT /v1/notification-preferences",
  "PUT /v1/users/me/avatar",
  "PUT /v1/users/me/room-decor",
  "PUT /v1/users/me/room-showcase"
]

const ADVISORY_ROUTES = [
  // Malformed confirmation gets the same 403 REAUTH_REQUIRED as an expired one.
  "DELETE /v1/account",
  "POST /v1/account/export",
  "POST /v1/account/phone-change/confirm",
  // Uniform 202 so the public route cannot probe which numbers have accounts.
  "POST /v1/account/recovery/requests",
  // Third-party webhook: signature first (401), malformed signed events acked.
  "POST /v1/webhooks/revenuecat"
]

const PHONE_NUMBER = "+905551117711"
const CODE = "482931"

test("every attachValidation route declares an explicit request validation policy", async () => {
  const app = createServer({ legalPagesEnabled: true })
  const routes: Array<{ route: string; attach: boolean; policy?: string }> = []
  app.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      if (method === "HEAD") continue
      routes.push({
        route: `${method} ${route.url}`,
        attach: route.attachValidation === true,
        policy: route.config?.requestValidation
      })
    }
  })
  await app.ready()
  await app.close()

  const enforced = routes.filter((entry) => entry.policy === "enforced").map((entry) => entry.route).sort()
  const advisory = routes.filter((entry) => entry.policy === "advisory").map((entry) => entry.route).sort()
  assert.deepEqual(enforced, [...ENFORCED_ROUTES].sort())
  assert.deepEqual(advisory, [...ADVISORY_ROUTES].sort())
  assert.deepEqual(
    routes.filter((entry) => entry.attach && !entry.policy).map((entry) => entry.route),
    []
  )
})

test("route registration rejects attachValidation without a declared policy", () => {
  assert.throws(
    () => assertRequestValidationPolicy({ method: "POST", url: "/x", attachValidation: true }),
    /without config\.requestValidation/
  )
  assert.throws(
    () => assertRequestValidationPolicy({
      method: "POST",
      url: "/x",
      config: { requestValidation: "enforced" }
    }),
    /without attachValidation/
  )
  assert.doesNotThrow(() => assertRequestValidationPolicy({
    method: "POST",
    url: "/x",
    attachValidation: true,
    config: { requestValidation: "advisory" }
  }))
})

test("routes without attachValidation answer schema failures without validator internals", async () => {
  const app = createServer()
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/users/me/active-room/leave",
      payload: { unexpected: true }
    })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.error, "Check your request and try again.")
    assert.equal(body.statusCode, 400)
    assert.equal(typeof body.requestId, "string")
    assert.doesNotMatch(response.body, /must|required|expectedRoomSessionId|body\//)
  } finally {
    await app.close()
  }
})

test("auth routes reject schema-invalid bodies with their existing 400 before any code is sent", async () => {
  const { app, authService } = await createHarness()
  const sendCode = spyOn(authService, "sendCode")
  const verifyExistingAccount = spyOn(authService, "verifyExistingAccount")
  const registerAccount = spyOn(authService, "registerAccount")
  try {
    await expectInputError(app, {
      method: "POST",
      url: "/v1/auth/send-code",
      payload: { phoneNumber: { country: "TR" } }
    }, 400, { error: "Enter a valid phone number with country code." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/auth/verify",
      payload: { phoneNumber: PHONE_NUMBER }
    }, 400, { error: "Enter a valid phone number and 6-digit code." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/accounts/register",
      payload: {
        phoneNumber: PHONE_NUMBER,
        verificationCode: CODE,
        termsAcceptance: { version: "2026-09-01", locale: "de" }
      }
    }, 400, { error: "Enter a valid phone number, 6-digit code, and Terms acceptance." })
    assert.equal(sendCode.calls, 0)
    assert.equal(verifyExistingAccount.calls, 0)
    assert.equal(registerAccount.calls, 0)
  } finally {
    await app.close()
  }
})

test("account routes reject schema-invalid bodies before touching profile, avatar, or verification services", async () => {
  const firebaseAuthVerifier: FirebaseAuthVerifier = {
    async verifyIdToken() {
      throw new Error("must not verify a malformed request")
    }
  }
  const { app, authService, avatarService, headers } = await createHarness({ firebaseAuthVerifier })
  const updateProfile = spyOn(authService, "updateProfile")
  const createChallenge = spyOn(authService, "createFirebaseActionChallenge")
  const completeOnboardingStep = spyOn(authService, "completeOnboardingStep")
  const saveAvatar = spyOn(avatarService, "saveAvatar")
  try {
    // Previously accepted as an empty profile patch (200).
    await expectInputError(app, {
      method: "PATCH", url: "/v1/users/me", headers, payload: ["Defne"]
    }, 400, { error: "Choose valid profile details." })
    await expectInputError(app, {
      method: "PUT", url: "/v1/users/me/avatar", headers, payload: []
    }, 400, { code: "invalid_revision", error: "Refresh your avatar and try again." })
    await expectInputError(app, {
      method: "PATCH", url: "/v1/users/me/onboarding", headers, payload: { step: "done" }
    }, 400, { error: "Choose a valid setup step." })
    // Previously forwarded to the challenge service with a 1-character number.
    await expectInputError(app, {
      method: "POST",
      url: "/v1/account/firebase/challenge",
      headers,
      payload: { purpose: "phone_change_new", targetPhoneNumber: "1" }
    }, 400, { error: "Invalid verification purpose." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/account/firebase/reauth",
      headers,
      payload: { idToken: "token", challengeId: "short", purpose: "account_deletion" }
    }, 400, { error: "Phone verification could not be completed." })
    assert.equal(updateProfile.calls, 0)
    assert.equal(createChallenge.calls, 0)
    assert.equal(completeOnboardingStep.calls, 0)
    assert.equal(saveAvatar.calls, 0)

    // Unauthenticated malformed requests still get 401 first.
    const unauthenticated = await app.inject({
      method: "PATCH", url: "/v1/users/me", payload: ["Defne"]
    })
    assert.equal(unauthenticated.statusCode, 401)
  } finally {
    await app.close()
  }
})

test("safety routes reject schema-invalid reports and blocks before the safety service runs", async () => {
  const { app, safetyService, headers } = await createHarness()
  const blockUser = spyOn(safetyService, "blockUser")
  const reportUser = spyOn(safetyService, "reportUser")
  try {
    await expectInputError(app, {
      method: "POST", url: "/v1/safety/blocks", headers, payload: {}
    }, 400, { error: "Choose a person first." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/safety/reports",
      headers,
      payload: { reportedUserId: "user_2", reason: "not-a-reason" }
    }, 400, { error: "Choose a person first." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/safety/reports",
      headers: { ...headers, "idempotency-key": "" },
      payload: { reportedUserId: "user_2", reason: "spam" }
    }, 400, { error: "Use a valid idempotency key." })
    assert.equal(blockUser.calls, 0)
    assert.equal(reportUser.calls, 0)
  } finally {
    await app.close()
  }
})

test("connection, notification, and room decor routes reject schema-invalid bodies before their services run", async () => {
  let decisions = 0
  const connectionService = {
    repository: {},
    async decide() {
      decisions += 1
      throw new Error("must not decide a malformed request")
    }
  } as unknown as ConnectionService
  const { app, notificationService, personalRoomDecorService, headers } = await createHarness({
    connectionService
  })
  const updatePreferences = spyOn(notificationService, "updatePreferences")
  const registerDevice = spyOn(notificationService, "registerDevice")
  const removeDevice = spyOn(notificationService, "removeDevice")
  const saveDecor = spyOn(personalRoomDecorService, "save")
  try {
    await expectInputError(app, {
      method: "POST",
      url: "/v1/connections/decision",
      headers,
      payload: { miniRoomId: "room_1", partnerUserId: "user_2", status: "later" }
    }, 400, { error: "Choose a valid room decision." })
    await expectInputError(app, {
      method: "PUT",
      url: "/v1/notification-preferences",
      headers,
      payload: { quietHours: { startMinute: 60 } }
    }, 400, { error: "Choose valid notification preferences." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/devices",
      headers,
      payload: { platform: "web", pushToken: "ExponentPushToken[abc]" }
    }, 400, { error: "Choose a valid device platform." })
    await expectInputError(app, {
      method: "DELETE", url: "/v1/devices", headers, payload: { pushToken: " " }
    }, 400, { error: "Choose a valid push token." })
    // Previously forwarded to the decor service as an array.
    await expectInputError(app, {
      method: "PUT",
      url: "/v1/users/me/room-decor",
      headers,
      payload: { expectedRevision: 0, decor: [] }
    }, 400, { error: "Refresh your room and try again." })
    assert.equal(decisions, 0)
    assert.equal(updatePreferences.calls, 0)
    assert.equal(registerDevice.calls, 0)
    assert.equal(removeDevice.calls, 0)
    assert.equal(saveDecor.calls, 0)
  } finally {
    await app.close()
  }
})

test("thread routes reject schema-invalid params, queries, and bodies before chat services run", async () => {
  const { app, chatService, headers } = await createHarness()
  const listMessages = spyOn(chatService, "listMessages")
  const markThreadRead = spyOn(chatService, "markThreadRead")
  const createThread = spyOn(chatService, "createThread")
  try {
    // Previously the invalid query was ignored and the thread was read.
    await expectInputError(app, {
      method: "GET",
      url: "/v1/threads/thread_1/messages?before=m1&before=m2",
      headers
    }, 400, { error: "Choose valid message page options." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/threads/thread_1/messages",
      headers,
      payload: { body: { text: "hi" } }
    }, 400, { error: "Write a message first." })
    await expectInputError(app, {
      method: "POST", url: "/v1/threads/%20/read", headers
    }, 400, { error: "Choose a conversation first." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/threads",
      headers,
      payload: { participantUserIds: ["a", "b", "c"] }
    }, 400, { error: "Choose two conversation participants." })
    await expectInputError(app, {
      method: "POST",
      url: "/v1/room-invites/invite_1/decision",
      headers,
      payload: { status: "maybe" }
    }, 400, { error: "Choose a valid room invite decision." })
    assert.equal(listMessages.calls, 0)
    assert.equal(markThreadRead.calls, 0)
    assert.equal(createThread.calls, 0)
  } finally {
    await app.close()
  }
})

test("commerce and discover routes reject schema-invalid input before verification or decisions", async () => {
  let verifications = 0
  const revenueCatPurchaseVerifier: RevenueCatPurchaseVerifier = {
    async verifyTransactions() {
      verifications += 1
      return []
    }
  }
  const { app, matchService, headers } = await createHarness({ revenueCatPurchaseVerifier })
  const decideEligible = spyOn(matchService, "decideEligible")
  const listDiscovery = spyOn(matchService, "listDiscovery")
  try {
    await expectInputError(app, {
      method: "POST",
      url: "/v1/commerce/coin-packs/reconcile",
      headers,
      payload: { transactionIds: [] }
    }, 400, {
      code: "COMMERCE_TRANSACTION_IDS_INVALID",
      error: "Choose valid purchases to reconcile."
    })
    await expectInputError(app, {
      method: "GET", url: "/v1/discover?ageMin=abc", headers
    }, 400, { error: "Choose an age range from 18 to 99." })
    await expectInputError(app, {
      method: "POST", url: "/v1/discover/%20/like", headers
    }, 400, { error: "Choose a profile first." })
    assert.equal(verifications, 0)
    assert.equal(decideEligible.calls, 0)
    assert.equal(listDiscovery.calls, 0)
  } finally {
    await app.close()
  }
})

test("request bodies exactly as the current mobile app sends them pass every enforced schema", async () => {
  const app = createServer()
  const validationErrors: string[] = []
  app.addHook("preHandler", async (request) => {
    if (request.validationError) {
      validationErrors.push(
        `${request.method} ${request.routeOptions.url}: ${request.validationError.message}`
      )
    }
  })
  const auth = { authorization: "Bearer dv_mobile_shape_probe" }
  const confirmationToken = "dv_00000000-0000-4000-8000-000000000000_00000000-0000-4000-8000-000000000001"
  // Shapes copied from apps/mobile/src/features/**/*Api.ts and sessionApi.ts.
  const requests: InjectOptions[] = [
    { method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber: PHONE_NUMBER } },
    { method: "POST", url: "/v1/auth/verify", payload: { phoneNumber: PHONE_NUMBER, verificationCode: CODE } },
    {
      method: "POST",
      url: "/v1/accounts/register",
      // RegisterAccountInput carries an optional authIntent the schema does not
      // declare; Fastify strips it (removeAdditional) instead of rejecting it.
      payload: {
        phoneNumber: PHONE_NUMBER,
        verificationCode: CODE,
        authIntent: "create",
        termsAcceptance: { version: "2026-09-01", locale: "tr" }
      }
    },
    {
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: {
        idToken: "firebase-id-token",
        authIntent: "create",
        termsAcceptance: { version: "2026-09-01", locale: "en" }
      }
    },
    { method: "POST", url: "/v1/auth/firebase/complete", payload: { idToken: "firebase-id-token", authIntent: "sign-in" } },
    { method: "POST", url: "/v1/account/firebase/challenge", headers: auth, payload: { purpose: "account_deletion" } },
    {
      method: "POST",
      url: "/v1/account/firebase/challenge",
      headers: auth,
      payload: { purpose: "phone_change_new", targetPhoneNumber: "+905559998877" }
    },
    {
      method: "POST",
      url: "/v1/account/firebase/reauth",
      headers: auth,
      payload: {
        idToken: "firebase-id-token",
        challengeId: confirmationToken,
        purpose: "phone_change_new",
        currentPhoneConfirmationToken: confirmationToken
      }
    },
    {
      method: "PATCH",
      url: "/v1/users/me",
      headers: auth,
      payload: {
        displayName: "Defne",
        age: 27,
        avatarPresetId: "avatar_v2_body_default",
        bio: "Hi",
        gender: "woman",
        identityGender: "woman",
        discoveryPreferences: { ageMin: 18, ageMax: 40, genders: ["man"], vibes: ["coffee"] },
        interests: ["coffee"],
        prompts: [{ promptId: "ideal_sunday", answer: "Tea" }]
      }
    },
    { method: "PUT", url: "/v1/users/me/avatar", headers: auth, payload: { loadout: { schemaVersion: 2 }, revision: 3 } },
    { method: "PATCH", url: "/v1/users/me/onboarding", headers: auth, payload: { step: "room" } },
    { method: "POST", url: "/v1/account/deletion/confirm", headers: auth, payload: { verificationCode: CODE } },
    { method: "POST", url: "/v1/account/export/confirm", headers: auth, payload: { verificationCode: CODE } },
    { method: "POST", url: "/v1/account/phone-change/current/confirm", headers: auth, payload: { verificationCode: CODE } },
    { method: "POST", url: "/v1/account/phone-change/new/confirm", headers: auth, payload: { verificationCode: CODE } },
    {
      method: "POST",
      url: "/v1/account/phone-change/new/challenge",
      headers: auth,
      payload: { phoneNumber: "+905559998877", currentPhoneConfirmationToken: confirmationToken }
    },
    { method: "POST", url: "/v1/account/recovery/challenge", payload: { phoneNumber: "+905559998877" } },
    {
      method: "POST",
      url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: PHONE_NUMBER, newPhoneNumber: "+905559998877", idToken: "firebase-id-token" }
    },
    { method: "DELETE", url: "/v1/account", headers: auth, payload: { confirmationToken } },
    { method: "POST", url: "/v1/account/export", headers: auth, payload: { confirmationToken } },
    {
      method: "POST",
      url: "/v1/account/phone-change/confirm",
      headers: auth,
      payload: { currentPhoneConfirmationToken: confirmationToken, newPhoneConfirmationToken: confirmationToken }
    },
    { method: "GET", url: "/v1/discover?ageMin=18&ageMax=99&gender=woman&gender=man&vibe=coffee&limit=12&cursor=abc", headers: auth },
    { method: "GET", url: "/v1/discover?ageMin=21&ageMax=35&limit=12", headers: auth },
    { method: "GET", url: "/v1/discover/user_2", headers: auth },
    { method: "POST", url: "/v1/discover/user_2/like", headers: auth },
    { method: "POST", url: "/v1/discover/user_2/pass", headers: auth },
    { method: "POST", url: "/v1/threads", headers: auth, payload: { participantUserIds: ["user_1", "user_2"] } },
    { method: "GET", url: "/v1/threads/thread_1/room-invites", headers: auth },
    { method: "POST", url: "/v1/threads/thread_1/room-invites", headers: auth, payload: {} },
    { method: "POST", url: "/v1/room-invites/invite_1/decision", headers: auth, payload: { status: "accepted" } },
    { method: "POST", url: "/v1/room-invites/invite_1/cancel", headers: auth },
    { method: "POST", url: "/v1/room-sessions/room_1/join", headers: auth },
    { method: "POST", url: "/v1/room-sessions/room_1/leave", headers: auth },
    { method: "GET", url: "/v1/threads/thread_1/messages?before=message_1&limit=30", headers: auth },
    { method: "GET", url: "/v1/threads/thread_1/messages", headers: auth },
    {
      method: "POST",
      url: "/v1/threads/thread_1/messages",
      headers: auth,
      payload: { body: "Hello", clientMessageId: "client-1" }
    },
    { method: "POST", url: "/v1/threads/thread_1/read", headers: auth },
    // 2026-10-01 builds name the newest partner message they showed.
    { method: "POST", url: "/v1/threads/thread_1/read", headers: auth, payload: { upToMessageId: "message_1" } },
    { method: "PUT", url: "/v1/chat-preferences", headers: auth, payload: { readReceiptsEnabled: true } },
    { method: "POST", url: "/v1/safety/blocks", headers: auth, payload: { blockedUserId: "user_2" } },
    { method: "DELETE", url: "/v1/safety/blocks/user_2", headers: auth },
    {
      method: "POST",
      url: "/v1/safety/reports",
      headers: { ...auth, "idempotency-key": "report-key-123456" },
      payload: { reportedUserId: "user_2", reason: "spam", note: "details" }
    },
    {
      method: "POST",
      url: "/v1/connections/decision",
      headers: auth,
      payload: { miniRoomId: "room_1", partnerUserId: "user_2", status: "saved" }
    },
    {
      method: "POST",
      url: "/v1/commerce/coin-packs/reconcile",
      headers: auth,
      payload: { transactionIds: ["2000000123456789"] }
    },
    { method: "PUT", url: "/v1/notification-preferences", headers: auth, payload: { likesEnabled: false, quietHoursTimeZone: "Europe/Istanbul" } },
    { method: "PUT", url: "/v1/notification-preferences", headers: auth, payload: { quietHoursTimeZone: "America/Argentina/ComodRivadavia" } },
    { method: "POST", url: "/v1/devices", headers: auth, payload: { platform: "ios", pushToken: "ExponentPushToken[abc]" } },
    { method: "DELETE", url: "/v1/devices", headers: auth, payload: { pushToken: "ExponentPushToken[abc]" } },
    {
      method: "PUT",
      url: "/v1/users/me/room-decor",
      headers: auth,
      payload: { expectedRevision: 0, decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] } }
    },
    { method: "PUT", url: "/v1/users/me/room-showcase", headers: auth, payload: { isPublic: true, headline: "My room" } },
    { method: "PUT", url: "/v1/users/me/room-showcase", headers: auth, payload: { isPublic: false } }
  ]
  try {
    for (const request of requests) {
      const response = await app.inject(request)
      assert.notEqual(response.statusCode, 415, `${request.method} ${request.url} media type`)
    }
    assert.deepEqual(validationErrors, [])
  } finally {
    await app.close()
  }
})

interface HarnessOptions {
  firebaseAuthVerifier?: FirebaseAuthVerifier
  connectionService?: ConnectionService
  revenueCatPurchaseVerifier?: RevenueCatPurchaseVerifier
}

async function createHarness(options: HarnessOptions = {}) {
  const authService = createAuthService({ codeFactory: () => CODE })
  const session = await createProductSession(authService)
  const economyService = createEconomyService()
  const notificationService = createNotificationService()
  const matchService = createMatchService({ economyService, notificationService })
  const safetyService = createSafetyService()
  const chatService = createChatService()
  const avatarService = createAvatarService({ authService, economyService })
  const personalRoomDecorService = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => []
  })
  const app = createServer({
    authService,
    economyService,
    notificationService,
    matchService,
    safetyService,
    chatService,
    avatarService,
    personalRoomDecorService,
    ...options
  })
  return {
    app,
    authService,
    avatarService,
    chatService,
    matchService,
    notificationService,
    personalRoomDecorService,
    safetyService,
    headers: { authorization: `Bearer ${session.sessionToken}` }
  }
}

async function createProductSession(authService: AuthService) {
  await authService.sendCode(PHONE_NUMBER)
  const signedIn = await authService.verifyCode(PHONE_NUMBER, CODE)
  await authService.updateProfile(signedIn.sessionToken, {
    displayName: "Validation Owner",
    age: 27,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(signedIn.sessionToken, step)
  }
  return signedIn
}

async function expectInputError(
  app: FastifyInstance,
  request: InjectOptions,
  statusCode: number,
  body: Record<string, unknown>
) {
  const response = await app.inject(request)
  const label = `${request.method} ${request.url}`
  assert.equal(response.statusCode, statusCode, `${label}: ${response.body}`)
  assert.deepEqual(response.json(), body, label)
}

function spyOn<T extends object, K extends keyof T>(target: T, key: K) {
  const original = target[key]
  assert.equal(typeof original, "function")
  const record = { calls: 0 }
  target[key] = ((...args: unknown[]) => {
    record.calls += 1
    return (original as (...values: unknown[]) => unknown).apply(target, args)
  }) as T[K]
  return record
}
