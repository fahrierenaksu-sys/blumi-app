import assert from "node:assert/strict"
import { createRequire, Module } from "node:module"
import test from "node:test"
import { JSON_REQUEST_TIMEOUT_MS } from "../network/apiClient"
import type { BlumiInventorySnapshot } from "./inventoryModel"

const testRequire = createRequire(__filename)
function stub(id: string, exports: unknown) {
  const path = testRequire.resolve(id)
  const module = new Module(path)
  module.filename = path
  module.loaded = true
  module.exports = exports
  testRequire.cache[path] = module
}

// Exercise the real store and economy transport without a native host or assets.
stub("react", {
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useState: () => [0, () => undefined],
  useEffect: () => undefined
})
stub("@react-native-async-storage/async-storage", {
  setItem: async () => undefined
})
stub("../../config/env", { MOBILE_HTTP_BASE_URL: "https://api.test" })
stub("../avatarV2/avatarV2.mock", {
  AVATAR_V2_CATALOG: [{ id: "paid_top" }, { id: "next_top" }]
})
stub("../roomV2/roomV2.mock", {
  ROOM_V2_FURNITURE_CATALOG: [{ id: "paid_chair" }]
})
const { useInventoryStore } = testRequire("./inventoryStore") as typeof import("./inventoryStore")

function inventory(coins = 1000, ids: string[] = []): BlumiInventorySnapshot {
  return {
    coins, ownedAvatarItemIds: ids, ownedRoomItemIds: [], unlockedFeatureIds: [],
    updatedAt: "2026-09-29T00:00:00.000Z"
  }
}
function response(snapshot: BlumiInventorySnapshot) {
  return new Response(JSON.stringify({ inventory: snapshot }))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test("ambiguous purchase reconciles inside its queue without replay or completion", async (context) => {
  const original = new TypeError("connection lost")
  const reconciliation = deferred<Response>()
  const readStarted = deferred<void>()
  const calls: string[] = []
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.method ?? "GET")
    if (init?.method === "POST") {
      if (calls.filter((call) => call === "POST").length === 1) throw original
      return response(inventory(600, ["paid_top", "next_top"]))
    }
    readStarted.resolve()
    return reconciliation.promise
  })
  const store = useInventoryStore("reconcile-success", true)
  let busy = true
  const first = store.purchaseAvatarItem("token", "paid_top").finally(() => { busy = false })
  const next = store.purchaseAvatarItem("token", "next_top")
  await Promise.race([
    readStarted.promise,
    first.then(() => { assert.fail("purchase settled without starting reconciliation") })
  ])
  assert.equal(busy, true)
  assert.deepEqual(calls, ["POST", "GET"])
  reconciliation.resolve(response(inventory(800, ["paid_top"])))
  const result = await first
  assert.equal(result.success, false)
  assert.equal(result.reason, "server_error")
  assert.equal(result.error, original)
  assert.equal(result.purchaseOutcome, "unknown")
  assert.equal(result.reconciliation?.status, "refreshed")
  assert.equal(busy, false)
  assert.deepEqual(await next, { success: true })
  assert.deepEqual(calls, ["POST", "GET", "POST"])
  assert.equal(useInventoryStore("reconcile-success", true).inventory.coins, 600)
})

test("confirmed already-owned response needs a fresh ownership read before equip", async (context) => {
  let posts = 0
  let reads = 0
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts += 1
      return new Response(JSON.stringify({ error: "You already own this item." }), { status: 400 })
    }
    reads += 1
    return response(inventory(1000, reads === 1 ? ["paid_top"] : []))
  })
  const store = useInventoryStore("confirmed-owned", true)
  const owned = await store.purchaseAvatarItem("token", "paid_top")
  assert.equal(owned.success, false)
  assert.equal(owned.reason, "already_owned")
  assert.equal(owned.purchaseOutcome, undefined)
  assert.equal(owned.reconciliation?.status, "refreshed")
  assert.equal(store.ownsAvatarItem("paid_top"), true)

  const absent = await store.purchaseAvatarItem("token", "paid_top")
  assert.equal(absent.success, false)
  assert.equal(absent.reason, "server_error")
  assert.equal(store.ownsAvatarItem("paid_top"), false)
  assert.equal(posts, 2)
  assert.equal(reads, 2)
})

test("confirmed insufficient-coins rejection keeps its reason after authoritative read", async (context) => {
  let posts = 0
  let reads = 0
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts += 1
      return new Response(JSON.stringify({ error: "Not enough coins." }), { status: 400 })
    }
    reads += 1
    return response(inventory(50))
  })
  const result = await useInventoryStore("confirmed-insufficient", true)
    .purchaseAvatarItem("token", "paid_top")
  assert.equal(result.success, false)
  assert.equal(result.reason, "not_enough_coins")
  assert.equal(result.purchaseOutcome, undefined)
  assert.equal(result.reconciliation?.status, "refreshed")
  assert.equal(posts, 1)
  assert.equal(reads, 1)
})

test("failed reconciliation revokes stale paid authority, preserves both errors, and releases queue", async (context) => {
  const original = new Error("response body failed")
  const readError = new Error("read offline")
  let reads = 0
  let posts = 0
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts += 1
      if (posts === 1) throw original
      return response(inventory(700, ["next_top"]))
    }
    reads += 1
    if (reads === 1) return response(inventory(1000, ["paid_top"]))
    throw readError
  })
  const store = useInventoryStore("reconcile-failure", true)
  await store.hydrateFromServer("token")
  assert.equal(store.ownsAvatarItem("paid_top"), true)
  const result = await store.purchaseAvatarItem("token", "next_top")
  assert.equal(result.success, false)
  assert.equal(result.error, original)
  assert.equal(result.reconciliation?.status, "failed")
  assert.equal(result.reconciliation?.error, readError)
  const failed = useInventoryStore("reconcile-failure", true)
  assert.equal(failed.isReady, false)
  assert.equal(failed.hydrationStatus, "failed")
  assert.equal(store.ownsAvatarItem("paid_top"), false)
  assert.deepEqual(await store.purchaseAvatarItem("token", "next_top"), { success: true })
  assert.equal(useInventoryStore("reconcile-failure", true).inventory.coins, 700)
  assert.equal(posts, 2)
})

for (const stage of ["transport", "body"] as const) {
  test(`purchase ${stage} timeout remains unknown when read has no item; next operation progresses`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    const stalled = deferred<Response>()
    const body = deferred<unknown>()
    const started = deferred<void>()
    let posts = 0
    let reads = 0
    context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1
        if (posts > 1) return response(inventory(900, ["next_top"]))
        if (stage === "transport") { started.resolve(); return stalled.promise }
        return { ok: true, status: 200, json: () => { started.resolve(); return body.promise } } as Response
      }
      reads += 1
      return response(inventory())
    })
    const store = useInventoryStore(`unresolved-${stage}`, true)
    const pending = store.purchaseAvatarItem("token", "paid_top")
    await started.promise
    context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
    const result = await pending
    assert.equal(result.success, false)
    assert.equal(result.reason, "server_error")
    assert.equal((result.error as Error).name, "TimeoutError")
    assert.equal(result.purchaseOutcome, "unknown")
    assert.equal(result.reconciliation?.status, "refreshed")
    assert.equal(store.ownsAvatarItem("paid_top"), false)
    assert.equal(useInventoryStore(`unresolved-${stage}`, true).inventory.coins, 1000)
    // A late successful response is not a new authoritative store write.
    stalled.resolve(response(inventory(800, ["paid_top"])))
    body.resolve({ inventory: inventory(800, ["paid_top"]) })
    await Promise.resolve()
    assert.equal(store.ownsAvatarItem("paid_top"), false)
    assert.deepEqual(await store.purchaseAvatarItem("token", "next_top"), { success: true })
    assert.equal(posts, 2)
    assert.equal(reads, 1)
  })
}

test("old and concurrent hydration cannot restore authority after failed reconciliation", async (context) => {
  const oldRead = deferred<Response>()
  const recoveryRead = deferred<Response>()
  const concurrentRead = deferred<Response>()
  const oldStarted = deferred<void>()
  const recoveryStarted = deferred<void>()
  const concurrentStarted = deferred<void>()
  let reads = 0
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("offline")
    reads += 1
    if (reads === 1) { oldStarted.resolve(); return oldRead.promise }
    if (reads === 2) { recoveryStarted.resolve(); return recoveryRead.promise }
    concurrentStarted.resolve()
    return concurrentRead.promise
  })
  const store = useInventoryStore("hydration-race", true)
  const old = store.hydrateFromServer("token")
  await oldStarted.promise
  const purchase = store.purchaseAvatarItem("token", "paid_top")
  await Promise.race([
    recoveryStarted.promise,
    purchase.then(() => { assert.fail("purchase settled without starting reconciliation") })
  ])
  const concurrent = store.hydrateFromServer("token")
  await concurrentStarted.promise
  concurrentRead.resolve(response(inventory(1000, ["paid_top"])))
  assert.equal((await concurrent).success, false)
  recoveryRead.resolve(new Response("not json"))
  assert.equal((await purchase).success, false)
  oldRead.resolve(response(inventory(1000, ["paid_top"])))
  assert.equal((await old).success, false)
  assert.equal(store.ownsAvatarItem("paid_top"), false)
  assert.equal(useInventoryStore("hydration-race", true).isReady, false)
})

for (const stage of ["transport", "body"] as const) {
  test(`reconciliation ${stage} deadline preserves purchase error and unblocks the next mutation`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    const original = new TypeError("purchase connection lost")
    const started = deferred<void>()
    let posts = 0
    context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1
        if (posts === 1) throw original
        return response(inventory(900, ["next_top"]))
      }
      if (stage === "transport") { started.resolve(); return new Promise<Response>(() => {}) }
      return {
        ok: true, status: 200,
        json: () => { started.resolve(); return new Promise<unknown>(() => {}) }
      } as Response
    })
    const store = useInventoryStore(`reconcile-deadline-${stage}`, true)
    const purchase = store.purchaseAvatarItem("token", "paid_top")
    const next = store.purchaseAvatarItem("token", "next_top")
    await started.promise
    assert.equal(posts, 1)
    context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
    const result = await purchase
    assert.equal(result.success, false)
    assert.equal(result.error, original)
    assert.equal(result.reconciliation?.status, "failed")
    if (result.reconciliation?.status === "failed") {
      assert.equal((result.reconciliation.error as Error).name, "TimeoutError")
    }
    assert.deepEqual(await next, { success: true })
    assert.equal(posts, 2)
    assert.equal(store.ownsAvatarItem("paid_top"), false)
  })
}

for (const recovery of ["refreshed", "failed"] as const) {
  for (const stage of ["transport", "body"] as const) {
    test(`daily reward ${stage} timeout with ${recovery} recovery releases queue without replay or local coins`, async (context) => {
      context.mock.timers.enable({ apis: ["setTimeout"] })
      const started = deferred<void>()
      let rewardSignal: AbortSignal | null | undefined
      let rewardCalls = 0
      let reads = 0
      let posts = 0
      context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith("/rewards/daily")) {
          rewardCalls += 1
          rewardSignal = init?.signal
          if (stage === "transport") {
            started.resolve()
            return new Promise<Response>(() => {})
          }
          return {
            ok: true, status: 200,
            json: () => { started.resolve(); return new Promise<unknown>(() => {}) }
          } as Response
        }
        if (init?.method === "POST") {
          posts += 1
          return response(inventory(900, ["next_top"]))
        }
        reads += 1
        if (recovery === "failed") throw new Error("offline")
        return response(inventory(1025))
      })
      const ownerId = `daily-${stage}-${recovery}`
      const store = useInventoryStore(ownerId, true)
      let busy = true
      const reward = store.claimDailyRewardFromServer("token").finally(() => { busy = false })
      const next = store.purchaseAvatarItem("token", "next_top")
      await started.promise
      context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
      assert.equal(rewardSignal?.aborted, true)
      assert.equal(await reward, null)
      assert.equal(busy, false)
      assert.deepEqual(await next, { success: true })
      assert.equal(rewardCalls, 1)
      assert.equal(reads, 1)
      assert.equal(posts, 1)
      assert.equal(useInventoryStore(ownerId, true).inventory.coins, 900)
    })
  }
}

test("confirmed daily reward uses only server inventory and claimed status", async (context) => {
  let calls = 0
  context.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls += 1
    assert.equal(init?.body, undefined)
    return new Response(JSON.stringify({
      inventory: inventory(1025), claimed: calls === 1, rewardCoins: 25, rewardDate: "2026-09-29"
    }))
  })
  const store = useInventoryStore("daily-confirmed", true)
  assert.equal(await store.claimDailyRewardFromServer("token"), 25)
  assert.equal(await store.claimDailyRewardFromServer("token"), 0)
  assert.equal(useInventoryStore("daily-confirmed", true).inventory.coins, 1025)
  assert.equal(calls, 2)
})
