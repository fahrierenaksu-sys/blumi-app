import assert from "node:assert/strict"
import test from "node:test"
import { createOtpDigest, otpDigestsMatch } from "./authStore"

const TEST_OTP_HMAC_KEY = "test-only-otp-hmac-key-with-32-characters"

test("OTP digests are deterministic and scoped to phone and challenge", () => {
  const input = {
    secret: TEST_OTP_HMAC_KEY,
    otpId: "challenge-a",
    phoneNumber: "+905551112233",
    code: "482931"
  }
  const digest = createOtpDigest(input)

  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.equal(createOtpDigest(input), digest)
  assert.notEqual(createOtpDigest({ ...input, otpId: "challenge-b" }), digest)
  assert.notEqual(
    createOtpDigest({ ...input, phoneNumber: "+905559998877" }),
    digest
  )
  assert.notEqual(createOtpDigest({ ...input, code: "482932" }), digest)
})

test("OTP digest comparison rejects wrong and malformed values", () => {
  const digest = createOtpDigest({
    secret: TEST_OTP_HMAC_KEY,
    otpId: "challenge-a",
    phoneNumber: "+905551112233",
    code: "482931"
  })

  assert.equal(otpDigestsMatch(digest, digest), true)
  assert.equal(otpDigestsMatch(digest, "0".repeat(64)), false)
  assert.equal(otpDigestsMatch(digest, "not-a-digest"), false)
})
