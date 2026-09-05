import assert from "node:assert/strict"
import test from "node:test"
import {
  createInMemoryEconomyRepository,
  createDefaultEconomyInventory
} from "./economyRepository"
import { createEconomyService } from "./economyService"

test("economy creates a starter inventory once per user", async () => {
  const service = createEconomyService({
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
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_top_default"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_body_male_light"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_eyes_mocha_doe"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_face_rose_heart_foundation"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_eyes_chestnut_luminous"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_nose_sculpted_doll"))
  assert.ok(first.ownedAvatarItemIds.includes("avatar_v2_mouth_rosewater_cupid_bow"))
  assert.ok(
    first.ownedAvatarItemIds.includes(
      "avatar_v2_hair_mocha_ribbon_blowout"
    )
  )
  assert.ok(
    first.ownedAvatarItemIds.includes(
      "avatar_v2_shoes_milk_tea_court_sneakers"
    )
  )
  assert.deepEqual(first.ownedRoomItemIds, ["room_v2_cozy_bed"])
})

test("the mobile shop hero item can be purchased at the server price", async () => {
  const service = createEconomyService()

  const result = await service.purchaseItem(
    "user_a",
    {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      avatarBodyId: "avatar_v2_body_default"
    },
    new Date("2026-06-26T12:00:00.000Z")
  )

  assert.equal(result.priceCoins, 390)
  assert.equal(result.inventory.coins, 860)
  assert.ok(
    result.inventory.ownedAvatarItemIds.includes(
      "avatar_v2_top_blush_lace_cardigan"
    )
  )
})

test("avatar purchases reject wearables that do not fit the active body", async () => {
  const service = createEconomyService()

  await assert.rejects(
    () => service.purchaseItem("male_user", {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      avatarBodyId: "avatar_v2_body_male_light"
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
  const service = createEconomyService({ repository })

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
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_body_male_light"))
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_face_warm_peach_foundation"))
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_eyes_sage_glass"))
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_nose_petal_curve"))
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_mouth_rose_gloss_smile"))
  assert.ok(
    inventory.ownedAvatarItemIds.includes(
      "avatar_v2_top_male_powder_blue_crew_tee"
    )
  )
  assert.ok(
    inventory.ownedAvatarItemIds.includes(
      "avatar_v2_bottom_male_navy_straight_pants"
    )
  )
  assert.ok(inventory.ownedRoomItemIds.includes("room_v2_cozy_bed"))
  assert.deepEqual(inventory.ownedRoomItemIds, ["room_v2_cozy_bed"])
})

test("purchasing a dress grants its hidden paired bottom", async () => {
  const service = createEconomyService()

  const result = await service.purchaseItem("dress_user", {
    type: "avatar",
    itemId: "avatar_v2_top_boho_patchwork_maxi_dress",
    avatarBodyId: "avatar_v2_body_default"
  })

  assert.ok(
    result.inventory.ownedAvatarItemIds.includes(
      "avatar_v2_bottom_boho_patchwork_maxi_dress"
    )
  )
})

test("two service instances cannot both purchase the same item", async () => {
  const repository = createInMemoryEconomyRepository()
  const firstService = createEconomyService({ repository })
  const secondService = createEconomyService({ repository })

  const attempts = await Promise.allSettled([
    firstService.purchaseItem("shared_user", {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      avatarBodyId: "avatar_v2_body_default"
    }),
    secondService.purchaseItem("shared_user", {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      avatarBodyId: "avatar_v2_body_default"
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
  assert.equal(inventory.coins, 860)
  assert.equal(
    inventory.ownedAvatarItemIds.filter(
      (itemId) => itemId === "avatar_v2_top_blush_lace_cardigan"
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
  const firstService = createEconomyService({ repository })
  const secondService = createEconomyService({ repository })

  await Promise.all([
    firstService.getInventory("reward_user"),
    secondService.claimDailyReward(
      "reward_user",
      new Date("2026-07-13T10:00:00.000Z")
    )
  ])
  const inventory = await firstService.getInventory("reward_user")

  assert.equal(inventory.coins, 1275)
  assert.ok(inventory.ownedAvatarItemIds.includes("avatar_v2_body_default"))
  assert.ok(inventory.ownedRoomItemIds.includes("room_v2_cozy_bed"))
})

test("room purchases deduct coins and add room ownership", async () => {
  const service = createEconomyService()

  const result = await service.purchaseItem("user_a", {
    type: "room",
    itemId: "room_v2_side_table"
  })

  assert.equal(result.priceCoins, 240)
  assert.equal(result.inventory.coins, 1010)
  assert.ok(result.inventory.ownedRoomItemIds.includes("room_v2_side_table"))
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
  const service = createEconomyService({ repository })
  await repository.saveInventory({
    ...createDefaultEconomyInventory("user_a"),
    coins: 100
  })

  await assert.rejects(
    () => service.purchaseItem("user_a", {
      type: "avatar",
      itemId: "",
      avatarBodyId: "avatar_v2_body_default"
    }),
    /Choose a shop item/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: "missing_item",
        avatarBodyId: "avatar_v2_body_default"
      }),
    /not available/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: "avatar_v2_top_default",
        avatarBodyId: "avatar_v2_body_default"
      }),
    /already own/
  )
  await assert.rejects(
    () =>
      service.purchaseItem("user_a", {
        type: "avatar",
        itemId: "avatar_v2_top_blush_lace_cardigan",
        avatarBodyId: "avatar_v2_body_default"
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
  assert.equal(first.rewardCoins, 25)
  assert.equal(first.inventory.coins, 1275)
  assert.equal(duplicate.claimed, false)
  assert.equal(duplicate.inventory.coins, 1275)
  assert.equal(nextDay.claimed, true)
  assert.equal(nextDay.inventory.coins, 1300)
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

  assert.equal(match.rewardCoins, 50)
  assert.equal(duplicate.rewardCoins, 0)
  assert.equal(room.rewardCoins, 25)
  assert.equal(room.inventory.coins, 1325)
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

  assert.equal(firstRoom.rewardCoins, 25)
  assert.equal(secondRoomSameDay.rewardCoins, 0)
  assert.equal(firstRoomNextDay.rewardCoins, 25)
  assert.equal(firstRoomNextDay.inventory.coins, 1300)
  assert.equal(otherUserSameDay.rewardCoins, 25)
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

  assert.equal(first.rewardCoins, 50)
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
