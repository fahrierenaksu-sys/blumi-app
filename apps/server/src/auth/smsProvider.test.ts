import assert from "node:assert/strict"
import test from "node:test"
import { createDevelopmentSmsProvider } from "./smsProvider"

test("legacy development provider never logs the destination phone or OTP", { concurrency: false }, async () => {
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "))
  try {
    await createDevelopmentSmsProvider().sendVerificationCode({
      phoneNumber: "+905551112233",
      code: "482931",
      expiresAt: "2999-01-01T00:05:00.000Z"
    })
  } finally {
    console.log = originalLog
  }
  assert.doesNotMatch(logs.join("\n"), /905551112233|482931/)
})
