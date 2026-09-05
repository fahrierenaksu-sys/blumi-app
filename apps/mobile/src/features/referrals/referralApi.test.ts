import assert from "node:assert/strict"
import test from "node:test"
import { claimReferralInvite, createReferralInvite } from "./referralApi"

function requestUrl(value: string | URL | Request): string {
  if (typeof value === "string") return value
  if (value instanceof URL) return value.toString()
  return value.url
}

test("referral APIs use authenticated server endpoints and reject malformed server links", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const invite = await createReferralInvite(
    "https://api.blumi.test/",
    "session-token",
    async (url, init) => {
      calls.push({ url: requestUrl(url), init })
      return new Response(JSON.stringify({
        invite: { url: "blumi://r/r_abcdefghijklmnopqrstuvwxyz0123456789AB" }
      }), { status: 200 })
    }
  )
  await claimReferralInvite(
    "https://api.blumi.test",
    "session-token",
    "r_abcdefghijklmnopqrstuvwxyz0123456789AB",
    async (url, init) => {
      calls.push({ url: requestUrl(url), init })
      return new Response(null, { status: 204 })
    }
  )

  assert.equal(invite.url, "blumi://r/r_abcdefghijklmnopqrstuvwxyz0123456789AB")
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/referrals/invite")
  assert.equal(calls[0]?.init?.headers && (calls[0].init.headers as Record<string, string>).authorization, "Bearer session-token")
  assert.equal(calls[1]?.url, "https://api.blumi.test/v1/referrals/claim")
})
