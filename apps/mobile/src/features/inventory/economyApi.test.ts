import assert from "node:assert/strict"
import test from "node:test"
import { JSON_REQUEST_TIMEOUT_MS } from "../network/apiClient"
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
  assert.equal(calls[0]?.init?.method, "POST")
  assert.deepEqual(calls[0]?.init?.headers, {
    authorization: "Bearer session_token",
    "content-type": "application/json"
  })
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

const boundedRequests = [
  {
    name: "daily reward POST",
    run: (fetcher: typeof fetch, signal?: AbortSignal) =>
      claimDailyEconomyReward("https://api.test", "session_token", fetcher, signal)
  },
  {
    name: "inventory GET",
    run: (fetcher: typeof fetch, signal?: AbortSignal) =>
      fetchEconomyInventory("https://api.test", "session_token", fetcher, signal)
  },
  {
    name: "purchase POST",
    run: (fetcher: typeof fetch, signal?: AbortSignal) =>
      purchaseEconomyItem(
        "https://api.test", "session_token",
        { type: "avatar", itemId: "test_item" }, fetcher, signal
      )
  }
]

for (const operation of boundedRequests) {
  test(`${operation.name} times out a stalled transport without retry`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    let calls = 0
    let transportSignal: AbortSignal | null | undefined
    const request = operation.run(async (_url, init) => {
      calls += 1
      transportSignal = init?.signal
      return new Promise<Response>(() => {})
    })
    const rejected = assert.rejects(request, { name: "TimeoutError" })
    context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
    assert.equal(transportSignal?.aborted, true)
    await rejected
    assert.equal(calls, 1)
  })

  test(`${operation.name} times out a stalled body without retry`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    let calls = 0
    let transportSignal: AbortSignal | null | undefined
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const request = operation.run(async (_url, init) => {
      calls += 1
      transportSignal = init?.signal
      return {
        ok: true,
        status: 200,
        json: () => { entered(); return new Promise<unknown>(() => {}) }
      } as Response
    })
    const rejected = assert.rejects(request, { name: "TimeoutError" })
    await started
    context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
    assert.equal(transportSignal?.aborted, true)
    await rejected
    assert.equal(calls, 1)
  })

  test(`${operation.name} forwards cancellation and skips pre-aborted requests`, async () => {
    const controller = new AbortController()
    let calls = 0
    let transportSignal: AbortSignal | null | undefined
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const request = operation.run(async (_url, init) => {
      calls += 1
      transportSignal = init?.signal
      return {
        ok: true,
        status: 200,
        json: () => { entered(); return new Promise<unknown>(() => {}) }
      } as Response
    }, controller.signal)
    const rejected = assert.rejects(request, { name: "AbortError" })
    await started
    controller.abort()
    await rejected
    assert.equal(transportSignal?.aborted, true)
    await assert.rejects(operation.run(async () => {
      calls += 1
      assert.fail("pre-aborted request fetched")
    }, controller.signal), { name: "AbortError" })
    assert.equal(calls, 1)
  })

  test(`${operation.name} rejects network failure without retry`, async () => {
    let calls = 0
    const error = new Error("offline")
    await assert.rejects(operation.run(async () => {
      calls += 1
      throw error
    }), (actual) => actual === error)
    assert.equal(calls, 1)
  })

  test(`${operation.name} preserves server errors and rejects invalid success payloads`, async () => {
    await assert.rejects(operation.run(async () => createJsonResponse(403, {
      error: "Access denied."
    })), /Access denied\./)
    await assert.rejects(operation.run(async () => createJsonResponse(200, {
      inventory: { coins: 4 }, claimed: false, rewardCoins: 0, rewardDate: "2026-09-29"
    })), /Blumi could not read your shop inventory\./)
    await assert.rejects(operation.run(async () => new Response("not json", {
      status: 200
    })), { name: "SyntaxError" })
    const bodyError = new Error("body read failed")
    await assert.rejects(operation.run(async () => ({
      ok: false,
      status: 500,
      json: async (): Promise<unknown> => { throw bodyError }
    } as Response)), (actual) => actual === bodyError)
  })
}
