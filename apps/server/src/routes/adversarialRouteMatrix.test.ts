import assert from "node:assert/strict"
import test from "node:test"
import type { InjectOptions } from "fastify"
import { authenticateRealtimeRequest } from "../realtime/realtimeAuth"
import {
  FOREIGN_ADMIN_KEY,
  adminToken,
  createAdversarialServer,
  fillRoute,
  isServerError,
  type AdversarialServer
} from "./adversarialFixture"

// Adversarial route matrix (audit domain C). Every registered route must be
// classified here, so a new route cannot ship without an explicit decision on
// how it authenticates and whether it takes another member's resource id.
type Auth =
  | "public" // no member identity
  | "static" // public document or asset
  | "bearer" // member session, product routes check moderation
  | "account" // member session, reachable while restricted (deletion, export, phone change, refresh, logout)
  | "admin" // scoped admin JWT
  | "webhook" // provider signature

interface RouteEntry {
  auth: Auth
  /** Resource ids the caller supplies (path/query/body). "-" when none. */
  ids: string
  /** Why another member's id cannot be used; asserted by the cross-account test where noted. */
  crossAccount: string
}

const ROUTE_MATRIX: Record<string, RouteEntry> = {
  "GET /v1/docs/openapi.json": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /health": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /live": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /ready": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /.well-known/apple-app-site-association": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /.well-known/assetlinks.json": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /blumi/legal/child-safety": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /blumi/legal/delete-account": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /blumi/legal/privacy": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /blumi/legal/terms": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /blumi/support": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /admin": { auth: "static", ids: "-", crossAccount: "n/a (console shell, data needs admin JWT)" },
  "GET /admin/analytics.css": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /admin/console.css": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /admin/console.js": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /admin/reports.css": { auth: "static", ids: "-", crossAccount: "n/a" },
  "GET /v1/commerce/coin-packs": { auth: "public", ids: "-", crossAccount: "n/a (catalog)" },
  "GET /v1/room-showcase/:assetKey": { auth: "public", ids: "path assetKey", crossAccount: "private or unknown showcase -> 404 (asserted)" },
  "POST /v1/auth/firebase/complete": { auth: "public", ids: "body idToken (uid, phone)", crossAccount: "uid bound to another account -> 409 (adversarialAuthFlows)" },
  "POST /v1/auth/send-code": { auth: "public", ids: "body phoneNumber", crossAccount: "retired: 410 (firebaseAuthRoutes.test)" },
  "POST /v1/auth/verify": { auth: "public", ids: "body phoneNumber", crossAccount: "retired: 410 (firebaseAuthRoutes.test)" },
  "POST /v1/accounts/register": { auth: "public", ids: "body phoneNumber", crossAccount: "retired: 410 (firebaseAuthRoutes.test)" },
  "POST /v1/account/recovery/challenge": { auth: "public", ids: "body phoneNumber", crossAccount: "uniform answer, no account data returned" },
  "POST /v1/account/recovery/requests": { auth: "public", ids: "body old/new phone + idToken", crossAccount: "uniform 202, manual admin review" },
  "POST /v1/webhooks/revenuecat": { auth: "webhook", ids: "body event.app_user_id", crossAccount: "signature required (commerceRoutes.test)" },
  "POST /v1/auth/refresh": { auth: "account", ids: "bearer only", crossAccount: "token-bound family (sessionAdversarial)" },
  "DELETE /v1/auth/session": { auth: "account", ids: "bearer only", crossAccount: "token-bound family" },
  "POST /v1/auth/realtime-ticket": { auth: "bearer", ids: "bearer only", crossAccount: "ticket bound to issuing session (asserted)" },
  "POST /v1/capabilities/resolve": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "GET /v1/users/me": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PATCH /v1/users/me": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PATCH /v1/users/me/onboarding": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PUT /v1/users/me/avatar": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "GET /v1/users/me/room-decor": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PUT /v1/users/me/room-decor": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PUT /v1/users/me/room-showcase": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/users/me/active-room/leave": { auth: "bearer", ids: "body expectedRoomSessionId", crossAccount: "other pair's room -> ended:false, room kept (asserted)" },
  "POST /v1/account/moderation/acknowledge": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/account/firebase/challenge": { auth: "account", ids: "body targetPhoneNumber", crossAccount: "challenge bound to caller account+session" },
  "POST /v1/account/firebase/reauth": { auth: "account", ids: "body challengeId, idToken", crossAccount: "another account's phone -> 401 (sessionAdversarial)" },
  "POST /v1/account/deletion/challenge": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/deletion/confirm": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "DELETE /v1/account": { auth: "account", ids: "body confirmationToken", crossAccount: "other account's confirmation -> 403 (asserted)" },
  "POST /v1/account/export/challenge": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/export/confirm": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/export": { auth: "account", ids: "body confirmationToken", crossAccount: "confirmation digest bound to caller account" },
  "POST /v1/account/phone-change/current/challenge": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/phone-change/current/confirm": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/phone-change/new/challenge": { auth: "account", ids: "body phoneNumber", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/phone-change/new/confirm": { auth: "account", ids: "-", crossAccount: "retired with Firebase: 410" },
  "POST /v1/account/phone-change/confirm": { auth: "account", ids: "body confirmation tokens", crossAccount: "confirmation digests bound to caller account" },
  "GET /v1/discover": { auth: "bearer", ids: "query cursor", crossAccount: "cursor scoped to caller" },
  "GET /v1/discover/:userId": { auth: "bearer", ids: "path userId", crossAccount: "blocked pair / self -> 404 (asserted)" },
  "POST /v1/discover/:userId/like": { auth: "bearer", ids: "path userId", crossAccount: "blocked pair -> 400, self -> refused (asserted)" },
  "POST /v1/discover/:userId/pass": { auth: "bearer", ids: "path userId", crossAccount: "blocked pair -> 400 (asserted)" },
  "GET /v1/discover/watch": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PUT /v1/discover/watch": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "DELETE /v1/discover/watch": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/threads/sync-matches": { auth: "bearer", ids: "-", crossAccount: "caller's matches only" },
  "GET /v1/threads": { auth: "bearer", ids: "query cursor", crossAccount: "caller's threads only (asserted)" },
  "POST /v1/threads": { auth: "bearer", ids: "body participantUserIds", crossAccount: "pair without caller -> 400, unmatched -> 403 (asserted)" },
  "GET /v1/threads/:threadId/messages": { auth: "bearer", ids: "path threadId", crossAccount: "non-participant -> 404 (asserted)" },
  "POST /v1/threads/:threadId/messages": { auth: "bearer", ids: "path threadId", crossAccount: "non-participant refused, nothing stored (asserted)" },
  "POST /v1/threads/:threadId/read": { auth: "bearer", ids: "path threadId", crossAccount: "non-participant -> 404 (asserted)" },
  "GET /v1/threads/:threadId/room-invites": { auth: "bearer", ids: "path threadId", crossAccount: "non-participant -> 403 (asserted)" },
  "POST /v1/threads/:threadId/room-invites": { auth: "bearer", ids: "path threadId", crossAccount: "non-participant -> 403 (asserted)" },
  "POST /v1/room-invites/:inviteId/decision": { auth: "bearer", ids: "path inviteId", crossAccount: "non-recipient refused, invite stays pending (asserted)" },
  "POST /v1/room-invites/:inviteId/cancel": { auth: "bearer", ids: "path inviteId", crossAccount: "non-sender refused, invite stays pending (asserted)" },
  "POST /v1/room-sessions/:roomSessionId/join": { auth: "bearer", ids: "path roomSessionId", crossAccount: "non-participant -> 404 (asserted)" },
  "POST /v1/room-sessions/:roomSessionId/leave": { auth: "bearer", ids: "path roomSessionId", crossAccount: "non-participant -> 404, room kept (asserted)" },
  "POST /v1/connections/decision": { auth: "bearer", ids: "body miniRoomId, partnerUserId", crossAccount: "non-participant -> 409, nothing stored (asserted)" },
  "GET /v1/safety/blocks": { auth: "bearer", ids: "-", crossAccount: "caller's blocks only (asserted)" },
  "POST /v1/safety/blocks": { auth: "bearer", ids: "body blockedUserId", crossAccount: "creates caller's own block only" },
  "DELETE /v1/safety/blocks/:blockedUserId": { auth: "bearer", ids: "path blockedUserId", crossAccount: "removes caller's own block only; victim's block kept (asserted)" },
  "GET /v1/safety/reports": { auth: "bearer", ids: "-", crossAccount: "caller's reports only (asserted)" },
  "POST /v1/safety/reports": { auth: "bearer", ids: "body reportedUserId, header idempotency-key", crossAccount: "idempotency key scoped per reporter (asserted)" },
  "GET /v1/economy/balance": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/economy/purchase": { auth: "bearer", ids: "body itemId (catalog)", crossAccount: "caller's wallet only" },
  "POST /v1/economy/rewards/daily": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/commerce/coin-packs/reconcile": { auth: "bearer", ids: "body transactionIds", crossAccount: "other member's transaction -> 403 (commerceRoutes.test:79,108)" },
  "GET /v1/notification-preferences": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "PUT /v1/notification-preferences": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/devices": { auth: "bearer", ids: "body pushToken", crossAccount: "a known foreign token is re-bound to the caller (device hand-over design; token is a device secret)" },
  "DELETE /v1/devices": { auth: "bearer", ids: "body pushToken", crossAccount: "removes caller's registration only; victim's kept (asserted)" },
  "POST /v1/referrals/invite": { auth: "bearer", ids: "-", crossAccount: "caller only" },
  "POST /v1/referrals/claim": { auth: "bearer", ids: "body code", crossAccount: "claiming another member's code is the feature; outcome undisclosed" },
  "GET /v1/admin/session": { auth: "admin", ids: "-", crossAccount: "any valid admin JWT" },
  "GET /v1/admin/analytics": { auth: "admin", ids: "query period", crossAccount: "scope metrics:read" },
  "GET /v1/admin/users": { auth: "admin", ids: "query query", crossAccount: "scope users:read" },
  "GET /v1/admin/users/:userId": { auth: "admin", ids: "path userId", crossAccount: "scope users:read" },
  "GET /v1/admin/users/:userId/quota-audit": { auth: "admin", ids: "path userId", crossAccount: "scope users:read" },
  "POST /v1/admin/users/:userId/discovery-quota/reset": { auth: "admin", ids: "path userId", crossAccount: "scope users:manage" },
  "POST /v1/admin/users/:userId/discovery-quota/grant": { auth: "admin", ids: "path userId", crossAccount: "scope users:manage" },
  "GET /v1/admin/reports": { auth: "admin", ids: "-", crossAccount: "scope reports:read" },
  "GET /v1/admin/reports/summary": { auth: "admin", ids: "-", crossAccount: "scope reports:read" },
  "GET /v1/admin/reports/:reportId": { auth: "admin", ids: "path reportId", crossAccount: "scope reports:read" },
  "POST /v1/admin/reports/:reportId/resolve": { auth: "admin", ids: "path reportId", crossAccount: "scope reports:resolve" },
  "GET /v1/admin/account-recovery": { auth: "admin", ids: "-", crossAccount: "scope account-recovery:read" },
  "POST /v1/admin/account-recovery/:requestId/resolve": { auth: "admin", ids: "path requestId", crossAccount: "scope account-recovery:resolve" }
}

const ADMIN_SCOPE: Record<string, string | null> = {
  "GET /v1/admin/session": null,
  "GET /v1/admin/analytics": "metrics:read",
  "GET /v1/admin/users": "users:read",
  "GET /v1/admin/users/:userId": "users:read",
  "GET /v1/admin/users/:userId/quota-audit": "users:read",
  "POST /v1/admin/users/:userId/discovery-quota/reset": "users:manage",
  "POST /v1/admin/users/:userId/discovery-quota/grant": "users:manage",
  "GET /v1/admin/reports": "reports:read",
  "GET /v1/admin/reports/summary": "reports:read",
  "GET /v1/admin/reports/:reportId": "reports:read",
  "POST /v1/admin/reports/:reportId/resolve": "reports:resolve",
  "GET /v1/admin/account-recovery": "account-recovery:read",
  "POST /v1/admin/account-recovery/:requestId/resolve": "account-recovery:resolve"
}

function splitRoute(route: string): { method: InjectOptions["method"]; pattern: string } {
  const [method, pattern] = route.split(" ") as [InjectOptions["method"], string]
  return { method, pattern }
}

async function withServer(run: (server: AdversarialServer) => Promise<void>): Promise<void> {
  const server = createAdversarialServer()
  try {
    await server.app.ready()
    await run(server)
  } finally {
    await server.app.close()
  }
}

test("every registered route is classified in the adversarial route matrix", async () => {
  await withServer(async ({ app, routes }) => {
    // Plugin routes are captured by the hook; the few root routes registered
    // before it are confirmed through the router instead.
    for (const route of routes) assert.ok(ROUTE_MATRIX[route], `unclassified route ${route}`)
    for (const route of Object.keys(ROUTE_MATRIX)) {
      const { method, pattern } = splitRoute(route)
      assert.ok(routes.includes(route) || app.hasRoute({ method: method as never, url: pattern }), `stale matrix entry ${route}`)
    }
  })
})

test("cross-account ids are refused on every id-bearing member route and the victim's state is unchanged", async () => {
  await withServer(async (server) => {
    const { call } = server
    const alice = await server.createAccount("alice")
    const bob = await server.createAccount("bob")
    const pia = await server.createAccount("pia")
    const quinn = await server.createAccount("quinn")
    const mallory = await server.createAccount("mallory")
    const abThread = await server.matchAndThread(alice, bob, "ab")
    const pqThread = await server.matchAndThread(pia, quinn, "pq")

    // A-B: accepted invite -> active shared room. P-Q: invite still pending.
    const abInvite = await call("POST", `/v1/threads/${abThread}/room-invites`, { token: alice.sessionToken, payload: {} })
    assert.equal(abInvite.statusCode, 201)
    const accepted = await call("POST", `/v1/room-invites/${abInvite.json().invite.inviteId}/decision`, {
      token: bob.sessionToken, payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 200)
    const roomId = accepted.json().miniRoom.miniRoomId as string
    const pqInvite = await call("POST", `/v1/threads/${pqThread}/room-invites`, { token: pia.sessionToken, payload: {} })
    assert.equal(pqInvite.statusCode, 201)
    const pendingInviteId = pqInvite.json().invite.inviteId as string
    const aliceMessage = await call("POST", `/v1/threads/${abThread}/messages`, {
      token: alice.sessionToken, payload: { body: "hello bob", clientMessageId: "client-1" }
    })
    assert.equal(aliceMessage.statusCode, 201)
    const blockedStranger = await server.createAccount("stranger")
    assert.equal((await call("POST", "/v1/safety/blocks", { token: alice.sessionToken, payload: { blockedUserId: blockedStranger.userId } })).statusCode, 201)
    const aliceReport = await call("POST", "/v1/safety/reports", {
      token: alice.sessionToken,
      headers: { "idempotency-key": "shared-key-1" },
      payload: { reportedUserId: blockedStranger.userId, reason: "spam" }
    })
    assert.equal(aliceReport.statusCode, 201)
    assert.equal((await call("POST", "/v1/devices", { token: alice.sessionToken, payload: { platform: "ios", pushToken: "alice-device-token" } })).statusCode, 201)
    // Alice blocks Mallory so discover reads and decisions must refuse the pair.
    assert.equal((await call("POST", "/v1/safety/blocks", { token: alice.sessionToken, payload: { blockedUserId: mallory.userId } })).statusCode, 201)

    const m = mallory.sessionToken
    const results: Array<[string, number]> = []
    const expectRefused = async (route: string, url: string, allowed: number[], options: { payload?: unknown; headers?: Record<string, string> } = {}) => {
      const { method } = splitRoute(route)
      const response = await call(method, url, { token: m, ...options })
      results.push([route, response.statusCode])
      assert.ok(allowed.includes(response.statusCode), `${route}: got ${response.statusCode} ${response.body}`)
      return response
    }

    await expectRefused("GET /v1/threads/:threadId/messages", `/v1/threads/${abThread}/messages`, [404])
    await expectRefused("POST /v1/threads/:threadId/messages", `/v1/threads/${abThread}/messages`, [403, 404], { payload: { body: "intrusion" } })
    await expectRefused("POST /v1/threads/:threadId/read", `/v1/threads/${abThread}/read`, [404], { payload: {} })
    await expectRefused("GET /v1/threads/:threadId/room-invites", `/v1/threads/${pqThread}/room-invites`, [403, 404])
    await expectRefused("POST /v1/threads/:threadId/room-invites", `/v1/threads/${pqThread}/room-invites`, [403, 404], { payload: {} })
    await expectRefused("POST /v1/room-invites/:inviteId/decision", `/v1/room-invites/${pendingInviteId}/decision`, [403, 404], { payload: { status: "accepted" } })
    await expectRefused("POST /v1/room-invites/:inviteId/cancel", `/v1/room-invites/${pendingInviteId}/cancel`, [403, 404], { payload: {} })
    await expectRefused("POST /v1/room-sessions/:roomSessionId/join", `/v1/room-sessions/${roomId}/join`, [403, 404], { payload: {} })
    await expectRefused("POST /v1/room-sessions/:roomSessionId/leave", `/v1/room-sessions/${roomId}/leave`, [403, 404], { payload: {} })
    const foreignLeave = await call("POST", "/v1/users/me/active-room/leave", { token: m, payload: { expectedRoomSessionId: roomId } })
    results.push(["POST /v1/users/me/active-room/leave", foreignLeave.statusCode])
    assert.equal(foreignLeave.statusCode, 200)
    assert.equal(foreignLeave.json().ended, false)
    await expectRefused("POST /v1/threads", "/v1/threads", [400], { payload: { participantUserIds: [alice.userId, bob.userId] } })
    await expectRefused("POST /v1/threads", "/v1/threads", [403], { payload: { participantUserIds: [mallory.userId, alice.userId] } })
    await expectRefused("POST /v1/connections/decision", "/v1/connections/decision", [409], {
      payload: { miniRoomId: roomId, partnerUserId: alice.userId, status: "saved" }
    })
    await expectRefused("GET /v1/discover/:userId", `/v1/discover/${alice.userId}`, [404])
    await expectRefused("GET /v1/discover/:userId", `/v1/discover/${mallory.userId}`, [404])
    await expectRefused("POST /v1/discover/:userId/like", `/v1/discover/${alice.userId}/like`, [400], { payload: {} })
    await expectRefused("POST /v1/discover/:userId/pass", `/v1/discover/${alice.userId}/pass`, [400], { payload: {} })
    const selfLike = await call("POST", `/v1/discover/${mallory.userId}/like`, { token: m, payload: {} })
    results.push(["POST /v1/discover/:userId/like (self)", selfLike.statusCode])
    assert.ok(selfLike.statusCode >= 400 && selfLike.statusCode < 500, `self like: ${selfLike.statusCode}`)
    await expectRefused("GET /v1/room-showcase/:assetKey", `/v1/room-showcase/${"a".repeat(64)}`, [404])

    // Actor-scoped writes succeed but only ever touch the caller's own records.
    await expectRefused("DELETE /v1/safety/blocks/:blockedUserId", `/v1/safety/blocks/${blockedStranger.userId}`, [204])
    await expectRefused("DELETE /v1/devices", "/v1/devices", [204], { payload: { pushToken: "alice-device-token" } })
    const malloryReport = await expectRefused("POST /v1/safety/reports", "/v1/safety/reports", [201], {
      headers: { "idempotency-key": "shared-key-1" },
      payload: { reportedUserId: bob.userId, reason: "spam" }
    })
    assert.notEqual(malloryReport.json().report?.reportId ?? malloryReport.json().reportId, aliceReport.json().report?.reportId ?? aliceReport.json().reportId)
    const malloryBlocks = await call("GET", "/v1/safety/blocks", { token: m })
    assert.equal(malloryBlocks.statusCode, 200)
    assert.ok(!JSON.stringify(malloryBlocks.json()).includes(blockedStranger.userId))
    const malloryReports = await call("GET", "/v1/safety/reports", { token: m })
    assert.equal(malloryReports.statusCode, 200)
    assert.ok(!JSON.stringify(malloryReports.json()).includes(blockedStranger.userId))
    const malloryThreads = await call("GET", "/v1/threads", { token: m })
    assert.equal(malloryThreads.statusCode, 200)
    assert.ok(!JSON.stringify(malloryThreads.json()).includes(abThread))

    // The victims' state is intact.
    const aliceMessages = await call("GET", `/v1/threads/${abThread}/messages`, { token: alice.sessionToken })
    assert.deepEqual(aliceMessages.json().messages.map((message: { body: string }) => message.body), ["hello bob"])
    assert.ok(await server.miniRoomService.findActiveMiniRoomForUser(alice.userId))
    const pqInvites = await call("GET", `/v1/threads/${pqThread}/room-invites`, { token: quinn.sessionToken })
    assert.equal(pqInvites.json().invites.find((invite: { inviteId: string }) => invite.inviteId === pendingInviteId)?.status, "pending")
    assert.equal(await server.connectionService.repository.findDecision(roomId, mallory.userId), null)
    assert.equal(await server.safetyService.hasBlockBetween(alice.userId, blockedStranger.userId), true)
    const aliceDevices = await server.notificationService.repository.listDevices(alice.userId)
    assert.deepEqual(aliceDevices.map((device) => device.pushToken), ["alice-device-token"])

    // A realtime ticket carries only its issuer's identity.
    const ticket = await call("POST", "/v1/auth/realtime-ticket", { token: m, payload: {} })
    assert.equal(ticket.statusCode, 201)
    const actor = await authenticateRealtimeRequest({
      request: { headers: { "sec-websocket-protocol": `ticket-${ticket.json().ticket}` } } as never,
      authService: server.authService,
      realtimeTicketService: server.realtimeTicketService
    })
    assert.equal(actor?.userId, mallory.userId)

    for (const [route, status] of results) assert.ok(!isServerError(status), `${route} -> ${status}`)
  })
})

function bearerRoutes(auth: Auth[]): string[] {
  return Object.entries(ROUTE_MATRIX).filter(([, entry]) => auth.includes(entry.auth)).map(([route]) => route)
}

// Routes whose schema Fastify enforces before the handler (no attachValidation)
// get a schema-valid body so the sweep reaches the session check.
const SWEEP_BODIES: Record<string, unknown> = {
  "POST /v1/users/me/active-room/leave": { expectedRoomSessionId: "adv_room_1" }
}

async function sweep(server: AdversarialServer, token: string, routes: string[]) {
  const observed: Record<string, number> = {}
  for (const route of routes) {
    const { method, pattern } = splitRoute(route)
    const response = await server.call(method, fillRoute(pattern), {
      token,
      ...(method === "GET" ? {} : { payload: SWEEP_BODIES[route] ?? {} })
    })
    observed[route] = response.statusCode
  }
  return observed
}

// Retired legacy OTP account routes answer 410 before looking at the session.
const RETIRED_WITH_FIREBASE = new Set([
  "POST /v1/account/deletion/challenge",
  "POST /v1/account/deletion/confirm",
  "POST /v1/account/export/challenge",
  "POST /v1/account/export/confirm",
  "POST /v1/account/phone-change/current/challenge",
  "POST /v1/account/phone-change/current/confirm",
  "POST /v1/account/phone-change/new/challenge",
  "POST /v1/account/phone-change/new/confirm"
])

function assertDeadTokenRefusedEverywhere(observed: Record<string, number>, label: string) {
  for (const [route, status] of Object.entries(observed)) {
    if (route === "DELETE /v1/auth/session") {
      assert.equal(status, 204, `${label} ${route}: logout is idempotent`)
    } else if (RETIRED_WITH_FIREBASE.has(route)) {
      assert.equal(status, 410, `${label} ${route}`)
    } else {
      // Firebase routes validate the body before the session; still never 2xx/5xx.
      const allowed = route === "POST /v1/account/firebase/challenge" || route === "POST /v1/account/firebase/reauth"
        ? [400, 401]
        : [401]
      assert.ok(allowed.includes(status), `${label} ${route}: ${status}`)
    }
  }
}

test("a deleted account's token is refused on every member route", async () => {
  await withServer(async (server) => {
    const doomed = await server.createAccount("doomed")
    const deleted = await server.deleteAccountOverHttp(doomed)
    assert.ok([202, 204].includes(deleted.statusCode), `delete: ${deleted.statusCode} ${deleted.body}`)
    const again = await server.deleteAccountOverHttp(doomed)
    assert.equal(again.statusCode, 401, "a second deletion is refused, not repeated")
    assertDeadTokenRefusedEverywhere(
      await sweep(server, doomed.sessionToken, bearerRoutes(["bearer", "account"])),
      "deleted"
    )
  })
})

test("a logged-out token is refused on every member route and a second logout is harmless", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("leaver")
    assert.equal((await server.call("DELETE", "/v1/auth/session", { token: member.sessionToken })).statusCode, 204)
    assert.equal((await server.call("DELETE", "/v1/auth/session", { token: member.sessionToken })).statusCode, 204)
    assertDeadTokenRefusedEverywhere(
      await sweep(server, member.sessionToken, bearerRoutes(["bearer", "account"])),
      "logged-out"
    )
  })
})

test("a banned account is refused on every product route and keeps only its account-lifecycle routes", async () => {
  await withServer(async (server) => {
    const banned = await server.createAccount("banned")
    await server.banAccount(banned)
    const observed = await sweep(server, banned.sessionToken, bearerRoutes(["bearer"]))
    for (const [route, status] of Object.entries(observed)) {
      assert.equal(status, 403, `banned ${route}: ${status}`)
    }
    const me = await server.call("GET", "/v1/users/me", { token: banned.sessionToken })
    assert.equal(me.json().code, "ACCOUNT_BANNED")
    // Refresh stays open so the app can show the moderation notice and offer deletion.
    const refreshed = await server.call("POST", "/v1/auth/refresh", { token: banned.sessionToken })
    assert.equal(refreshed.statusCode, 200)
    const afterRefresh = await server.call("GET", "/v1/economy/balance", { token: refreshed.json().session.sessionToken })
    assert.equal(afterRefresh.statusCode, 403)
  })
})

test("admin API routes refuse missing, member, expired, foreign-key, tampered, unsigned and under-scoped credentials", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("member")
    const now = new Date()
    const expired = adminToken({ scopes: ["reports:read", "users:read", "users:manage", "reports:resolve", "metrics:read", "account-recovery:read", "account-recovery:resolve"], now: new Date(now.getTime() - 3_600_000), ttlSeconds: 60 })
    const foreign = adminToken({ scopes: ["reports:read", "users:read", "users:manage", "reports:resolve", "metrics:read", "account-recovery:read", "account-recovery:resolve"], key: FOREIGN_ADMIN_KEY })
    const allScopes = adminToken({ scopes: ["reports:read", "users:read", "users:manage", "reports:resolve", "metrics:read", "account-recovery:read", "account-recovery:resolve"] })
    const [header, claims, signature] = adminToken({ scopes: ["reports:read"] }).split(".") as [string, string, string]
    const escalatedClaims = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(claims, "base64url").toString("utf8")),
      scopes: ["users:manage", "account-recovery:resolve", "reports:resolve", "users:read", "metrics:read", "account-recovery:read", "reports:read"]
    })).toString("base64url")
    const tampered = `${header}.${escalatedClaims}.${signature}`
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: "adversarial-k1" })).toString("base64url")}.${escalatedClaims}.`
    for (const route of bearerRoutes(["admin"])) {
      const { method, pattern } = splitRoute(route)
      const url = fillRoute(pattern)
      const payload = method === "GET" ? {} : { payload: {} }
      const statusFor = async (token?: string) => (await server.call(method, url, { ...(token ? { token } : {}), ...payload })).statusCode
      assert.equal(await statusFor(), 401, `${route} without credentials`)
      assert.equal(await statusFor(member.sessionToken), 401, `${route} with a member session`)
      assert.equal(await statusFor(expired), 401, `${route} expired`)
      assert.equal(await statusFor(foreign), 401, `${route} foreign key id`)
      assert.equal(await statusFor(tampered), 401, `${route} tampered scopes`)
      assert.equal(await statusFor(unsigned), 401, `${route} alg none`)
      const scope = ADMIN_SCOPE[route]
      assert.ok(scope !== undefined, `${route} has a declared scope`)
      if (scope) {
        const wrongScope = scope === "metrics:read" ? "reports:read" : "metrics:read"
        assert.equal(await statusFor(adminToken({ scopes: [wrongScope as never] })), 403, `${route} under-scoped`)
      }
      const granted = await statusFor(allScopes)
      // 503: the optional admin service is not wired in this server.
      assert.ok(![401, 403].includes(granted) && (granted < 500 || granted === 503), `${route} with full scopes: ${granted}`)
    }
    // An admin JWT is not a member session.
    assert.equal((await server.call("GET", "/v1/users/me", { token: allScopes })).statusCode, 401)
  })
})
