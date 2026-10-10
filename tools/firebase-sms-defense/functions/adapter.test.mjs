import assert from "node:assert/strict"
import test from "node:test"
import { createBeforeSmsHandler } from "./adapter.mjs"

test("a granted budget never overrides the provider fraud verdict with ALLOW", async () => {
  const handler = createBeforeSmsHandler(async () => ({ allowed: true }))
  assert.deepEqual(await handler({}), {})
})
test("every refused or unavailable budget blocks instead of falling back", async () => {
  for (const result of [{ allowed: false }, {}, { allowed: "true" }, null]) {
    assert.deepEqual(await createBeforeSmsHandler(async () => result)({}), { recaptchaActionOverride: "BLOCK" })
  }
  assert.deepEqual(await createBeforeSmsHandler(async () => { throw new Error("provider failure") })({}),
    { recaptchaActionOverride: "BLOCK" })
})
test("the adapter uses the provider phone and address, not user agent or arbitrary client fields", async () => {
  let received
  const handler = createBeforeSmsHandler(async event => { received = event; return { allowed: false } })
  await handler({ eventId: "fixture", resource: { service: "identitytoolkit.googleapis.com", name: "projects/fixture-project" }, timestamp: "fixture-time",
    smsType: "SIGN_IN_OR_SIGN_UP", ipAddress: "203.0.113.7",
    additionalUserInfo: { phoneNumber: "+15550000001", recaptchaScore: 0.3 }, userAgent: "ignored",
    phoneNumber: "ignored", accountId: "ignored", recaptchaScore: 1 })
  assert.deepEqual(received, { eventId: "fixture", resource: "projects/fixture-project", timestamp: "fixture-time",
    smsType: "SIGN_IN_OR_SIGN_UP", ipAddress: "203.0.113.7", phoneNumber: "+15550000001", recaptchaScore: 0.3 })
})
