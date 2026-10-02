import assert from "node:assert/strict"
import test from "node:test"
import type { InjectOptions } from "fastify"
import { createAdversarialServer, fillRoute, type AdversarialServer } from "./adversarialFixture"

// Hostile request bodies against every route that reads a body (audit domain
// C). Nothing may produce a 5xx, pollute prototypes or change state.
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function nested(depth: number): string {
  return `${"{\"a\":".repeat(depth)}1${"}".repeat(depth)}`
}

const HOSTILE_BODIES: Array<{ name: string; payload: string; contentType?: string }> = [
  { name: "json null", payload: "null" },
  { name: "json array", payload: "[1,2,3]" },
  { name: "json string", payload: "\"text\"" },
  { name: "json number", payload: "42" },
  { name: "json true", payload: "true" },
  { name: "wrong field types", payload: JSON.stringify({
    phoneNumber: 5, idToken: [], authIntent: {}, purpose: 1, challengeId: null, confirmationToken: 7,
    blockedUserId: {}, reportedUserId: [], reason: 3, participantUserIds: "a,b", body: { text: 1 },
    status: true, miniRoomId: 1, partnerUserId: null, pushToken: 1, platform: "web", step: 9,
    displayName: [], age: "twenty", decor: "x", expectedRevision: "0", isPublic: "yes",
    transactionIds: "t1", declaredCapabilities: "all", expectedRoomSessionId: 5, code: {}, itemId: 1, type: "x"
  }) },
  { name: "nulls", payload: JSON.stringify({
    phoneNumber: null, idToken: null, confirmationToken: null, blockedUserId: null, body: null,
    status: null, pushToken: null, displayName: null, decor: null, transactionIds: null
  }) },
  { name: "huge string", payload: JSON.stringify({ body: "a".repeat(900_000), displayName: "a".repeat(900_000) }) },
  { name: "huge array", payload: JSON.stringify({
    participantUserIds: Array.from({ length: 50_000 }, (_, index) => `u${index}`),
    transactionIds: Array.from({ length: 50_000 }, (_, index) => `t${index}`),
    interests: Array.from({ length: 50_000 }, () => "x")
  }) },
  { name: "deeply nested", payload: nested(5_000) },
  { name: "__proto__ key", payload: "{\"__proto__\":{\"polluted\":true},\"body\":\"x\"}" },
  { name: "constructor.prototype key", payload: "{\"constructor\":{\"prototype\":{\"polluted\":true}},\"body\":\"x\"}" },
  { name: "nested __proto__", payload: "{\"decor\":{\"__proto__\":{\"polluted\":true}},\"expectedRevision\":0,\"discoveryPreferences\":{\"__proto__\":{\"isAdmin\":true}}}" },
  { name: "unknown fields only", payload: JSON.stringify({ unexpected: 1, isAdmin: true, userId: "someone_else" }) },
  { name: "malformed json", payload: "{\"body\": " },
  { name: "text/plain body", payload: "body=x", contentType: "text/plain" }
]

async function stateFingerprint(server: AdversarialServer, token: string) {
  const [me, blocks, reports, threads, balance, prefs] = await Promise.all([
    server.call("GET", "/v1/users/me", { token }),
    server.call("GET", "/v1/safety/blocks", { token }),
    server.call("GET", "/v1/safety/reports", { token }),
    server.call("GET", "/v1/threads", { token }),
    server.call("GET", "/v1/economy/balance", { token }),
    server.call("GET", "/v1/notification-preferences", { token })
  ])
  // updatedAt is ignored: an all-ignored PATCH /v1/users/me (nulls, unknown keys) still touches it.
  return JSON.stringify(
    [me.json(), blocks.json(), reports.json(), threads.json(), balance.json(), prefs.json()],
    (key, value: unknown) => key === "updatedAt" ? undefined : value
  )
}

async function sweepRoutes(server: AdversarialServer, token: string, routes: string[], ids: Record<string, string>) {
  const failures: string[] = []
  const accepted: string[] = []
  for (const route of routes) {
    const [method, pattern] = route.split(" ") as [InjectOptions["method"], string]
    const url = fillRoute(pattern, ids)
    for (const body of HOSTILE_BODIES) {
      const response = await server.app.inject({
        method,
        url,
        remoteAddress: `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
        headers: { authorization: `Bearer ${token}`, "content-type": body.contentType ?? "application/json" },
        payload: body.payload
      })
      if (response.statusCode >= 500) failures.push(`${route} [${body.name}] -> ${response.statusCode} ${response.body.slice(0, 120)}`)
      else if (response.statusCode < 400) accepted.push(`${route} [${body.name}]`)
    }
  }
  return { failures, accepted }
}

test("hostile bodies on every body route are rejected without a 5xx, prototype pollution or state change", async () => {
  const server = createAdversarialServer()
  try {
    await server.app.ready()
    const member = await server.createAccount("hostile")
    const partner = await server.createAccount("partner")
    const threadId = await server.matchAndThread(member, partner, "hostile")
    const before = await stateFingerprint(server, member.sessionToken)
    const routes = [...new Set(server.routes)]
      .filter((route) => BODY_METHODS.has(route.split(" ")[0]!) && !SESSION_ENDING.has(route) && !BODYLESS.has(route))
    assert.ok(routes.length > 40)
    const { failures, accepted } = await sweepRoutes(server, member.sessionToken, routes, { threadId })
    assert.equal(({} as Record<string, unknown>).polluted, undefined)
    assert.equal(({} as Record<string, unknown>).isAdmin, undefined)
    assert.deepEqual(failures, [])
    assert.deepEqual(accepted.filter((entry) => !ACCEPTED_BY_CONTRACT.has(entry)).sort(), [])
    assert.equal(await stateFingerprint(server, member.sessionToken), before, "no hostile body changed member state")
  } finally {
    await server.app.close()
  }
})

test("bodyless and session-ending routes ignore hostile bodies without a 5xx", async () => {
  const server = createAdversarialServer()
  try {
    await server.app.ready()
    const member = await server.createAccount("bodyless")
    const partner = await server.createAccount("bodylesspartner")
    const threadId = await server.matchAndThread(member, partner, "bodyless")
    const { failures } = await sweepRoutes(server, member.sessionToken, [...BODYLESS], { threadId })
    assert.deepEqual(failures, [])
    for (const route of SESSION_ENDING) {
      const fresh = await server.createAccount(`end${route.length}`)
      const { failures: endFailures } = await sweepRoutes(server, fresh.sessionToken, [route], {})
      assert.deepEqual(endFailures, [])
    }
    assert.equal(({} as Record<string, unknown>).polluted, undefined)
  } finally {
    await server.app.close()
  }
})

test("PATCH /v1/users/me rejects wrongly typed profile fields with 400 and writes nothing", async () => {
  const server = createAdversarialServer()
  try {
    await server.app.ready()
    const member = await server.createAccount("typed")
    const stored = () => server.authService.repository.findAccountById(member.accountId)
    const before = await stored()
    assert.ok(before)
    const wrong: Array<Record<string, unknown>> = [
      { displayName: [] }, { displayName: 5 }, { age: "twenty" }, { age: [25] }, { bio: 42 },
      { bio: { text: "x" } }, { gender: 1 }, { identityGender: true }, { avatarPresetId: 7 },
      { discoveryPreferences: "all" }, { discoveryPreferences: [1] }, { interests: [1, 2] },
      { interests: "music" }, { prompts: "none" },
      // One wrong field fails the whole update, even next to valid ones.
      { displayName: "Renamed", age: "twenty" }, { bio: "fine", interests: ["ok", 3] }
    ]
    for (const payload of wrong) {
      const response = await server.call("PATCH", "/v1/users/me", { token: member.sessionToken, payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    assert.deepEqual(await stored(), before, "no field and no updatedAt changed")

    // Explicit null keeps its previous meaning (not provided) and unknown keys stay ignored.
    const tolerated = await server.call("PATCH", "/v1/users/me", {
      token: member.sessionToken,
      payload: { displayName: "Kept Name", age: null, bio: null, gender: null, interests: null, futureField: { x: 1 } }
    })
    assert.equal(tolerated.statusCode, 200, tolerated.body)
    const after = await stored()
    assert.equal(after?.profile.displayName, "Kept Name")
    assert.equal(after?.profile.age, before.profile.age)
    assert.equal(after?.profile.gender, before.profile.gender)
  } finally {
    await server.app.close()
  }
})

// Swept separately with a throwaway session: they end or rotate the caller's session.
const SESSION_ENDING = new Set(["POST /v1/auth/refresh", "DELETE /v1/auth/session"])

// Routes without a body contract: the body is ignored and the route acts on
// the caller (or answers uniformly: recovery requests). They are swept only for
// 5xx because their normal effect (a ticket, an invite, a daily reward) is a
// legitimate state change.
const BODYLESS = new Set([
  "POST /v1/auth/realtime-ticket",
  "POST /v1/account/moderation/acknowledge",
  "POST /v1/account/recovery/requests",
  "PUT /v1/discover/watch",
  "DELETE /v1/discover/watch",
  "POST /v1/threads/sync-matches",
  // Optional body (2026-10-01): absent or stripped of unknown keys it reads up
  // to now, the route's normal effect. Its body contract is pinned in
  // chatReceiptRoutes.test.ts.
  "POST /v1/threads/:threadId/read",
  // Optional body (2026-10-02): absent or stripped of unknown keys it hides
  // through the newest message, the route's normal effect. Its body contract
  // is pinned in chatHideRoutes.test.ts.
  "POST /v1/threads/:threadId/hide",
  "POST /v1/threads/:threadId/room-invites",
  "POST /v1/economy/rewards/daily",
  "POST /v1/referrals/invite",
  "DELETE /v1/safety/blocks/:blockedUserId"
])

// Hostile bodies a body route accepts under its current contract; each is a
// no-op for member state (the fingerprint assertion proves it).
const ACCEPTED_BY_CONTRACT = new Set([
  // Fastify's default Ajv coercion turns 5 / "t1" / 1 into "5" / ["t1"] / "1".
  "POST /v1/users/me/active-room/leave [wrong field types]",
  "POST /v1/commerce/coin-packs/reconcile [wrong field types]",
  "DELETE /v1/devices [wrong field types]",
  // Partial-update contracts ignore unknown keys and treat null as "not
  // provided"; PATCH /v1/users/me answers 400 for wrongly typed known keys.
  "PUT /v1/notification-preferences [wrong field types]",
  "PUT /v1/notification-preferences [nulls]",
  "PUT /v1/notification-preferences [deeply nested]",
  "PUT /v1/notification-preferences [unknown fields only]",
  "PATCH /v1/users/me [nulls]",
  "PATCH /v1/users/me [deeply nested]",
  "PATCH /v1/users/me [unknown fields only]"
])
