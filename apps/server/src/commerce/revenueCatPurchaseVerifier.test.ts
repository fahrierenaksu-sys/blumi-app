import assert from "node:assert/strict"
import test from "node:test"
import { CommerceAuthorizationError } from "./commerceService"
import {
  CommerceProviderUnavailableError,
  createRevenueCatApiPurchaseVerifier
} from "./revenueCatPurchaseVerifier"

const fixtureApiCredential = ["fixture", "api", "credential"].join("-")

test("reconciliation does not credit sandbox or unspecified purchases", async () => {
  for (const environment of ["sandbox", undefined, null, "unknown"]) {
    const service = createRevenueCatApiPurchaseVerifier({ apiKey: "test", projectId: "test",
      coinProductIdMap: { product: "com.blumi.mobile.coins.500" }, fetcher: async () => jsonResponse({ items: [{
        id: "purchase", customer_id: "user", product_id: "product", store_purchase_identifier: "transaction",
        store: "app_store", status: "owned", purchased_at: 1_784_390_400_000, environment
      }] }) })
    assert.deepEqual(await service.verifyTransactions({ userId: "user", transactionIds: ["transaction"] }),
      [{ transactionId: "transaction", kind: "pending" }])
  }
})

test("explicit sandbox reconciliation accepts only sandbox purchases", async () => {
  for (const environment of ["production", "sandbox", undefined]) {
    const service = createRevenueCatApiPurchaseVerifier({ apiKey: "test", projectId: "test", purchaseEnvironment: "sandbox",
      coinProductIdMap: { product: "com.blumi.mobile.coins.500" }, fetcher: async () => jsonResponse({ items: [{
        id: "purchase", customer_id: "user", product_id: "product", store_purchase_identifier: "transaction",
        store: "app_store", status: "owned", purchased_at: 1_784_390_400_000, environment
      }] }) })
    assert.equal((await service.verifyTransactions({ userId: "user", transactionIds: ["transaction"] }))[0]?.kind,
      environment === "sandbox" ? "verified" : "pending")
  }
})

const verifier = createRevenueCatApiPurchaseVerifier({
  apiKey: fixtureApiCredential,
  projectId: "project_1",
  coinProductIdMap: {
    rc_product_500: "com.blumi.mobile.coins.500"
  },
  fetcher: async (url, init) => {
    assert.match(String(url), /store_purchase_identifier=transaction_1/)
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${fixtureApiCredential}`
    )
    return jsonResponse({
      object: "list",
      items: [{
        id: "purchase_1",
        customer_id: "user_a",
        product_id: "rc_product_500",
        store_purchase_identifier: "transaction_1",
        store: "app_store",
        environment: "production",
        status: "owned",
        purchased_at: 1_784_390_400_000
      }]
    })
  }
})

test("RevenueCat API reconciliation maps only server-configured consumables", async () => {
  const [result] = await verifier.verifyTransactions({
    userId: "user_a",
    transactionIds: ["transaction_1"]
  })

  assert.deepEqual(result, {
    transactionId: "transaction_1",
    kind: "verified",
    transaction: {
      eventId: "reconcile:purchase_1",
      transactionId: "transaction_1",
      userId: "user_a",
      productId: "com.blumi.mobile.coins.500",
      store: "ios",
      kind: "credit",
      occurredAt: "2026-07-18T16:00:00.000Z",
      providerPayload: {
        id: "purchase_1",
        customer_id: "user_a",
        product_id: "rc_product_500",
        store_purchase_identifier: "transaction_1",
        store: "app_store",
        environment: "production",
        status: "owned",
        purchased_at: 1_784_390_400_000
      }
    }
  })
})

test("RevenueCat API reconciliation does not credit a cross-account or unavailable transaction", async () => {
  const crossAccount = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    fetcher: async () => jsonResponse({
      items: [{
        id: "purchase_1",
        customer_id: "user_b",
        product_id: "rc_product_500",
        store_purchase_identifier: "transaction_1",
        store: "app_store",
        status: "owned",
        purchased_at: 1_784_390_400_000
      }]
    })
  })
  const pending = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    fetcher: async () => new Response(null, { status: 404 })
  })
  const unavailable = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    fetcher: async () => new Response(null, { status: 503 })
  })

  await assert.rejects(
    crossAccount.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceAuthorizationError
  )
  assert.deepEqual(
    await pending.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    [{ transactionId: "transaction_1", kind: "pending" }]
  )
  await assert.rejects(
    unavailable.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceProviderUnavailableError
  )
})

test("RevenueCat API reconciliation fails closed when the provider is unreachable or malformed", async () => {
  const unreachable = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    fetcher: async () => {
      throw new Error("network unreachable")
    }
  })
  const malformed = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    fetcher: async () => new Response("not json", { status: 200 })
  })

  await assert.rejects(
    unreachable.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceProviderUnavailableError
  )
  await assert.rejects(
    malformed.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceProviderUnavailableError
  )
})

test("RevenueCat API reconciliation aborts a lookup that exceeds its bounded timeout", async () => {
  const timedOut = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    timeoutMs: 1,
    fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The request timed out.", "AbortError"))
      }, { once: true })
    })
  })

  await assert.rejects(
    timedOut.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceProviderUnavailableError
  )
})

test("RevenueCat API reconciliation keeps the timeout active while the response body stalls", async () => {
  const stalledBody = createRevenueCatApiPurchaseVerifier({
    apiKey: fixtureApiCredential,
    projectId: "project_1",
    coinProductIdMap: { rc_product_500: "com.blumi.mobile.coins.500" },
    timeoutMs: 1,
    fetcher: async (_url, init) => ({
      status: 200,
      ok: true,
      json: async () => new Promise<unknown>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The response body timed out.", "AbortError"))
        }, { once: true })
      })
    } as Response)
  })

  await assert.rejects(
    stalledBody.verifyTransactions({ userId: "user_a", transactionIds: ["transaction_1"] }),
    CommerceProviderUnavailableError
  )
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}
