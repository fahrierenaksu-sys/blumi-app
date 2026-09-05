import test from "node:test"
import assert from "node:assert/strict"
import {
  parseAuthPhoneRequest,
  parseAuthVerificationRequest,
  parseRegisterAccountRequest
} from "./authRequestSchemas"

test("auth phone request normalizes a supported phone number", () => {
  assert.deepEqual(parseAuthPhoneRequest({ phoneNumber: "+90 (532) 123-45-67" }), {
    phoneNumber: "+905321234567"
  })
})

test("auth phone request rejects malformed bodies", () => {
  assert.equal(parseAuthPhoneRequest(null), null)
  assert.equal(parseAuthPhoneRequest({ phoneNumber: "5321234567" }), null)
  assert.equal(parseAuthPhoneRequest({ phoneNumber: 905321234567 }), null)
})

test("auth verification request normalizes the phone and code", () => {
  assert.deepEqual(
    parseAuthVerificationRequest({
      phoneNumber: "+1 202-555-0123",
      verificationCode: " 482931 "
    }),
    {
      phoneNumber: "+12025550123",
      verificationCode: "482931"
    }
  )
})

test("auth verification request rejects malformed credentials", () => {
  assert.equal(
    parseAuthVerificationRequest({
      phoneNumber: "+12025550123",
      verificationCode: "48293"
    }),
    null
  )
  assert.equal(
    parseAuthVerificationRequest({
      phoneNumber: "+12025550123",
      verificationCode: "482931abc"
    }),
    null
  )
})

test("register request requires a localized terms acceptance record", () => {
  assert.deepEqual(
    parseRegisterAccountRequest({
      phoneNumber: "+1 202-555-0123",
      verificationCode: " 482931 ",
      termsAcceptance: {
        version: "2026.08.31",
        locale: "tr"
      }
    }),
    {
      phoneNumber: "+12025550123",
      verificationCode: "482931",
      termsAcceptance: {
        version: "2026.08.31",
        locale: "tr"
      }
    }
  )

  assert.equal(
    parseRegisterAccountRequest({
      phoneNumber: "+12025550123",
      verificationCode: "482931"
    }),
    null
  )
})
