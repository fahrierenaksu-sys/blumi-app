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
