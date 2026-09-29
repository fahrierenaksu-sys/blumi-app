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

test("referral requests time out a stalled transport", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  for (const run of [
    (fetcher: typeof fetch) => createReferralInvite("https://api.test", "session-token", fetcher),
    (fetcher: typeof fetch) => claimReferralInvite("https://api.test", "session-token", "r_code", fetcher)
  ]) {
    let transportSignal: AbortSignal | null | undefined
    const rejected = assert.rejects(run(async (_url, init) => {
      transportSignal = init?.signal
      return new Promise<Response>(() => {})
    }), { name: "TimeoutError" })
    context.mock.timers.tick(15_000)
    assert.equal(transportSignal?.aborted, true)
    await rejected
  }
})
