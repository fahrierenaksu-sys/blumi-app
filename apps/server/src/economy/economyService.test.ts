import assert from "node:assert/strict"
import test from "node:test"
import {
  createInMemoryEconomyRepository,
  createDefaultEconomyInventory
} from "./economyRepository"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  TEST_AVATAR_ITEM_RULES as avatarRules,
  isRetiredAvatarItemId
} from "@blumi/domain"
import { ECONOMY_REWARD_COINS, MUTUAL_MATCH_REWARDS_PER_WEEK, createEconomyService } from "./economyService"
import {
  TEST_AVATAR_BOY_BODY_ID,
  TEST_AVATAR_DRESS_BOTTOM_ID,
  TEST_AVATAR_DRESS_ID,
  TEST_AVATAR_GIRL_BODY_ID,
  TEST_AVATAR_PAID_ITEM_ID,
  TEST_AVATAR_PAID_ITEM_PRICE,
  TEST_ECONOMY_CATALOG as avatarCatalog,
  TEST_ROOM_ECONOMY_CATALOG as catalog,
  TEST_ROOM_PAID_ITEM_ID,
  TEST_ROOM_PAID_ITEM_PRICE,
  TEST_ROOM_STARTER_ITEM_ID,
  TEST_ROOM_DEFAULT_OWNED_IDS
} from "./testRoomCatalog"

const DAILY = ECONOMY_REWARD_COINS.daily_login
const ROOM = ECONOMY_REWARD_COINS.room_complete
const MATCH = ECONOMY_REWARD_COINS.mutual_match

test("reward amounts are positive whole coins and the shared room pays at least the daily reward", () => {
  for (const [rewardType, coins] of Object.entries(ECONOMY_REWARD_COINS)) {
    assert.ok(Number.isInteger(coins) && coins > 0, `${rewardType} pays ${coins}`)
  }
  assert.ok(ROOM >= DAILY, "the north-star action (time together in a room) never pays less than opening the app")
})

test("complete inventory reads stay authoritative without reconciliation writes", async () => {
  const backing = createInMemoryEconomyRepository()
  const original = {
    ...createDefaultEconomyInventory("complete_user"),
    ownedRoomItemIds: [...TEST_ROOM_DEFAULT_OWNED_IDS]
  }
  await backing.saveInventory(original)
  let reads = 0
  let repairs = 0
  const service = createEconomyService({ catalog, repository: {
    ...backing,
    async getInventory(userId) {
      reads += 1
      return backing.getInventory(userId)
    },
    async ensureInventory(input) {
      repairs += 1
      return backing.ensureInventory(input)
    }
  } })

  assert.deepEqual(await service.getInventory(original.userId), original)
  const updated = { ...original, coins: 700, coinDebt: 25 }
  await backing.saveInventory(updated)
  assert.deepEqual(await service.getInventory(original.userId), updated)
  assert.equal(reads, 2)
  assert.equal(repairs, 0)
})

test("missing starter ownership is repaired once without replacing balances", async () => {
  const backing = createInMemoryEconomyRepository()
  const inventory = {
    ...createDefaultEconomyInventory("repair_user"),
    coins: 700,
    coinDebt: 25,
    ownedRoomItemIds: []
  }
  await backing.saveInventory(inventory)
  let repairs = 0
  const service = createEconomyService({ catalog, repository: {
    ...backing,
    async ensureInventory(input) {
      repairs += 1
      return backing.ensureInventory(input)
    }
  } })

  const repaired = await service.getInventory(inventory.userId)
  assert.equal(repaired.coins, 700)
  assert.equal(repaired.coinDebt, 25)
  assert.deepEqual(repaired.ownedRoomItemIds, [...TEST_ROOM_DEFAULT_OWNED_IDS])
  assert.deepEqual(await service.getInventory(inventory.userId), repaired)
  assert.equal(repairs, 1)
})

test("economy creates a starter inventory once per user", async () => {
  const service = createEconomyService({
    catalog,
    repository: createInMemoryEconomyRepository()
  })

  const first = await service.getInventory(
    "user_a",
    new Date("2026-06-26T12:00:00.000Z")
  )
  const second = await service.getInventory(
    "user_a",
    new Date("2026-06-26T13:00:00.000Z")
  )

  assert.equal(first.coins, 1250)
  assert.deepEqual(second, first)
  // plan X15: every piece of both 2.5D starter looks is granted; the old free defaults are retired and not granted
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const id of [starter.bodyId, starter.faceId, starter.eyesId, starter.noseId, starter.mouthId,
      starter.hairId, starter.topId, starter.bottomId, starter.shoesId]) {
      assert.ok(first.ownedAvatarItemIds.includes(id), id)
    }
  }
  for (const retiredDefault of ["avatar_v2_top_default", "avatar_v2_hair_mocha_ribbon_blowout", "avatar_v2_shoes_milk_tea_court_sneakers"]) {
    assert.equal(first.ownedAvatarItemIds.includes(retiredDefault), false, retiredDefault)
  }
  assert.deepEqual(first.ownedRoomItemIds, [...TEST_ROOM_DEFAULT_OWNED_IDS])
})

test("an active mobile shop garment can be purchased at the server price", async () => {
  const service = createEconomyService({ catalog: avatarCatalog, avatarRules })

  const result = await service.purchaseItem(
    "user_a",
    {
      type: "avatar",
      itemId: TEST_AVATAR_PAID_ITEM_ID,
      avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
    },
    new Date("2026-06-26T12:00:00.000Z")
  )

  assert.equal(result.priceCoins, TEST_AVATAR_PAID_ITEM_PRICE)
  assert.equal(result.inventory.coins, 840)
  assert.ok(
    result.inventory.ownedAvatarItemIds.includes(
      TEST_AVATAR_PAID_ITEM_ID
    )
  )
})

test("avatar purchases reject wearables that do not fit the active body", async () => {
  const service = createEconomyService({ catalog: avatarCatalog, avatarRules })

  await assert.rejects(
    () => service.purchaseItem("male_user", {
      type: "avatar",
      itemId: TEST_AVATAR_PAID_ITEM_ID,
      avatarBodyId: TEST_AVATAR_BOY_BODY_ID
    }),
    /does not fit your avatar/i
  )
})

test("existing inventories gain current free starter items and legacy replacements", async () => {
  const repository = createInMemoryEconomyRepository()
  await repository.saveInventory({
    userId: "returning_user",
    coins: 777,
    coinDebt: 0,
    ownedAvatarItemIds: ["avatar_v2_top_lilac_offshoulder_bow_blouse"],
    ownedRoomItemIds: ["room_v2_cozy_bed"],
    updatedAt: "2026-06-01T00:00:00.000Z"
  })
  const service = createEconomyService({ catalog, repository })

  const inventory = await service.getInventory(
    "returning_user",
    new Date("2026-07-13T10:00:00.000Z")
  )

  assert.equal(inventory.coins, 777)
  assert.ok(
    inventory.ownedAvatarItemIds.includes(
      "avatar_v2_top_lilac_offshoulder_bow_blouse"
    )
  )
  assert.ok(
    inventory.ownedAvatarItemIds.includes(
      "avatar_v2_top_powder_blue_ribbon_corset_top"
    )
  )
  // the 2.5D starters of both bodies are granted (plan X15); the old free defaults are retired and not granted
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const id of [starter.bodyId, starter.faceId, starter.hairId, starter.topId, starter.bottomId, starter.shoesId]) {
      assert.ok(inventory.ownedAvatarItemIds.includes(id), id)
    }
  }
  assert.equal(inventory.ownedAvatarItemIds.includes("avatar_v2_face_warm_peach_foundation"), false)
  // the retired old bed stays in the row but is read past; the current free starter is granted
  assert.deepEqual(inventory.ownedRoomItemIds, [...TEST_ROOM_DEFAULT_OWNED_IDS])
  assert.ok((await repository.getInventory("returning_user"))?.ownedRoomItemIds.includes("room_v2_cozy_bed"))
})

test("purchasing a dress grants its hidden paired bottom", async () => {
  const service = createEconomyService({ catalog: avatarCatalog, avatarRules })

  const result = await service.purchaseItem("dress_user", {
    type: "avatar",
    itemId: TEST_AVATAR_DRESS_ID,
    avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
  })

  assert.ok(
    result.inventory.ownedAvatarItemIds.includes(
      TEST_AVATAR_DRESS_BOTTOM_ID
    )
  )
})

test("two service instances cannot both purchase the same item", async () => {
  const repository = createInMemoryEconomyRepository()
  const firstService = createEconomyService({ catalog: avatarCatalog, avatarRules, repository })
  const secondService = createEconomyService({ catalog: avatarCatalog, avatarRules, repository })

  const attempts = await Promise.allSettled([
    firstService.purchaseItem("shared_user", {
      type: "avatar",
      itemId: TEST_AVATAR_PAID_ITEM_ID,
      avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
    }),
    secondService.purchaseItem("shared_user", {
      type: "avatar",
      itemId: TEST_AVATAR_PAID_ITEM_ID,
      avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
    })
  ])
  const inventory = await firstService.getInventory("shared_user")

  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1
  )
  assert.equal(
    attempts.filter((attempt) => attempt.status === "rejected").length,
    1
  )
  assert.equal(inventory.coins, 840)
  assert.equal(
    inventory.ownedAvatarItemIds.filter(
      (itemId) => itemId === TEST_AVATAR_PAID_ITEM_ID
    ).length,
    1
  )
})

test("starter reconciliation preserves a concurrent reward", async () => {
  const repository = createInMemoryEconomyRepository()
  await repository.saveInventory({
    userId: "reward_user",
    coins: 1250,
    coinDebt: 0,
    ownedAvatarItemIds: [],
    ownedRoomItemIds: [],
    updatedAt: "2026-07-12T00:00:00.000Z"
  })
  const firstService = createEconomyService({ catalog, repository })
  const secondService = createEconomyService({ catalog, repository })

  await Promise.all([
    firstService.getInventory("reward_user"),
    secondService.claimDailyReward(
      "reward_user",
      new Date("2026-07-13T10:00:00.000Z")
    )
  ])
  const inventory = await firstService.getInventory("reward_user")

  assert.equal(inventory.coins, 1250 + DAILY)
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_body_default"))
  assert.ok(inventory.ownedRoomItemIds.includes(TEST_ROOM_STARTER_ITEM_ID))
})

test("room purchases deduct coins and add room ownership", async () => {
  const service = createEconomyService({ catalog })

  const result = await service.purchaseItem("user_a", {
    type: "room",
    itemId: TEST_ROOM_PAID_ITEM_ID
  })

  assert.equal(result.priceCoins, TEST_ROOM_PAID_ITEM_PRICE)
  assert.equal(result.inventory.coins, 1250 - TEST_ROOM_PAID_ITEM_PRICE)
  assert.ok(result.inventory.ownedRoomItemIds.includes(TEST_ROOM_PAID_ITEM_ID))
})

test("unpromoted Universal Core room products are unavailable to direct server purchases", async () => {
  const service = createEconomyService()

  await assert.rejects(
    () => service.purchaseItem("user_a", {
      type: "room",
      itemId: "universal_cloud_loveseat_a"
    }),
    /not available/i
  )
})

test("invalid, already owned, and unaffordable purchases are rejected", async () => {
  const repository = createInMemoryEconomyRepository()
  const service = createEconomyService({ catalog: avatarCatalog, avatarRules, repository })
  await repository.saveInventory({
    ...createDefaultEconomyInventory("user_a"),
    coins: 100
  })

  await assert.rejects(
    () => service.purchaseItem("user_a", {
      type: "avatar",
      itemId: "",
      avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
    }),
    /Choose a shop item/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: "missing_item",
        avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
      }),
    /not available/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: avatarRules.starters.female.topId,
        avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
      }),
    /already own/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: TEST_AVATAR_PAID_ITEM_ID,
        avatarBodyId: TEST_AVATAR_GIRL_BODY_ID
      }),
    /Not enough coins/
  )
})

test("daily rewards are server-priced and idempotent per UTC day", async () => {
  const service = createEconomyService()
  const first = await service.claimDailyReward(
    "user_a",
    new Date("2026-07-12T08:00:00.000Z")
  )
  const duplicate = await service.claimDailyReward(
    "user_a",
    new Date("2026-07-12T23:59:59.000Z")
  )
  const nextDay = await service.claimDailyReward(
    "user_a",
    new Date("2026-07-13T00:00:00.000Z")
  )

  assert.equal(first.claimed, true)
  assert.equal(first.rewardCoins, DAILY)
  assert.equal(first.inventory.coins, 1250 + DAILY)
  assert.equal(duplicate.claimed, false)
  assert.equal(duplicate.inventory.coins, 1250 + DAILY)
  assert.equal(nextDay.claimed, true)
  assert.equal(nextDay.inventory.coins, 1250 + 2 * DAILY)
})

test("an account collects at most MUTUAL_MATCH_REWARDS_PER_WEEK new-pair match rewards in a rolling week", async () => {
  const service = createEconomyService()
  const start = new Date("2026-07-12T09:00:00.000Z")
  const grantAt = (pair: number, at: Date) => service.grantEventReward("user_main", "mutual_match", `pair:user_main:helper_${pair}`, at)
  for (let pair = 0; pair < MUTUAL_MATCH_REWARDS_PER_WEEK; pair += 1) {
    assert.equal((await grantAt(pair, new Date(start.getTime() + pair * 60_000))).rewardCoins, MATCH)
  }
  const overCap = await grantAt(MUTUAL_MATCH_REWARDS_PER_WEEK, new Date(start.getTime() + 60 * 60_000))
  assert.equal(overCap.rewardCoins, 0, "a new user ID from a re-created helper account cannot keep paying")
  const nextWeek = await grantAt(MUTUAL_MATCH_REWARDS_PER_WEEK + 1, new Date(start.getTime() + 8 * 24 * 60 * 60_000))
  assert.equal(nextWeek.rewardCoins, MATCH)
  assert.equal((await service.getInventory("user_main")).coins, 1250 + (MUTUAL_MATCH_REWARDS_PER_WEEK + 1) * MATCH)
})

test("event rewards use fixed server amounts and stable idempotency keys", async () => {
  const service = createEconomyService()
  const match = await service.grantEventReward(
    "user_a",
    "mutual_match",
    "pair:user_a:user_b",
    new Date("2026-07-12T09:00:00.000Z")
  )
  const duplicate = await service.grantEventReward(
    "user_a",
    "mutual_match",
    "pair:user_a:user_b",
    new Date("2026-07-12T09:01:00.000Z")
  )
  const room = await service.grantEventReward(
    "user_a",
    "room_complete",
    "2026-07-12",
    new Date("2026-07-12T09:02:00.000Z")
  )

  assert.equal(match.rewardCoins, MATCH)
  assert.equal(duplicate.rewardCoins, 0)
  assert.equal(room.rewardCoins, ROOM)
  assert.equal(room.inventory.coins, 1250 + MATCH + ROOM)
})

test("room rewards are capped once per user per UTC day", async () => {
  const service = createEconomyService()
  const firstRoom = await service.grantEventReward(
    "user_a",
    "room_complete",
    "2026-07-12",
    new Date("2026-07-12T09:00:00.000Z")
  )
  const secondRoomSameDay = await service.grantEventReward(
    "user_a",
    "room_complete",
    "2026-07-12",
    new Date("2026-07-12T23:59:59.999Z")
  )
  const firstRoomNextDay = await service.grantEventReward(
    "user_a",
    "room_complete",
    "2026-07-13",
    new Date("2026-07-13T00:00:00.000Z")
  )
  const otherUserSameDay = await service.grantEventReward(
    "user_b",
    "room_complete",
    "2026-07-12",
    new Date("2026-07-12T12:00:00.000Z")
  )

  assert.equal(firstRoom.rewardCoins, ROOM)
  assert.equal(secondRoomSameDay.rewardCoins, 0)
  assert.equal(firstRoomNextDay.rewardCoins, ROOM)
  assert.equal(firstRoomNextDay.inventory.coins, 1250 + 2 * ROOM)
  assert.equal(otherUserSameDay.rewardCoins, ROOM)
})

test("mutual match rewards remain idempotent per unique pair across UTC days", async () => {
  const service = createEconomyService()
  const first = await service.grantEventReward(
    "user_a",
    "mutual_match",
    "pair:user_a:user_b",
    new Date("2026-07-12T09:00:00.000Z")
  )
  const nextDayDuplicate = await service.grantEventReward(
    "user_a",
    "mutual_match",
    "pair:user_a:user_b",
    new Date("2026-07-13T09:00:00.000Z")
  )

  assert.equal(first.rewardCoins, MATCH)
  assert.equal(nextDayDuplicate.rewardCoins, 0)
})

test("room reward keys accept only anchored, non-future UTC dates", async () => {
  const service = createEconomyService()
  const now = new Date("2026-07-14T23:59:59.000Z")

  await assert.rejects(
    service.grantEventReward("user_a", "room_complete", "mini_room_1", now),
    /reward date is invalid/i
  )
  await assert.rejects(
    service.grantEventReward("user_a", "room_complete", "2026-07-15", now),
    /reward date is invalid/i
  )
})

test("receipted home pieces sell at their price; the free starter bed and legacy ids cannot be bought", async () => {
  const service = createEconomyService()
  // receipted (owner-approved) pieces are bought like any other item, one fresh account each
  for (const [itemId, priceCoins] of [
    ["room_v3_sofa_japon_cream", 480],
    ["room_v3_armchair_japon_cream", 300],
    ["room_v2_chair_blush", 250]
  ] as const) {
    const buyer = `buyer_${itemId}`
    await service.purchaseItem(buyer, { type: "room", itemId })
    const bought = await service.getInventory(buyer)
    assert.equal(bought.coins, 1250 - priceCoins, itemId)
    assert.ok(bought.ownedRoomItemIds.includes(itemId), itemId)
  }
  await assert.rejects(
    () => service.purchaseItem("held_user", { type: "room", itemId: "universal_bench_a" }),
    /not available/i,
    "universal_bench_a"
  )
  // the starter bed is every account's own already (F9): there is nothing to buy
  await assert.rejects(() => service.purchaseItem("held_user", { type: "room", itemId: "room_v3_bed_blumi_starter" }))
  const inventory = await service.getInventory("held_user")
  assert.equal(inventory.coins, 1250)
  assert.deepEqual(inventory.ownedRoomItemIds.filter((id) => id.startsWith("room_v3_")), ["room_v3_bed_blumi_starter"])
})

test("retired room ids are refused for purchase and left out of the inventory read without a row write", async () => {
  const repository = createInMemoryEconomyRepository()
  await repository.saveInventory({
    userId: "legacy_user",
    coins: 900,
    coinDebt: 0,
    ownedAvatarItemIds: [],
    ownedRoomItemIds: ["room_v2_table_round", "room_v2_cozy_bed", ...TEST_ROOM_DEFAULT_OWNED_IDS],
    updatedAt: "2026-07-01T00:00:00.000Z"
  })
  const service = createEconomyService({ catalog, repository })
  for (const itemId of ["room_v2_side_table", "room_v2_lamp_heart"]) {
    await assert.rejects(
      () => service.purchaseItem("legacy_user", { type: "room", itemId }),
      /not available/i,
      itemId
    )
  }
  const inventory = await service.getInventory("legacy_user")
  assert.deepEqual(inventory.ownedRoomItemIds, [...TEST_ROOM_DEFAULT_OWNED_IDS])
  assert.equal(inventory.coins, 900)
  assert.deepEqual(
    (await repository.getInventory("legacy_user"))?.ownedRoomItemIds,
    ["room_v2_table_round", "room_v2_cozy_bed", ...TEST_ROOM_DEFAULT_OWNED_IDS]
  )
})

test("a returning account keeps every retired item it owns, gains the 2.5D starters and cannot buy a retired item again", async () => {
  const repository = createInMemoryEconomyRepository()
  const ownedRetired = ["avatar_v2_hair_mocha_ribbon_blowout", "avatar_v2_top_sage_ribbon_knit_jacket", "avatar_v2_shoes_male_cloud_white_trainers"]
  for (const id of ownedRetired) assert.equal(isRetiredAvatarItemId(id), true, id)
  await repository.saveInventory({
    userId: "old_wardrobe_user",
    coins: 300,
    coinDebt: 0,
    ownedAvatarItemIds: [...ownedRetired],
    ownedRoomItemIds: [TEST_ROOM_STARTER_ITEM_ID],
    updatedAt: "2026-06-01T00:00:00.000Z"
  })
  const service = createEconomyService({ catalog, repository })

  const inventory = await service.getInventory("old_wardrobe_user", new Date("2026-10-12T10:00:00.000Z"))
  const stored = await repository.getInventory("old_wardrobe_user")

  for (const id of ownedRetired) {
    assert.ok(inventory.ownedAvatarItemIds.includes(id), `${id} left the inventory read`)
    assert.ok(stored?.ownedAvatarItemIds.includes(id), `${id} left the stored row`)
  }
  for (const id of [DEFAULT_FEMALE_AVATAR_LOADOUT.hairId, DEFAULT_FEMALE_AVATAR_LOADOUT.topId, DEFAULT_FEMALE_AVATAR_LOADOUT.bottomId]) {
    assert.ok(inventory.ownedAvatarItemIds.includes(id), id)
  }
  assert.equal(inventory.coins, 300)
  await assert.rejects(
    service.purchaseItem("old_wardrobe_user", { itemId: "avatar_v2_top_lilac_cloud_wrap_top", type: "avatar", avatarBodyId: "avatar_v2_body_default" }),
    /not available/
  )
  assert.equal((await repository.getInventory("old_wardrobe_user"))?.coins, 300)
})

test("a new account owns exactly the active avatar starters and no retired item", async () => {
  const service = createEconomyService({ catalog, repository: createInMemoryEconomyRepository() })
  const inventory = await service.getInventory("brand_new_user", new Date("2026-10-12T10:00:00.000Z"))
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const id of [starter.bodyId, starter.faceId, starter.eyesId, starter.noseId, starter.mouthId,
      starter.hairId, starter.topId, starter.bottomId, starter.shoesId]) {
      assert.ok(inventory.ownedAvatarItemIds.includes(id), id)
    }
  }
  for (const id of inventory.ownedAvatarItemIds) assert.equal(isRetiredAvatarItemId(id), false, `${id} is retired`)
})
