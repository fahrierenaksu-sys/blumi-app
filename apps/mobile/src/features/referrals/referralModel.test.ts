import assert from "node:assert/strict"
import test from "node:test"
import {
  isReferralCode,
  parseReferralCodeFromUrl,
  resolvePendingReferralClaim,
  shouldClaimCapturedReferral
} from "./referralModel"

test("referral links accept only the Blumi custom-link shape", () => {
  const code = "r_abcdefghijklmnopqrstuvwxyz0123456789AB"
  assert.equal(isReferralCode(code), true)
  assert.equal(isReferralCode("inviter-name"), false)
  assert.equal(parseReferralCodeFromUrl(`blumi://r/${code}`), code)
  assert.equal(parseReferralCodeFromUrl(`blumi://profile/${code}`), null)
  assert.equal(parseReferralCodeFromUrl("https://other.example/r/r_abcdefghijklmnopqrstuvwxyz0123456789AB"), null)
})

test("a captured referral asks an already signed-in production account to claim immediately", () => {
  assert.equal(shouldClaimCapturedReferral({ mode: "production" }), true)
  assert.equal(shouldClaimCapturedReferral({ mode: "demo" }), false)
  assert.equal(shouldClaimCapturedReferral(null), false)
})

test("a pending referral is bound to its first verified account and cannot cross accounts", () => {
  assert.deepEqual(
    resolvePendingReferralClaim({ code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB" }, "first-user"),
    { kind: "claim", pending: { code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB", userId: "first-user" } }
  )
  assert.deepEqual(
    resolvePendingReferralClaim({ code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB", userId: "first-user" }, "first-user"),
    { kind: "claim", pending: { code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB", userId: "first-user" } }
  )
  assert.deepEqual(
    resolvePendingReferralClaim({ code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB", userId: "first-user" }, "second-user"),
    { kind: "discard" }
  )
})
