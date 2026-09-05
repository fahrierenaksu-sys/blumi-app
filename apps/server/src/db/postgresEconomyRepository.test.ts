import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

function createFakePool(rows: Record<string, unknown>[] = []) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        return { rows }
      }
    }
  }
}

test("postgres economy repository loads persisted inventory", async () => {
  const fake = createFakePool([
    {
      user_id: "user_a",
      coins: 890,
      owned_avatar_item_ids: [
        "avatar_v2_top_default",
        "avatar_v2_top_lilac_offshoulder_bow_blouse"
      ],
      owned_room_item_ids: ["room_v2_chair_blush"],
      updated_at: "2026-06-27T10:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const inventory = await repository.getInventory("user_a")

  assert.equal(inventory?.coins, 890)
  assert.deepEqual(inventory?.ownedRoomItemIds, ["room_v2_chair_blush"])
  assert.ok(
    inventory?.ownedAvatarItemIds.includes(
      "avatar_v2_top_lilac_offshoulder_bow_blouse"
    )
  )
  assert.match(fake.calls[0].text, /FROM blumi_economy_inventories/)
  assert.deepEqual(fake.calls[0].values, ["user_a"])
})

test("postgres economy repository upserts full inventory atomically", async () => {
  const fake = createFakePool()
  const repository = createPostgresEconomyRepository(fake.pool)

  await repository.saveInventory({
    userId: "user_a",
    coins: 1010,
    coinDebt: 0,
    ownedAvatarItemIds: ["avatar_v2_top_default"],
    ownedRoomItemIds: ["room_v2_chair_blush", "room_v2_side_table"],
    updatedAt: "2026-06-27T10:00:00.000Z"
  })

  assert.match(fake.calls[0].text, /INSERT INTO blumi_economy_inventories/)
  assert.match(fake.calls[0].text, /ON CONFLICT \(user_id\) DO UPDATE/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 5), [
    "user_a",
    1010,
    0,
    ["avatar_v2_top_default"],
    ["room_v2_chair_blush", "room_v2_side_table"]
  ])
})

test("postgres reward claim credits inventory only when ledger insert wins", async () => {
  const fake = createFakePool([
    {
      claimed: true,
      user_id: "user_a",
      coins: 1275,
      owned_avatar_item_ids: ["avatar_v2_top_default"],
      owned_room_item_ids: [],
      updated_at: "2026-07-12T08:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const result = await repository.claimReward({
    userId: "user_a",
    rewardType: "daily_login",
    idempotencyKey: "2026-07-12",
    coins: 25,
    createdAt: "2026-07-12T08:00:00.000Z"
  })

  assert.equal(result.claimed, true)
  assert.equal(result.inventory.coins, 1275)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_economy_reward_ledger/)
  assert.match(fake.calls[0].text, /ON CONFLICT .* DO NOTHING/)
  assert.match(fake.calls[0].text, /coins = coins \+ \$4/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 4), [
    "user_a",
    "daily_login",
    "2026-07-12",
    25
  ])
})

test("postgres purchase uses one conditional balance and ownership update", async () => {
  const fake = createFakePool([
    {
      user_id: "user_a",
      coins: 860,
      owned_avatar_item_ids: [
        "avatar_v2_top_default",
        "avatar_v2_top_blush_lace_cardigan"
      ],
      owned_room_item_ids: [],
      updated_at: "2026-07-13T10:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const inventory = await repository.purchaseItem({
    userId: "user_a",
    type: "avatar",
    itemId: "avatar_v2_top_blush_lace_cardigan",
    grantedItemIds: [],
    priceCoins: 390,
    updatedAt: "2026-07-13T10:00:00.000Z"
  })

  assert.equal(inventory?.coins, 860)
  assert.equal(fake.calls.length, 1)
  assert.match(fake.calls[0].text, /SET coins = coins - \$3/)
  assert.match(fake.calls[0].text, /coins >= \$3/)
  assert.match(fake.calls[0].text, /NOT \(\$2 = ANY\(owned_avatar_item_ids\)\)/)
})

test("postgres starter reconciliation unions ownership without overwriting coins", async () => {
  const fake = createFakePool([
    {
      user_id: "returning_user",
      coins: 777,
      owned_avatar_item_ids: ["avatar_v2_body_male_light"],
      owned_room_item_ids: ["room_v2_chair_blush"],
      updated_at: "2026-07-13T10:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const inventory = await repository.ensureInventory({
    userId: "returning_user",
    starterCoins: 1250,
    requiredAvatarItemIds: ["avatar_v2_body_male_light"],
    requiredRoomItemIds: ["room_v2_chair_blush"],
    updatedAt: "2026-07-13T10:00:00.000Z"
  })

  assert.equal(inventory.coins, 777)
  assert.match(fake.calls[0].text, /ON CONFLICT \(user_id\) DO UPDATE/)
  const conflictUpdate = fake.calls[0].text.split(
    "ON CONFLICT (user_id) DO UPDATE"
  )[1]
  assert.doesNotMatch(conflictUpdate, /coins\s*=/)
  assert.match(conflictUpdate, /owned_avatar_item_ids\s*=/)
  assert.match(conflictUpdate, /owned_room_item_ids\s*=/)
})

test("postgres coin commerce records an immutable event and applies an idempotent ledger entry atomically", async () => {
  const fake = createFakePool([
    {
      applied: true,
      user_id: "user_a",
      coins: 1750,
      coin_debt: 0,
      owned_avatar_item_ids: ["avatar_v2_top_default"],
      owned_room_item_ids: [],
      updated_at: "2026-07-29T12:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const result = await repository.applyCoinTransaction({
    provider: "revenuecat",
    eventId: "event_1",
    transactionId: "transaction_1",
    userId: "user_a",
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind: "credit",
    coins: 500,
    payloadHash: "a".repeat(64),
    occurredAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z"
  })

  assert.equal(result.applied, true)
  assert.equal(result.inventory.coins, 1750)
  assert.equal(result.inventory.coinDebt, 0)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_store_transactions/)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_store_events/)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_economy_iap_ledger/)
  assert.match(
    fake.calls[0].text,
    /ON CONFLICT \(provider, provider_transaction_id, entry_type\) DO NOTHING/
  )
  assert.match(fake.calls[0].text, /coin_debt = CASE/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 5), [
    "revenuecat",
    "transaction_1",
    "user_a",
    "com.blumi.mobile.coins.500",
    "ios"
  ])
})

test("postgres coin commerce reports account and immutable pack metadata conflicts", async () => {
  const fake = createFakePool([
    {
      applied: false,
      conflict: "account",
      user_id: "user_a",
      coins: 1250,
      coin_debt: 0,
      owned_avatar_item_ids: [],
      owned_room_item_ids: [],
      updated_at: "2026-07-29T12:00:00.000Z"
    }
  ])
  const repository = createPostgresEconomyRepository(fake.pool)

  const result = await repository.applyCoinTransaction({
    provider: "revenuecat",
    eventId: "event_conflict_1",
    transactionId: "transaction_conflict_1",
    userId: "user_a",
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind: "credit",
    coins: 500,
    payloadHash: "b".repeat(64),
    occurredAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z"
  })

  assert.deepEqual(result.conflict, "account")
  assert.match(fake.calls[0].text, /user_id <> \$3/)
  assert.match(fake.calls[0].text, /product_id <> \$4 OR store <> \$5/)

  const metadataFake = createFakePool([
    {
      applied: false,
      conflict: "transaction",
      user_id: "user_a",
      coins: 1250,
      coin_debt: 0,
      owned_avatar_item_ids: [],
      owned_room_item_ids: [],
      updated_at: "2026-07-29T12:00:00.000Z"
    }
  ])
  const metadataResult = await createPostgresEconomyRepository(
    metadataFake.pool
  ).applyCoinTransaction({
    provider: "revenuecat",
    eventId: "event_conflict_2",
    transactionId: "transaction_conflict_1",
    userId: "user_a",
    productId: "com.blumi.mobile.coins.1500",
    store: "android",
    kind: "credit",
    coins: 1500,
    payloadHash: "c".repeat(64),
    occurredAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z"
  })

  assert.equal(metadataResult.conflict, "transaction")
})
