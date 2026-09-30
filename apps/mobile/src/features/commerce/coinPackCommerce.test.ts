import assert from "node:assert/strict"
import test from "node:test"
import {
  COIN_PACKS,
  createRevenueCatCoinPackClient,
  type RevenueCatNativeBridge
} from "./revenueCatCoinPackClient"
import {
  reconcileCoinPackPurchase,
  runCoinPackPurchase,
  type CoinPackReconcileClient
} from "./coinPackPurchaseCoordinator"
import { registerBoundedRequestTests } from "../network/boundedRequestContract"

registerBoundedRequestTests([
  {
    name: "coin pack reconcile POST",
    run: (fetcher) => reconcileCoinPackPurchase({
      baseHttpUrl: "https://api.blumi.test",
      sessionToken: "token",
      transactionId: "tx_1",
      fetcher
    })
  }
])

test("reconcile keeps its base URL guard and forwards caller cancellation", async () => {
  let calls = 0
  await assert.rejects(reconcileCoinPackPurchase({
    baseHttpUrl: "  /// ",
    sessionToken: "token",
    transactionId: "tx_1",
    fetcher: async () => { calls += 1; return new Response("{}") }
  }), /commerce API URL is required/)
  assert.equal(calls, 0)

  const controller = new AbortController()
  let transportSignal: AbortSignal | null | undefined
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = reconcileCoinPackPurchase({
    baseHttpUrl: "https://api.blumi.test/",
    sessionToken: "token",
    transactionId: "tx_1",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://api.blumi.test/v1/commerce/coin-packs/reconcile")
      transportSignal = init?.signal
      entered()
      return new Promise<Response>(() => {})
    },
    signal: controller.signal
  })
  const rejected = assert.rejects(request, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
})

test("a reconcile timeout keeps the purchase pending instead of failing it", async () => {
  const timeout = new Error("This is taking too long.")
  timeout.name = "TimeoutError"
  const result = await runCoinPackPurchase({
    client: {
      syncAuthenticatedUser: async () => {},
      purchaseCoinPack: async () => ({
        status: "purchased",
        transaction: { transactionId: "tx_1" }
      })
    } as unknown as Parameters<typeof runCoinPackPurchase>[0]["client"],
    reconcileClient: { reconcile: async () => { throw timeout } },
    sessionToken: "token",
    userId: "user-1",
    packId: COIN_PACKS[0].id,
    isConnected: true,
    refreshWallet: async () => { assert.fail("timeout must not refresh as credited") }
  })
  assert.deepEqual(result, { status: "pending", transactionId: "tx_1" })
})

test("R1 exposes only the three consumable coin packs", () => {
  assert.deepEqual(
    COIN_PACKS.map((pack) => ({
      id: pack.id,
      coins: pack.coins,
      type: pack.type
    })),
    [
      { id: "com.blumi.mobile.coins.500", coins: 500, type: "consumable" },
      { id: "com.blumi.mobile.coins.1500", coins: 1500, type: "consumable" },
      { id: "com.blumi.mobile.coins.4000", coins: 4000, type: "consumable" }
    ]
  )
})

test("RevenueCat client identifies the authenticated user and logs out on session clear", async () => {
  const calls: string[] = []
  const bridge: RevenueCatNativeBridge = {
    configure: async ({ apiKey }) => {
      calls.push(`configure:${apiKey}`)
    },
    logIn: async (userId) => {
      calls.push(`login:${userId}`)
    },
    logOut: async () => {
      calls.push("logout")
    },
    getProducts: async () => [],
    purchaseProduct: async () => ({
      status: "cancelled"
    })
  }
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge
  })

  await client.syncAuthenticatedUser("user-1")
  await client.syncAuthenticatedUser("user-1")
  await client.syncAuthenticatedUser(undefined)

  assert.deepEqual(calls, ["configure:rc_test_key", "login:user-1", "logout"])
})

test("missing RevenueCat config or native bridge fails closed", async () => {
  const client = createRevenueCatCoinPackClient({ apiKey: undefined })

  await assert.rejects(
    client.purchaseCoinPack("com.blumi.mobile.coins.500"),
    /not available/i
  )
})

test("logout requested during RevenueCat login blocks purchasing and eventually clears identity", async () => {
  let finishLogin!: () => void
  let loginStarted!: () => void
  const started = new Promise<void>((resolve) => { loginStarted = resolve })
  const pendingLogin = new Promise<void>((resolve) => { finishLogin = resolve })
  const calls: string[] = []
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => undefined,
      logIn: async () => { calls.push("login"); loginStarted(); await pendingLogin },
      logOut: async () => { calls.push("logout") },
      getProducts: async () => [],
      purchaseProduct: async () => { calls.push("purchase"); return { status: "cancelled" } }
    }
  })
  const login = client.syncAuthenticatedUser("user-1")
  await started
  const logout = client.syncAuthenticatedUser(undefined)
  finishLogin()
  await Promise.all([login, logout])
  await assert.rejects(client.purchaseCoinPack("com.blumi.mobile.coins.500"), /sign in/i)
  assert.deepEqual(calls, ["login", "logout"])
})

test("RevenueCat account transitions serialize SDK identity and reject purchases while pending", async () => {
  let finishFirstLogin!: () => void
  let firstLoginStarted!: () => void
  const started = new Promise<void>((resolve) => { firstLoginStarted = resolve })
  const pendingLogin = new Promise<void>((resolve) => { finishFirstLogin = resolve })
  const calls: string[] = []
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => { calls.push("configure") },
      logIn: async (userId) => {
        calls.push(`login:${userId}`)
        if (userId === "user-1") { firstLoginStarted(); await pendingLogin }
      },
      logOut: async () => { calls.push("logout") },
      getProducts: async () => [],
      purchaseProduct: async () => { calls.push("purchase"); return { status: "cancelled" } }
    }
  })
  const first = client.syncAuthenticatedUser("user-1")
  await started
  const second = client.syncAuthenticatedUser("user-2")
  await assert.rejects(client.purchaseCoinPack("com.blumi.mobile.coins.500"), /sign in/i)
  assert.deepEqual(calls, ["configure", "login:user-1"])
  finishFirstLogin()
  await Promise.all([first, second])
  assert.deepEqual(calls, ["configure", "login:user-1", "logout", "login:user-2"])
  assert.deepEqual(await client.purchaseCoinPack("com.blumi.mobile.coins.500"), { status: "cancelled" })
})

test("a failed RevenueCat identity change stays closed and does not poison retry", async () => {
  const calls: string[] = []
  let failSecondUser = true
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => undefined,
      logIn: async (userId) => {
        calls.push(`login:${userId}`)
        if (userId === "user-2" && failSecondUser) throw new Error("SDK login failed")
      },
      logOut: async () => { calls.push("logout") },
      getProducts: async () => [],
      purchaseProduct: async () => { calls.push("purchase"); return { status: "cancelled" } }
    }
  })
  await client.syncAuthenticatedUser("user-1")
  await assert.rejects(client.syncAuthenticatedUser("user-2"), /SDK login failed/)
  await assert.rejects(client.purchaseCoinPack("com.blumi.mobile.coins.500"), /sign in/i)
  failSecondUser = false
  await client.syncAuthenticatedUser("user-2")
  assert.deepEqual(await client.purchaseCoinPack("com.blumi.mobile.coins.500"), { status: "cancelled" })
  assert.deepEqual(calls, ["login:user-1", "logout", "login:user-2", "login:user-2", "purchase"])
})

test("reconcile sends only authenticated transaction IDs and never a client coin grant", async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const result = await reconcileCoinPackPurchase({
    baseHttpUrl: "https://api.blumi.example/",
    sessionToken: "session-token",
    transactionId: "store-tx-1",
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify({
        results: [{ transactionId: "store-tx-1", status: "pending" }]
      }), { status: 202 })
    }
  })

  assert.deepEqual(result, { status: "pending" })
  assert.equal(requests[0]?.url, "https://api.blumi.example/v1/commerce/coin-packs/reconcile")
  assert.equal(requests[0]?.init?.headers instanceof Headers, false)
  assert.deepEqual(requests[0]?.init?.headers, {
    authorization: "Bearer session-token",
    "content-type": "application/json"
  })
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    transactionIds: ["store-tx-1"]
  })
})

test("successful native purchase waits for server reconciliation then refreshes the wallet", async () => {
  const order: string[] = []
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => undefined,
      logIn: async () => undefined,
      logOut: async () => undefined,
      getProducts: async () => [],
      purchaseProduct: async () => {
        order.push("native")
        return {
          status: "purchased",
          transaction: {
            productId: "com.blumi.mobile.coins.1500",
            transactionId: "store-tx-2",
            store: "ios"
          }
        }
      }
    }
  })
  const reconcileClient: CoinPackReconcileClient = {
    reconcile: async () => {
      order.push("reconcile")
      return { status: "credited" }
    }
  }

  const result = await runCoinPackPurchase({
    client,
    reconcileClient,
    sessionToken: "session-token",
    userId: "user-1",
    packId: "com.blumi.mobile.coins.1500",
    isConnected: true,
    refreshWallet: async () => {
      order.push("refresh")
    }
  })

  assert.deepEqual(result, { status: "credited" })
  assert.deepEqual(order, ["native", "reconcile", "refresh"])
})

test("cancelled, pending, and offline purchases never grant coins locally", async () => {
  let reconciles = 0
  let refreshes = 0
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => undefined,
      logIn: async () => undefined,
      logOut: async () => undefined,
      getProducts: async () => [],
      purchaseProduct: async () => ({ status: "cancelled" })
    }
  })
  const reconcileClient: CoinPackReconcileClient = {
    reconcile: async () => {
      reconciles += 1
      return { status: "credited" }
    }
  }

  assert.deepEqual(
    await runCoinPackPurchase({
      client,
      reconcileClient,
      sessionToken: "session-token",
      userId: "user-1",
      packId: "com.blumi.mobile.coins.500",
      isConnected: false,
      refreshWallet: async () => {
        refreshes += 1
      }
    }),
    { status: "offline" }
  )
  assert.deepEqual(
    await runCoinPackPurchase({
      client,
      reconcileClient,
      sessionToken: "session-token",
      userId: "user-1",
      packId: "com.blumi.mobile.coins.500",
      isConnected: true,
      refreshWallet: async () => {
        refreshes += 1
      }
    }),
    { status: "cancelled" }
  )
  assert.equal(reconciles, 0)
  assert.equal(refreshes, 0)
})

test("a temporary reconciliation failure retains the transaction only for a later server poll", async () => {
  const client = createRevenueCatCoinPackClient({
    apiKey: "rc_test_key",
    bridge: {
      configure: async () => undefined,
      logIn: async () => undefined,
      logOut: async () => undefined,
      getProducts: async () => [],
      purchaseProduct: async () => ({
        status: "purchased",
        transaction: {
          productId: "com.blumi.mobile.coins.4000",
          transactionId: "store-tx-pending",
          store: "ios"
        }
      })
    }
  })

  const result = await runCoinPackPurchase({
    client,
    reconcileClient: {
      reconcile: async () => {
        throw new Error("temporary network failure")
      }
    },
    sessionToken: "session-token",
    userId: "user-1",
    packId: "com.blumi.mobile.coins.4000",
    isConnected: true,
    refreshWallet: async () => {
      throw new Error("wallet must not refresh before server confirmation")
    }
  })

  assert.deepEqual(result, { status: "pending", transactionId: "store-tx-pending" })
})
