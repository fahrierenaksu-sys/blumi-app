import assert from "node:assert/strict"
import test from "node:test"
import {
  fetchEconomyInventory,
  claimDailyEconomyReward,
  normalizeEconomyInventoryPayload,
  purchaseEconomyItem
} from "./economyApi"

test("claimDailyEconomyReward sends no client-controlled reward data", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return createJsonResponse(200, {
      claimed: true,
      rewardCoins: 25,
      rewardDate: "2026-07-12",
      inventory: {
        coins: 1275,
        ownedAvatarItemIds: [],
        ownedRoomItemIds: [],
        updatedAt: "2026-07-12T00:00:00.000Z"
      }
    })
  }

  const result = await claimDailyEconomyReward(
    "http://localhost:4000",
    "session_token",
    fetcher as typeof fetch
  )

  assert.equal(calls[0]?.url, "http://localhost:4000/v1/economy/rewards/daily")
  assert.equal(calls[0]?.init?.method, "POST")
  assert.equal(calls[0]?.init?.body, undefined)
  assert.equal(result.claimed, true)
  assert.equal(result.rewardCoins, 25)
  assert.equal(result.inventory.coins, 1275)
})

test("fetchEconomyInventory reads server inventory with auth", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return createJsonResponse(200, {
      inventory: {
        coins: 910,
        ownedAvatarItemIds: ["avatar_v2_top_default"],
        ownedRoomItemIds: ["room_v2_chair_blush"],
        updatedAt: "2026-06-26T00:00:00.000Z"
      }
    })
  }

  const inventory = await fetchEconomyInventory(
    "http://localhost:4000/",
    "session_token",
    fetcher as typeof fetch
  )

  assert.equal(calls[0]?.url, "http://localhost:4000/v1/economy/balance")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.equal(inventory.coins, 910)
  assert.deepEqual(inventory.ownedAvatarItemIds, ["avatar_v2_top_default"])
  assert.deepEqual(inventory.ownedRoomItemIds, ["room_v2_chair_blush"])
  assert.deepEqual(inventory.unlockedFeatureIds, [])
})

test("purchaseEconomyItem sends only server-priced purchase input", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return createJsonResponse(201, {
      inventory: {
        coins: 890,
        ownedAvatarItemIds: [
          "avatar_v2_top_default",
          "avatar_v2_top_cherry_heart_milkmaid_blouse"
        ],
        ownedRoomItemIds: [],
        updatedAt: "2026-06-26T00:00:00.000Z"
      },
      priceCoins: 360
    })
  }

  const inventory = await purchaseEconomyItem(
    "http://localhost:4000",
    "session_token",
    {
      type: "avatar",
      itemId: "avatar_v2_top_cherry_heart_milkmaid_blouse"
    },
    fetcher as typeof fetch
  )

  assert.equal(calls[0]?.url, "http://localhost:4000/v1/economy/purchase")
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({
      type: "avatar",
      itemId: "avatar_v2_top_cherry_heart_milkmaid_blouse"
    })
  )
  assert.equal(inventory.coins, 890)
  assert.ok(
    inventory.ownedAvatarItemIds.includes("avatar_v2_top_cherry_heart_milkmaid_blouse")
  )
})

test("economy API surfaces server errors and rejects malformed inventory", async () => {
  await assert.rejects(
    () =>
      purchaseEconomyItem(
        "http://localhost:4000",
        "session_token",
        { type: "avatar", itemId: "already_owned" },
        (async () => createJsonResponse(400, { error: "You already own this item." })) as typeof fetch
      ),
    /already own/
  )

  assert.throws(
    () => normalizeEconomyInventoryPayload({ inventory: { coins: 4 } }),
    /could not read/
  )
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
