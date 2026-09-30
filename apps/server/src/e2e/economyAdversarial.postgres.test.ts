import assert from "node:assert/strict"
import test from "node:test"
import { createHmac } from "node:crypto"
import { Pool } from "pg"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createDevelopmentSmsProvider } from "../auth/smsProvider"
import { createCommerceService } from "../commerce/commerceService"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createPostgresEconomyRepository } from "../db/postgresEconomyRepository"
import { createPostgresPersonalRoomDecorRepository } from "../db/postgresPersonalRoomDecorRepository"
import { createPostgresReferralRepository } from "../db/postgresReferralRepository"
import { createEconomyService } from "../economy/economyService"
import { createReferralService } from "../referrals/referralService"
import { createPersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import { createServer } from "../server"

// PostgreSQL twin of routes/economyAdversarial.test.ts: the same attacks run
// through the real routes against real row locks, constraints and CTEs.
// Concurrency stays at or below 20 parallel requests per attack.

const databaseUrl = process.env.DATABASE_URL?.trim()
const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }
const CODE = "482931"
const WEBHOOK_SECRET = "adversarial-test-webhook-secret"
const FEMALE_TOP = "avatar_v2_top_sage_ribbon_knit_jacket"
const ROOM_SHELL = "room_v2_shell_blumi_world_v1"
const STARTER_COINS = 1250

let pool: Pool
let phoneCounter = 0

test.before(() => {
  if (process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1") return
  assert.ok(databaseUrl, "Use the isolated postgres-gate")
  pool = new Pool({ connectionString: databaseUrl, max: 25 })
})

test.after(async () => {
  await pool?.end()
})

function harness() {
  const authService = createAuthService({
    repository: createPostgresAuthRepository(pool),
    codeFactory: () => CODE,
    otpHmacSecret: process.env.BLUMI_OTP_HMAC_SECRET,
    smsProvider: createDevelopmentSmsProvider()
  })
  const economyService = createEconomyService({ repository: createPostgresEconomyRepository(pool) })
  const personalRoomDecorService = createPersonalRoomDecorService({
    repository: createPostgresPersonalRoomDecorRepository(pool),
    getOwnedRoomItemIds: async (userId) => (await economyService.getInventory(userId)).ownedRoomItemIds
  })
  const app = createServer({
    authService,
    economyService,
    commerceService: createCommerceService({ economyService }),
    personalRoomDecorService,
    referralService: createReferralService({ repository: createPostgresReferralRepository(pool) }),
    revenueCatWebhookSigningSecret: WEBHOOK_SECRET,
    purchaseEnvironment: "production"
  })
  return { app, authService, economyService }
}

async function onboardedAccount(authService: ReturnType<typeof harness>["authService"]) {
  phoneCounter += 1
  const phoneNumber = `+9055588${String(phoneCounter).padStart(5, "0")}`
  await authService.sendCode(phoneNumber)
  const signedIn = await authService.registerAccount(phoneNumber, CODE, { version: "test-terms-v1", locale: "tr" })
  const token = signedIn.sessionToken
  await authService.updateProfile(token, {
    displayName: "Adversary",
    age: 27,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(token, step)
  }
  const resolved = await authService.getSession(token)
  assert.ok(resolved)
  return { userId: resolved.account.userId, headers: { authorization: `Bearer ${token}` } }
}

async function coins(userId: string) {
  const result = await pool.query("SELECT coins, coin_debt FROM blumi_economy_inventories WHERE user_id = $1", [userId])
  return { coins: Number(result.rows[0].coins), coinDebt: Number(result.rows[0].coin_debt) }
}

test("PG-A2 twenty concurrent identical purchases debit once", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload: { itemId: FEMALE_TOP, type: "avatar" } })
  ))
  assert.equal(responses.filter((response) => response.statusCode === 201).length, 1)
  assert.equal(responses.filter((response) => response.statusCode >= 500).length, 0)
  assert.deepEqual(await coins(user.userId), { coins: STARTER_COINS - 410, coinDebt: 0 })
  const owned = await pool.query(
    "SELECT array_length(array_positions(owned_avatar_item_ids, $2), 1) AS copies FROM blumi_economy_inventories WHERE user_id = $1",
    [user.userId, FEMALE_TOP]
  )
  assert.equal(Number(owned.rows[0].copies), 1)
  await app.close()
})

test("PG-A3 concurrent different purchases never overdraw the balance", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const items = [FEMALE_TOP, "avatar_v2_top_azure_garden_halter", "avatar_v2_top_coral_wave_polo",
    "avatar_v2_shoes_pearl_slingback_sandals", "avatar_v2_accessory_cherry_micro_bag", "avatar_v2_shoes_onyx_heart_mary_janes",
    "avatar_v2_accessory_honey_blossom_square_glasses", "avatar_v2_accessory_rose_round_glasses",
    "avatar_v2_accessory_mint_star_oval_glasses", "avatar_v2_accessory_sage_heart_glasses"]
  const responses = await Promise.all(items.map((itemId) =>
    app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload: { itemId, type: "avatar" } })
  ))
  assert.equal(responses.filter((response) => response.statusCode >= 500).length, 0)
  const spent = responses
    .filter((response) => response.statusCode === 201)
    .reduce((sum, response) => sum + (response.json().priceCoins as number), 0)
  const balance = await coins(user.userId)
  assert.ok(balance.coins >= 0)
  assert.equal(balance.coins, STARTER_COINS - spent)
  assert.ok(responses.some((response) => response.statusCode === 400))
  await app.close()
})

test("PG-A8 the daily reward is granted once under twenty concurrent claims", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "POST", url: "/v1/economy/rewards/daily", headers: user.headers })
  ))
  assert.equal(responses.filter((response) => response.statusCode !== 200).length, 0)
  assert.equal(responses.filter((response) => response.json().claimed === true).length, 1)
  assert.equal((await coins(user.userId)).coins, STARTER_COINS + 25)
  const ledger = await pool.query("SELECT count(*)::int AS entries FROM blumi_economy_reward_ledger WHERE user_id = $1", [user.userId])
  assert.equal(ledger.rows[0].entries, 1)
  await app.close()
})

test("PG-A10 twenty concurrent avatar saves with the same revision produce exactly one write", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "PUT", url: "/v1/users/me/avatar", headers: user.headers, payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 } })
  ))
  assert.equal(responses.filter((response) => response.statusCode === 200).length, 1)
  assert.equal(responses.filter((response) => response.statusCode === 409).length, 19)
  const stored = await pool.query("SELECT avatar_revision FROM blumi_accounts WHERE user_id = $1", [user.userId])
  assert.equal(Number(stored.rows[0].avatar_revision), 1)
  await app.close()
})

test("PG-A12 twenty concurrent room saves with the same revision produce exactly one write", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const save = (expectedRevision: number, index: number) => app.inject({
    method: "PUT", url: "/v1/users/me/room-decor", headers: user.headers,
    payload: { expectedRevision, decor: { roomShellId: ROOM_SHELL, placedItems: [{ instanceId: "bed", itemId: "room_v2_cozy_bed", x: index / 20, y: 0.5, rotation: "front" }] } }
  })
  for (const expectedRevision of [0, 1]) {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => save(expectedRevision, index)))
    assert.equal(responses.filter((response) => response.statusCode === 200).length, 1, `revision ${expectedRevision}`)
    assert.equal(responses.filter((response) => response.statusCode === 409).length, 19, `revision ${expectedRevision}`)
  }
  const stored = await pool.query("SELECT revision FROM blumi_personal_room_decor WHERE user_id = $1", [user.userId])
  assert.equal(Number(stored.rows[0].revision), 2)
  await app.close()
})

test("PG-A13 a room save with a revision the server never issued is refused, not a server error", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const response = await app.inject({
    method: "PUT", url: "/v1/users/me/room-decor", headers: user.headers,
    payload: { expectedRevision: 3, decor: { roomShellId: ROOM_SHELL, placedItems: [] } }
  })
  assert.equal(response.statusCode, 400)
  assert.match(response.json().error, /refresh your room/i)
  const stored = await pool.query("SELECT count(*)::int AS rooms FROM blumi_personal_room_decor WHERE user_id = $1", [user.userId])
  assert.equal(stored.rows[0].rooms, 0)
  await app.close()
})

test("PG-A14 concurrent referral claims attribute each invitee and each code at most once", requirePostgres, async () => {
  const { app, authService } = harness()
  const inviters = [await onboardedAccount(authService), await onboardedAccount(authService)]
  const invitees = await Promise.all(Array.from({ length: 6 }, () => onboardedAccount(authService)))
  const codes: string[] = []
  for (const inviter of inviters) {
    const response = await app.inject({ method: "POST", url: "/v1/referrals/invite", headers: inviter.headers })
    codes.push(response.json().invite.code as string)
  }
  // One invitee races both codes; five invitees race the first code.
  const requests = [
    ...Array.from({ length: 10 }, (_, index) => ({ headers: invitees[0]!.headers, code: codes[index % 2]! })),
    ...invitees.slice(1).map((invitee) => ({ headers: invitee.headers, code: codes[0]! })),
    { headers: inviters[0]!.headers, code: codes[0]! }
  ]
  const responses = await Promise.all(requests.map((request, index) => app.inject({
    method: "POST", url: "/v1/referrals/claim", headers: request.headers, payload: { code: request.code },
    remoteAddress: `10.0.0.${index + 1}`
  })))
  assert.ok(responses.every((response) => response.statusCode === 204))
  const claims = await pool.query(
    "SELECT code, claimed_by_user_id FROM blumi_referral_invites WHERE code = ANY($1::text[]) AND claimed_by_user_id IS NOT NULL",
    [codes]
  )
  assert.ok(claims.rows.length >= 1 && claims.rows.length <= 2)
  const claimants = claims.rows.map((row) => row.claimed_by_user_id as string)
  assert.equal(new Set(claimants).size, claimants.length, "an invitee is attributed at most once")
  assert.equal(claimants.includes(inviters[0]!.userId), false, "no self-referral")
  await app.close()
})

function signedWebhook(event: Record<string, unknown>) {
  const body = JSON.stringify({ event: { environment: "PRODUCTION", store: "APP_STORE", event_timestamp_ms: Date.now(), ...event } })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.`).update(body).digest("hex")
  return {
    method: "POST" as const,
    url: "/v1/webhooks/revenuecat",
    headers: { "content-type": "application/json", "x-revenuecat-webhook-signature": `t=${timestamp},v1=${signature}` },
    payload: body
  }
}

test("PG-A16 replayed and duplicated signed coin events credit a transaction once, and a refund reverses it once", requirePostgres, async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const credit = signedWebhook({
    id: "evt_replay_1", type: "NON_RENEWING_PURCHASE", app_user_id: user.userId,
    transaction_id: "txn_replay_1", product_id: "com.blumi.mobile.coins.500"
  })
  const duplicateEvent = signedWebhook({
    id: "evt_replay_2", type: "INITIAL_PURCHASE", app_user_id: user.userId,
    transaction_id: "txn_replay_1", product_id: "com.blumi.mobile.coins.500"
  })
  const responses = await Promise.all([
    ...Array.from({ length: 15 }, () => app.inject(credit)),
    ...Array.from({ length: 5 }, () => app.inject(duplicateEvent))
  ])
  assert.ok(responses.every((response) => response.statusCode === 200), responses.map((response) => response.statusCode).join(","))
  assert.deepEqual(await coins(user.userId), { coins: STARTER_COINS + 500, coinDebt: 0 })

  const refund = signedWebhook({
    id: "evt_replay_refund", type: "CANCELLATION", app_user_id: user.userId,
    transaction_id: "txn_replay_1", product_id: "com.blumi.mobile.coins.500"
  })
  const refunds = await Promise.all(Array.from({ length: 10 }, () => app.inject(refund)))
  assert.ok(refunds.every((response) => response.statusCode === 200))
  assert.deepEqual(await coins(user.userId), { coins: STARTER_COINS, coinDebt: 0 })

  // A later replay of the original credit cannot re-credit the refunded purchase.
  assert.equal((await app.inject(credit)).statusCode, 200)
  assert.deepEqual(await coins(user.userId), { coins: STARTER_COINS, coinDebt: 0 })

  // The same transaction replayed for another account is refused and moves nothing.
  const other = await onboardedAccount(authService)
  const stolen = await app.inject(signedWebhook({
    id: "evt_replay_3", type: "NON_RENEWING_PURCHASE", app_user_id: other.userId,
    transaction_id: "txn_replay_1", product_id: "com.blumi.mobile.coins.500"
  }))
  assert.equal(stolen.statusCode, 409)
  assert.deepEqual(await coins(other.userId), { coins: STARTER_COINS, coinDebt: 0 })
  await app.close()
})

test("PG-A17 twenty concurrent rewards racing a refund repay the debt first and settle once", requirePostgres, async () => {
  const { app, authService, economyService } = harness()
  const user = await onboardedAccount(authService)
  await economyService.getInventory(user.userId)
  const now = new Date().toISOString()
  const refund = economyService.repository.applyCoinTransaction({
    provider: "revenuecat", eventId: "evt_pg_a17_refund", transactionId: "txn_pg_a17_refund", userId: user.userId,
    productId: "com.blumi.mobile.coins.1500", store: "ios", kind: "reversal", coins: 1500,
    payloadHash: "c".repeat(64), occurredAt: now, updatedAt: now
  })
  const rewards = Array.from({ length: 20 }, (_, index) =>
    economyService.claimDailyReward(user.userId, new Date(Date.UTC(2026, 9, index + 1, 12))))
  const [claims] = await Promise.all([Promise.all(rewards), refund])
  assert.equal(claims.filter((claim) => claim.claimed).length, 20)
  // 1250 starter - 1500 refunded + 20 x 25 earned = 250, whatever the interleaving.
  assert.deepEqual(await coins(user.userId), { coins: 250, coinDebt: 0 })
  const ledger = await pool.query(
    "SELECT count(*)::int AS entries, sum(coins)::int AS total FROM blumi_economy_reward_ledger WHERE user_id = $1",
    [user.userId]
  )
  assert.deepEqual(ledger.rows[0], { entries: 20, total: 500 }, "ledger rows keep the full reward amount")
  const purchase = await app.inject({
    method: "POST", url: "/v1/economy/purchase", headers: user.headers,
    payload: { itemId: "avatar_v2_top_rosebud_picnic_peplum", type: "avatar" }
  })
  assert.equal(purchase.statusCode, 201, purchase.body)
  assert.deepEqual(await coins(user.userId), { coins: 170, coinDebt: 0 })
  await app.close()
})
