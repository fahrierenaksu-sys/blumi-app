import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import {
  parseRevenueCatWebhookEvent,
  verifyRevenueCatWebhookSignature
} from "./revenueCatWebhook"

const WEBHOOK_SECRET = "revenuecat-webhook-secret-with-enough-entropy"

test("webhooks reject sandbox and unknown environments by default", () => {
  const body = JSON.parse(RAW_BODY.toString("utf8"))
  for (const environment of ["SANDBOX", undefined, null, "UNKNOWN"]) {
    assert.equal(parseRevenueCatWebhookEvent({ event: { ...body.event, environment } }), null)
  }
  assert.ok(parseRevenueCatWebhookEvent({ event: { ...body.event, environment: "SANDBOX" } }, "sandbox"))
  assert.equal(parseRevenueCatWebhookEvent(body, "sandbox"), null)
})
const RAW_BODY = Buffer.from(JSON.stringify({
  api_version: "1.0",
  event: {
    id: "event_1",
    app_user_id: "user_a",
    transaction_id: "transaction_1",
    product_id: "com.blumi.mobile.coins.500",
    store: "APP_STORE",
    environment: "PRODUCTION",
    type: "NON_RENEWING_PURCHASE",
    event_timestamp_ms: 1_784_390_400_000
  }
}))

function signatureHeader(timestampSeconds: number, rawBody = RAW_BODY): string {
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestampSeconds}.`)
    .update(rawBody)
    .digest("hex")
  return `t=${timestampSeconds},v1=${signature}`
}

test("RevenueCat webhook signatures require exact raw bytes and a fresh HMAC timestamp", () => {
  const now = new Date("2026-07-29T12:00:00.000Z")
  const timestamp = Math.floor(now.getTime() / 1000)

  assert.equal(
    verifyRevenueCatWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: signatureHeader(timestamp),
      secret: WEBHOOK_SECRET,
      now
    }),
    true
  )
  assert.equal(
    verifyRevenueCatWebhookSignature({
      rawBody: Buffer.from(`${RAW_BODY.toString("utf8")} `),
      signatureHeader: signatureHeader(timestamp),
      secret: WEBHOOK_SECRET,
      now
    }),
    false
  )
  assert.equal(
    verifyRevenueCatWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: signatureHeader(timestamp - 301),
      secret: WEBHOOK_SECRET,
      now
    }),
    false
  )
  assert.equal(
    verifyRevenueCatWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: "t=1784390400,v1=not-a-hex-signature",
      secret: WEBHOOK_SECRET,
      now
    }),
    false
  )
})

test("RevenueCat consumable webhook parser admits only canonical packs and supported stores", () => {
  const parsed = parseRevenueCatWebhookEvent(JSON.parse(RAW_BODY.toString("utf8")))

  assert.deepEqual(parsed, {
    eventId: "event_1",
    userId: "user_a",
    userIdCandidates: ["user_a"],
    transactionId: "transaction_1",
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind: "credit",
    occurredAt: "2026-07-18T16:00:00.000Z"
  })
  assert.equal(parseRevenueCatWebhookEvent({ event: { type: "TEST" } }), null)
})

test("RevenueCat webhook parser keeps the original app user ID and aliases as account candidates", () => {
  const parsed = parseRevenueCatWebhookEvent({
    event: {
      id: "event_alias_1",
      original_app_user_id: "user_original",
      aliases: ["$RCAnonymousID:legacy", "user_alias", "user_original"],
      transaction_id: "transaction_alias_1",
      product_id: "com.blumi.mobile.coins.500",
      store: "PLAY_STORE",
      environment: "PRODUCTION",
      type: "CANCELLATION",
      event_timestamp_ms: 1_784_390_400_000
    }
  })

  assert.deepEqual(parsed?.userIdCandidates, [
    "user_original",
    "$RCAnonymousID:legacy",
    "user_alias"
  ])
  assert.equal(parsed?.userId, "user_original")
  assert.equal(parsed?.kind, "reversal")
})
