import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { createAuthService, type AuthService } from "../auth/authService"
import { createCommerceService } from "../commerce/commerceService"
import type { RevenueCatPurchaseVerifier } from "../commerce/revenueCatPurchaseVerifier"
import { createEconomyService } from "../economy/economyService"
import { createServer } from "../server"

const WEBHOOK_SECRET = "revenuecat-webhook-secret-with-enough-entropy"

test("reconcile credits only provider-verified transactions and exposes stable poll states", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const economyService = createEconomyService()
  const commerceService = createCommerceService({ economyService })
  const app = createServer({
    authService,
    economyService,
    commerceService,
    revenueCatPurchaseVerifier: {
      async verifyTransactions({ userId, transactionIds }) {
        return transactionIds.map((transactionId) => transactionId === "pending_1"
          ? { transactionId, kind: "pending" as const }
          : {
              transactionId,
              kind: "verified" as const,
              transaction: {
                eventId: `reconcile:${transactionId}`,
                transactionId,
                userId,
                productId: "com.blumi.mobile.coins.500",
                store: "ios" as const,
                kind: "credit" as const,
                occurredAt: "2026-07-29T12:00:00.000Z",
                providerPayload: { provider: "revenuecat", transactionId }
              }
            }
        )
      }
    }
  })
  const token = await registerEligibleSession(app, authService, "+905551112233")

  const credited = await app.inject({
    method: "POST",
    url: "/v1/commerce/coin-packs/reconcile",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionIds: ["transaction_1"] }
  })
  const repeated = await app.inject({
    method: "POST",
    url: "/v1/commerce/coin-packs/reconcile",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionIds: ["transaction_1"] }
  })
  const pending = await app.inject({
    method: "POST",
    url: "/v1/commerce/coin-packs/reconcile",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionIds: ["pending_1"] }
  })

  assert.equal(credited.statusCode, 200)
  assert.deepEqual(credited.json().results, [
    { transactionId: "transaction_1", status: "credited" }
  ])
  assert.equal(credited.json().inventory.coins, 1750)
  assert.deepEqual(repeated.json().results, [
    { transactionId: "transaction_1", status: "already_processed" }
  ])
  assert.equal(repeated.json().inventory.coins, 1750)
  assert.deepEqual(pending.json().results, [
    { transactionId: "pending_1", status: "pending" }
  ])
  assert.equal(pending.json().inventory.coins, 1750)
  await app.close()
})

test("reconcile rejects a verified transaction assigned to another RevenueCat app user", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const economyService = createEconomyService()
  const app = createServer({
    authService,
    economyService,
    commerceService: createCommerceService({ economyService }),
    revenueCatPurchaseVerifier: createCrossAccountVerifier()
  })
  const token = await registerEligibleSession(app, authService, "+905551112234")

  const response = await app.inject({
    method: "POST",
    url: "/v1/commerce/coin-packs/reconcile",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionIds: ["transaction_other_user"] }
  })
  const balance = await app.inject({
    method: "GET",
    url: "/v1/economy/balance",
    headers: { authorization: `Bearer ${token}` }
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, "COMMERCE_TRANSACTION_ACCOUNT_MISMATCH")
  assert.equal(balance.json().inventory.coins, 1250)
  await app.close()
})

test("reconcile rejects a transaction already bound to another wallet", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const economyService = createEconomyService()
  const commerceService = createCommerceService({ economyService })
  await commerceService.applyVerifiedTransaction({
    eventId: "event_existing_transaction",
    transactionId: "transaction_bound_elsewhere",
    userId: "another_wallet",
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind: "credit",
    occurredAt: "2026-07-29T12:00:00.000Z",
    providerPayload: { provider: "revenuecat" }
  })
  const app = createServer({
    authService,
    economyService,
    commerceService,
    revenueCatPurchaseVerifier: {
      async verifyTransactions({ userId, transactionIds }) {
        return transactionIds.map((transactionId) => ({
          transactionId,
          kind: "verified" as const,
          transaction: {
            eventId: "event_conflicting_reconcile",
            transactionId,
            userId,
            productId: "com.blumi.mobile.coins.500",
            store: "ios" as const,
            kind: "credit" as const,
            occurredAt: "2026-07-29T12:00:00.000Z",
            providerPayload: { provider: "revenuecat" }
          }
        }))
      }
    }
  })
  const token = await registerEligibleSession(app, authService, "+905551112236")

  const response = await app.inject({
    method: "POST",
    url: "/v1/commerce/coin-packs/reconcile",
    headers: { authorization: `Bearer ${token}` },
    payload: { transactionIds: ["transaction_bound_elsewhere"] }
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, "COMMERCE_TRANSACTION_ACCOUNT_MISMATCH")
  await app.close()
})

test("RevenueCat webhooks verify raw HMAC bytes and resolve original or aliased app users", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const economyService = createEconomyService()
  const app = createServer({
    authService,
    economyService,
    commerceService: createCommerceService({ economyService }),
    revenueCatWebhookSigningSecret: WEBHOOK_SECRET
  })
  const token = await registerEligibleSession(app, authService, "+905551112235")
  const session = await authService.getSession(token)
  assert.ok(session)
  const payload = JSON.stringify({
    api_version: "1.0",
    event: {
      id: "event_webhook_1",
      app_user_id: "$RCAnonymousID:stale",
      original_app_user_id: session.account.userId,
      aliases: ["$RCAnonymousID:stale", session.account.userId],
      transaction_id: "transaction_webhook_1",
      product_id: "com.blumi.mobile.coins.500",
      store: "APP_STORE",
      environment: "PRODUCTION",
      type: "NON_RENEWING_PURCHASE",
      event_timestamp_ms: 1_784_390_400_000
    }
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex")
  const headers = {
    "content-type": "application/json",
    "x-revenuecat-webhook-signature": `t=${timestamp},v1=${signature}`
  }

  const accepted = await app.inject({
    method: "POST",
    url: "/v1/webhooks/revenuecat",
    headers,
    payload
  })
  const replayed = await app.inject({
    method: "POST",
    url: "/v1/webhooks/revenuecat",
    headers,
    payload
  })
  const malformedSignature = await app.inject({
    method: "POST",
    url: "/v1/webhooks/revenuecat",
    headers: {
      ...headers,
      "x-revenuecat-webhook-signature": `t=${timestamp},v1=${"0".repeat(64)}`
    },
    payload
  })
  const refundPayload = JSON.stringify({
    api_version: "1.0",
    event: {
      id: "event_webhook_refund_1",
      app_user_id: "$RCAnonymousID:stale",
      original_app_user_id: session.account.userId,
      aliases: [session.account.userId],
      transaction_id: "transaction_webhook_1",
      product_id: "com.blumi.mobile.coins.500",
      store: "APP_STORE",
      environment: "PRODUCTION",
      type: "CANCELLATION",
      event_timestamp_ms: 1_784_390_400_000
    }
  })
  const refundSignature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${refundPayload}`)
    .digest("hex")
  const refunded = await app.inject({
    method: "POST",
    url: "/v1/webhooks/revenuecat",
    headers: {
      "content-type": "application/json",
      "x-revenuecat-webhook-signature": `t=${timestamp},v1=${refundSignature}`
    },
    payload: refundPayload
  })
  const balance = await app.inject({
    method: "GET",
    url: "/v1/economy/balance",
    headers: { authorization: `Bearer ${token}` }
  })

  assert.equal(accepted.statusCode, 200)
  assert.equal(replayed.statusCode, 200)
  assert.equal(malformedSignature.statusCode, 401)
  assert.equal(refunded.statusCode, 200)
  assert.equal(balance.json().inventory.coins, 1250)
  await app.close()
})

function createCrossAccountVerifier(): RevenueCatPurchaseVerifier {
  return {
    async verifyTransactions({ transactionIds }) {
      return transactionIds.map((transactionId) => ({
        transactionId,
        kind: "verified" as const,
        transaction: {
          eventId: `reconcile:${transactionId}`,
          transactionId,
          userId: "another_revenuecat_user",
          productId: "com.blumi.mobile.coins.500",
          store: "ios" as const,
          kind: "credit" as const,
          occurredAt: "2026-07-29T12:00:00.000Z",
          providerPayload: { provider: "revenuecat", transactionId }
        }
      }))
    }
  }
}

async function registerEligibleSession(
  app: ReturnType<typeof createServer>,
  authService: AuthService,
  phoneNumber: string
): Promise<string> {
  const sent = await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber }
  })
  assert.equal(sent.statusCode, 202)
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber, verificationCode: "482931" }
  })
  assert.equal(verified.statusCode, 200)
  const token = verified.json().session.sessionToken
  const profile = await authService.updateProfile(token, {
    displayName: "Commerce Test",
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  assert.ok(profile)
  for (const step of ["profile", "avatar", "room"] as const) {
    assert.ok(await authService.completeOnboardingStep(token, step))
  }
  return token
}
