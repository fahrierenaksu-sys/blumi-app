import assert from "node:assert/strict"
import test from "node:test"
import { createHmac } from "node:crypto"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { createAuthService, type AuthService } from "../auth/authService"
import { createEconomyService } from "../economy/economyService"
import { createReferralService } from "../referrals/referralService"
import { createServer } from "../server"

// Adversarial route coverage for the coin economy, avatar loadout, room decor
// and referral writes. Every attack runs through the real Fastify routes with
// in-memory repositories; the PostgreSQL twin lives in
// economyAdversarial.postgres.test.ts.

const CODE = "482931"
const FEMALE_TOP = "avatar_v2_top_sage_ribbon_knit_jacket" // 410 coins
const CHEAP_TOP = "avatar_v2_top_rosebud_picnic_peplum" // 80 coins
const MALE_TOP = "avatar_v2_top_male_tonal_geometric_camp_collar_shirt"
const ROOM_ITEM = "room_v2_side_table" // 240 coins
const STARTER_COINS = 1250
const ROOM_SHELL = "room_v2_shell_blumi_world_v1"

let phoneCounter = 0

async function onboardedAccount(authService: AuthService, options: { onboard?: boolean } = {}) {
  phoneCounter += 1
  const phoneNumber = `+9055577${String(phoneCounter).padStart(5, "0")}`
  await authService.sendCode(phoneNumber)
  const signedIn = await authService.verifyCode(phoneNumber, CODE)
  const token = signedIn.sessionToken
  if (options.onboard !== false) {
    await authService.updateProfile(token, {
      displayName: "Adversary",
      age: 27,
      gender: "woman",
      avatarPresetId: "avatar_v2_body_default"
    })
    for (const step of ["profile", "avatar", "room"] as const) {
      await authService.completeOnboardingStep(token, step)
    }
  }
  const resolved = await authService.getSession(token)
  assert.ok(resolved)
  return {
    token,
    userId: resolved.account.userId,
    accountId: resolved.account.accountId,
    headers: { authorization: `Bearer ${token}` }
  }
}

function harness() {
  const authService = createAuthService({ codeFactory: () => CODE })
  const economyService = createEconomyService()
  const referralService = createReferralService()
  const app = createServer({ authService, economyService, referralService })
  return { app, authService, economyService }
}

async function balance(app: ReturnType<typeof createServer>, headers: Record<string, string>) {
  const response = await app.inject({ method: "GET", url: "/v1/economy/balance", headers })
  assert.equal(response.statusCode, 200)
  return response.json().inventory as { coins: number; coinDebt: number; ownedAvatarItemIds: string[]; ownedRoomItemIds: string[] }
}

test("A1 the same purchase sent twice sequentially charges once and reports already owned", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const payload = { itemId: FEMALE_TOP, type: "avatar" }
  const first = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload })
  const second = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload })
  assert.equal(first.statusCode, 201)
  assert.equal(first.json().priceCoins, 410)
  assert.equal(second.statusCode, 400)
  assert.match(second.json().error, /already own/i)
  const inventory = await balance(app, user.headers)
  assert.equal(inventory.coins, STARTER_COINS - 410)
  assert.equal(inventory.ownedAvatarItemIds.filter((id) => id === FEMALE_TOP).length, 1)
  await app.close()
})

test("A2 twenty concurrent identical purchases debit once", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload: { itemId: FEMALE_TOP, type: "avatar" } })
  ))
  assert.equal(responses.filter((response) => response.statusCode === 201).length, 1)
  assert.equal(responses.filter((response) => response.statusCode === 400).length, 19)
  const inventory = await balance(app, user.headers)
  assert.equal(inventory.coins, STARTER_COINS - 410)
  await app.close()
})

test("A3 concurrent different purchases never overdraw the balance", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const items = [FEMALE_TOP, "avatar_v2_top_azure_garden_halter", "avatar_v2_top_coral_wave_polo",
    "avatar_v2_shoes_pearl_slingback_sandals", "avatar_v2_accessory_cherry_micro_bag", "avatar_v2_shoes_onyx_heart_mary_janes",
    "avatar_v2_accessory_honey_blossom_square_glasses", "avatar_v2_accessory_rose_round_glasses"]
  const responses = await Promise.all(items.map((itemId) =>
    app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload: { itemId, type: "avatar" } })
  ))
  const spent = responses
    .filter((response) => response.statusCode === 201)
    .reduce((sum, response) => sum + (response.json().priceCoins as number), 0)
  const inventory = await balance(app, user.headers)
  assert.ok(inventory.coins >= 0)
  assert.equal(inventory.coins, STARTER_COINS - spent)
  assert.ok(responses.some((response) => response.statusCode === 400 && /not enough coins/i.test(response.json().error)))
  await app.close()
})

test("A4 unknown, cross-category, default-owned, retired and wrong-body items are refused without a charge", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const attempts = [
    { itemId: "avatar_v2_top_does_not_exist", type: "avatar", error: /not available/i },
    { itemId: FEMALE_TOP, type: "room", error: /not available/i },
    { itemId: ROOM_ITEM, type: "avatar", error: /not available/i },
    { itemId: "avatar_v2_top_default", type: "avatar", error: /already own/i },
    { itemId: "room_v2_cozy_bed", type: "room", error: /already own/i },
    { itemId: "avatar_v2_top_locked_luxe", type: "avatar", error: /not available/i },
    { itemId: MALE_TOP, type: "avatar", error: /does not fit/i },
    { itemId: "", type: "avatar", error: /choose a shop item/i },
    { itemId: "   ", type: "avatar", error: /choose a shop item/i },
    { itemId: FEMALE_TOP, type: "hat", error: /valid shop category/i },
    { itemId: FEMALE_TOP, type: undefined, error: /valid shop category/i }
  ]
  for (const attempt of attempts) {
    const response = await app.inject({
      method: "POST", url: "/v1/economy/purchase", headers: user.headers,
      payload: { itemId: attempt.itemId, type: attempt.type }
    })
    assert.equal(response.statusCode, 400, `${attempt.itemId}/${attempt.type}`)
    assert.match(response.json().error, attempt.error, `${attempt.itemId}/${attempt.type}`)
  }
  assert.equal((await balance(app, user.headers)).coins, STARTER_COINS)
  await app.close()
})

test("A5 client-supplied price, grants, body and user ids are ignored", async () => {
  const { app, authService } = harness()
  const victim = await onboardedAccount(authService)
  const user = await onboardedAccount(authService)
  const response = await app.inject({
    method: "POST", url: "/v1/economy/purchase", headers: user.headers,
    payload: {
      itemId: CHEAP_TOP,
      type: "avatar",
      priceCoins: -100000,
      coins: 999999,
      grantedItemIds: [FEMALE_TOP, ROOM_ITEM],
      avatarBodyId: "avatar_v2_body_male_light",
      userId: victim.userId
    }
  })
  assert.equal(response.statusCode, 201, response.body)
  assert.equal(response.json().priceCoins, 80)
  const inventory = await balance(app, user.headers)
  assert.equal(inventory.coins, STARTER_COINS - 80)
  assert.equal(inventory.ownedAvatarItemIds.includes(FEMALE_TOP), false)
  assert.equal(inventory.ownedRoomItemIds.includes(ROOM_ITEM), false)
  assert.equal((await balance(app, victim.headers)).coins, STARTER_COINS)

  const maleBodyClaim = await app.inject({
    method: "POST", url: "/v1/economy/purchase", headers: user.headers,
    payload: { itemId: MALE_TOP, type: "avatar", avatarBodyId: "avatar_v2_body_male_light" }
  })
  assert.equal(maleBodyClaim.statusCode, 400)
  await app.close()
})

test("A6 malformed purchase bodies never crash the route", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const bodies: unknown[] = [
    [], [FEMALE_TOP], "avatar", 42, null, { itemId: 7, type: "avatar" },
    { itemId: [FEMALE_TOP], type: "avatar" }, { itemId: { toString: FEMALE_TOP }, type: "avatar" },
    { itemId: FEMALE_TOP, type: ["avatar"] }, { itemId: "x".repeat(100_000), type: "avatar" },
    { itemId: "__proto__", type: "avatar" }, { itemId: "constructor", type: "room" }
  ]
  for (const payload of bodies) {
    const response = await app.inject({
      method: "POST", url: "/v1/economy/purchase",
      headers: { ...user.headers, "content-type": "application/json" },
      payload: JSON.stringify(payload)
    })
    assert.ok([400, 415].includes(response.statusCode), `${JSON.stringify(payload)?.slice(0, 40)} -> ${response.statusCode}`)
  }
  assert.equal((await balance(app, user.headers)).coins, STARTER_COINS)
  await app.close()
})

test("A7 unauthenticated, unonboarded, banned and deleted accounts cannot spend or claim coins", async () => {
  const { app, authService } = harness()
  const payload = { itemId: CHEAP_TOP, type: "avatar" }
  const anonymous = await app.inject({ method: "POST", url: "/v1/economy/purchase", payload })
  assert.equal(anonymous.statusCode, 401)

  const fresh = await onboardedAccount(authService, { onboard: false })
  const unonboarded = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: fresh.headers, payload })
  assert.equal(unonboarded.statusCode, 403)
  assert.equal(unonboarded.json().code, "ONBOARDING_REQUIRED")

  const banned = await onboardedAccount(authService)
  const account = await authService.repository.findAccountById(banned.accountId)
  assert.ok(account)
  await authService.repository.saveAccount({
    ...account,
    moderation: { status: "banned", updatedAt: new Date().toISOString() }
  })
  for (const request of [
    { method: "POST" as const, url: "/v1/economy/purchase", payload },
    { method: "POST" as const, url: "/v1/economy/rewards/daily" },
    { method: "PUT" as const, url: "/v1/users/me/avatar", payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 } },
    { method: "PUT" as const, url: "/v1/users/me/room-decor", payload: { expectedRevision: 0, decor: { roomShellId: ROOM_SHELL, placedItems: [] } } }
  ]) {
    const response = await app.inject({ ...request, headers: banned.headers })
    assert.equal(response.statusCode, 403, request.url)
  }

  const deleted = await onboardedAccount(authService)
  await authService.requestAccountDeletionChallenge(deleted.token)
  const confirmation = await authService.verifyAccountDeletionChallenge(deleted.token, CODE)
  assert.ok(confirmation)
  assert.equal(await authService.deleteAccount(deleted.token, confirmation.confirmationToken), "deleted")
  const afterDeletion = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: deleted.headers, payload })
  assert.equal(afterDeletion.statusCode, 401)
  await app.close()
})

test("A8 the daily reward is granted once per UTC day under twenty concurrent claims", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "POST", url: "/v1/economy/rewards/daily", headers: user.headers })
  ))
  assert.equal(responses.filter((response) => response.json().claimed === true).length, 1)
  assert.equal((await balance(app, user.headers)).coins, STARTER_COINS + 25)
  await app.close()
})

test("A9 avatar equip rejects unowned, other-account, wrong-body, malformed and stale loadouts", async () => {
  const { app, authService } = harness()
  const owner = await onboardedAccount(authService)
  const user = await onboardedAccount(authService)
  const bought = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: owner.headers, payload: { itemId: FEMALE_TOP, type: "avatar" } })
  assert.equal(bought.statusCode, 201)

  const put = (headers: Record<string, string>, payload: unknown) => app.inject({
    method: "PUT", url: "/v1/users/me/avatar",
    headers: { ...headers, "content-type": "application/json" },
    payload: JSON.stringify(payload)
  })
  // Another account owns the item; this account does not.
  const unowned = await put(user.headers, { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: FEMALE_TOP }, revision: 0 })
  assert.equal(unowned.statusCode, 400)
  assert.equal(unowned.json().code, "unowned_item")
  const wrongBody = await put(user.headers, { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: DEFAULT_MALE_AVATAR_LOADOUT.topId }, revision: 0 })
  assert.equal(wrongBody.statusCode, 400)
  const tooMany = await put(user.headers, {
    loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: Array.from({ length: 7 }, (_, index) => `avatar_v2_accessory_${index}`) },
    revision: 0
  })
  assert.equal(tooMany.statusCode, 400)

  const malformed: unknown[] = [
    { loadout: null, revision: 0 }, { loadout: [], revision: 0 }, { loadout: "x", revision: 0 },
    { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: "avatar_v2_accessory_sunny_star_clips" }, revision: 0 },
    { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: 5 }, revision: 0 },
    { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, schemaVersion: 99 }, revision: 0 },
    { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [null, null] }, revision: 0 },
    { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: "0" },
    { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0.5 },
    { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 1e308 },
    { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: Number.MAX_SAFE_INTEGER },
    { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT },
    [DEFAULT_FEMALE_AVATAR_LOADOUT, 0]
  ]
  for (const payload of malformed) {
    const response = await put(user.headers, payload)
    assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 80))
  }

  const saved = await put(user.headers, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 })
  assert.equal(saved.statusCode, 200)
  const stale = await put(user.headers, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 })
  assert.equal(stale.statusCode, 409)
  const future = await put(user.headers, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 7 })
  assert.equal(future.statusCode, 409)

  const ownerSave = await put(owner.headers, { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: FEMALE_TOP }, revision: 0 })
  assert.equal(ownerSave.statusCode, 200)
  await app.close()
})

test("A10 twenty concurrent avatar saves with the same revision produce exactly one write", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, () =>
    app.inject({ method: "PUT", url: "/v1/users/me/avatar", headers: user.headers, payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 } })
  ))
  assert.equal(responses.filter((response) => response.statusCode === 200).length, 1)
  assert.equal(responses.filter((response) => response.statusCode === 409).length, 19)
  await app.close()
})

test("A11 room decor rejects unowned, other-account, duplicate, out-of-bounds, oversized and malformed layouts", async () => {
  const { app, authService } = harness()
  const owner = await onboardedAccount(authService)
  const user = await onboardedAccount(authService)
  assert.equal((await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: owner.headers, payload: { itemId: ROOM_ITEM, type: "room" } })).statusCode, 201)
  const placed = (overrides: Record<string, unknown> = {}) => ({ instanceId: "a", itemId: "room_v2_cozy_bed", x: 0.5, y: 0.5, rotation: "front", ...overrides })
  const put = (payload: unknown) => app.inject({
    method: "PUT", url: "/v1/users/me/room-decor",
    headers: { ...user.headers, "content-type": "application/json" },
    payload: JSON.stringify(payload)
  })
  const invalidDecor: unknown[] = [
    { roomShellId: ROOM_SHELL, placedItems: [placed({ itemId: ROOM_ITEM })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ itemId: "room_v2_unknown_sofa" })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed(), placed()] },
    { roomShellId: ROOM_SHELL, placedItems: [placed(), placed({ instanceId: "b" })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ x: 1.0001 })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ y: -0.0001 })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ x: "0.5" })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ rotation: "up" })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ depth: 3 })] },
    { roomShellId: ROOM_SHELL, placedItems: [placed({ instanceId: "../../etc" })] },
    { roomShellId: ROOM_SHELL, placedItems: Array.from({ length: 61 }, (_, index) => placed({ instanceId: `i${index}` })) },
    { roomShellId: "room_v2_shell_other", placedItems: [] },
    { roomShellId: ROOM_SHELL, placedItems: {} },
    { roomShellId: ROOM_SHELL, placedItems: [null] },
    { roomShellId: ROOM_SHELL, placedItems: [], schemaVersion: 2 },
    { roomShellId: ROOM_SHELL, placedItems: [], migration: { fromSchemaVersion: 1, sourceShellId: "x" } }
  ]
  for (const decor of invalidDecor) {
    const response = await put({ expectedRevision: 0, decor })
    assert.equal(response.statusCode, 400, JSON.stringify(decor).slice(0, 100))
  }
  for (const payload of [
    { expectedRevision: -1, decor: { roomShellId: ROOM_SHELL, placedItems: [] } },
    { expectedRevision: 0.5, decor: { roomShellId: ROOM_SHELL, placedItems: [] } },
    { expectedRevision: 0, decor: [] },
    { expectedRevision: 0, decor: "room" },
    [{ expectedRevision: 0 }]
  ]) {
    const response = await put(payload)
    assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 100))
  }
  // Fastify's default Ajv coerces "0" to 0 and strips unknown top-level keys;
  // a foreign userId is dropped and the write lands on the caller's own room.
  const coerced = await put({ expectedRevision: "0", decor: { roomShellId: ROOM_SHELL, placedItems: [] }, userId: owner.userId })
  assert.equal(coerced.statusCode, 200)
  assert.equal(coerced.json().roomDecor.userId, user.userId)
  const ownerRoom = await app.inject({ method: "GET", url: "/v1/users/me/room-decor", headers: owner.headers })
  assert.equal(ownerRoom.json().roomDecor, null)
  const huge = await app.inject({
    method: "PUT", url: "/v1/users/me/room-decor",
    headers: { ...user.headers, "content-type": "application/json" },
    payload: JSON.stringify({ expectedRevision: 0, decor: { roomShellId: ROOM_SHELL, placedItems: [], padding: "x".repeat(2 * 1024 * 1024) } })
  })
  assert.equal(huge.statusCode, 413)
  const afterHuge = await app.inject({ method: "GET", url: "/v1/users/me/room-decor", headers: user.headers })
  assert.equal(afterHuge.json().roomDecor.revision, 1)
  await app.close()
})

test("A12 twenty concurrent room saves with the same revision produce exactly one write", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    app.inject({
      method: "PUT", url: "/v1/users/me/room-decor", headers: user.headers,
      payload: { expectedRevision: 0, decor: { roomShellId: ROOM_SHELL, placedItems: [{ instanceId: "bed", itemId: "room_v2_cozy_bed", x: index / 20, y: 0.5, rotation: "front" }] } }
    })
  ))
  assert.equal(responses.filter((response) => response.statusCode === 200).length, 1)
  assert.equal(responses.filter((response) => response.statusCode === 409).length, 19)
  await app.close()
})

test("A13 a room save with a revision the server never issued is refused, not a server error", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  // No room has ever been saved for this account, but the client claims revision 3
  // (for example after a reinstall with a cached layout).
  const response = await app.inject({
    method: "PUT", url: "/v1/users/me/room-decor", headers: user.headers,
    payload: { expectedRevision: 3, decor: { roomShellId: ROOM_SHELL, placedItems: [] } }
  })
  assert.equal(response.statusCode, 400)
  assert.match(response.json().error, /refresh your room/i)
  await app.close()
})

test("A14 referral claims: self, repeat, second code and twenty concurrent claims attribute once", async () => {
  const { app, authService } = harness()
  const inviter = await onboardedAccount(authService)
  const otherInviter = await onboardedAccount(authService)
  const invitee = await onboardedAccount(authService)
  const issue = async (headers: Record<string, string>) => {
    const response = await app.inject({ method: "POST", url: "/v1/referrals/invite", headers })
    assert.equal(response.statusCode, 200)
    return response.json().invite.code as string
  }
  const code = await issue(inviter.headers)
  assert.equal(await issue(inviter.headers), code, "one stable code per inviter")
  const otherCode = await issue(otherInviter.headers)
  const self = await app.inject({ method: "POST", url: "/v1/referrals/claim", headers: inviter.headers, payload: { code } })
  assert.equal(self.statusCode, 204)
  // The claim route allows 20 requests per hour; stay inside that budget.
  const claims = await Promise.all(Array.from({ length: 18 }, (_, index) =>
    app.inject({ method: "POST", url: "/v1/referrals/claim", headers: invitee.headers, payload: { code: index % 2 ? code : otherCode } })
  ))
  assert.ok(claims.every((response) => response.statusCode === 204))
  const malformed = await app.inject({ method: "POST", url: "/v1/referrals/claim", headers: invitee.headers, payload: { code: ["r_x"] } })
  assert.equal(malformed.statusCode, 400)
  // Referrals carry no coin grant: balances stay at the starter amount.
  assert.equal((await balance(app, invitee.headers)).coins, STARTER_COINS)
  assert.equal((await balance(app, inviter.headers)).coins, STARTER_COINS)
  await app.close()
})

test("A17 earned reward coins settle a refund debt first so purchases become possible again", async () => {
  const { app, authService, economyService } = harness()
  const user = await onboardedAccount(authService)
  await economyService.getInventory(user.userId)
  const refund = await economyService.repository.applyCoinTransaction({
    provider: "revenuecat", eventId: "evt_refund", transactionId: "txn_refund", userId: user.userId,
    productId: "com.blumi.mobile.coins.1500", store: "ios", kind: "reversal", coins: 1500,
    payloadHash: "b".repeat(64), occurredAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  })
  assert.equal(refund.inventory.coinDebt, 250)
  for (let day = 1; day <= 20; day += 1) {
    await economyService.claimDailyReward(user.userId, new Date(Date.UTC(2026, 9, day, 12)))
  }
  // 20 daily rewards (500 coins) first repay the 250-coin debt; the rest is spendable.
  const inventory = await balance(app, user.headers)
  assert.equal(inventory.coinDebt, 0)
  assert.equal(inventory.coins, 250)
  const purchase = await app.inject({ method: "POST", url: "/v1/economy/purchase", headers: user.headers, payload: { itemId: CHEAP_TOP, type: "avatar" } })
  assert.equal(purchase.statusCode, 201, purchase.body)
  await app.close()
})

test("A15 disabled payments: the webhook cannot be forged with an empty secret and reconcile fails closed", async () => {
  const { app, authService } = harness()
  const user = await onboardedAccount(authService)
  const body = JSON.stringify({
    event: {
      id: "evt_forged", type: "NON_RENEWING_PURCHASE", app_user_id: user.userId,
      transaction_id: "txn_forged", product_id: "com.blumi.mobile.coins.500",
      store: "APP_STORE", environment: "PRODUCTION", event_timestamp_ms: Date.now()
    }
  })
  const timestamp = Math.floor(Date.now() / 1000)
  for (const secret of ["", "undefined", "null"]) {
    const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex")
    const response = await app.inject({
      method: "POST", url: "/v1/webhooks/revenuecat",
      headers: { "content-type": "application/json", "x-revenuecat-webhook-signature": `t=${timestamp},v1=${signature}` },
      payload: body
    })
    assert.equal(response.statusCode, 401)
  }
  const reconcile = await app.inject({
    method: "POST", url: "/v1/commerce/coin-packs/reconcile", headers: user.headers,
    payload: { transactionIds: ["txn_forged"] }
  })
  assert.equal(reconcile.statusCode, 503)
  assert.equal((await balance(app, user.headers)).coins, STARTER_COINS)
  await app.close()
})
