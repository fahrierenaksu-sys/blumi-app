import assert from "node:assert/strict"
import test from "node:test"
import {
  createDevelopmentSmsProvider,
  createTwilioSmsProvider
} from "./smsProvider"

test("development provider never logs the destination phone or active OTP", { concurrency: false }, async () => {
  const sinks = ["log", "error", "warn", "info"] as const
  const originals = Object.fromEntries(
    sinks.map((sink) => [sink, console[sink]])
  ) as Record<(typeof sinks)[number], typeof console.log>
  const logs: string[] = []
  for (const sink of sinks) {
    console[sink] = (...values: unknown[]) => {
      logs.push(`${sink}: ${values.map(String).join(" ")}`)
    }
  }

  try {
    await createDevelopmentSmsProvider().sendVerificationCode({
      phoneNumber: "+905551112233",
      code: "482931",
      expiresAt: "2999-01-01T00:05:00.000Z"
    })
  } finally {
    for (const sink of sinks) {
      console[sink] = originals[sink]
    }
  }

  const output = logs.join("\n")
  assert.doesNotMatch(output, /\+905551112233/)
  assert.doesNotMatch(output, /482931/)
})

test("twilio provider sends the expected form-encoded SMS request", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const provider = createTwilioSmsProvider({
    accountSid: "AC123",
    authToken: "secret",
    fromPhoneNumber: "+15551234567",
    async fetcher(url, init) {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 })
    }
  })

  await provider.sendVerificationCode({
    phoneNumber: "+905551112233",
    code: "482931",
    expiresAt: "2999-01-01T00:05:00.000Z"
  })

  assert.equal(
    calls[0]?.url,
    "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
  )
  assert.equal(calls[0]?.init?.method, "POST")
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal)
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>)["content-type"],
    "application/x-www-form-urlencoded"
  )
  assert.match(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    /^Basic /
  )
  const body = calls[0]?.init?.body as URLSearchParams
  assert.equal(body.get("To"), "+905551112233")
  assert.equal(body.get("From"), "+15551234567")
  assert.match(body.get("Body") ?? "", /482931/)
})

test("twilio provider fails closed when the provider rejects the request", async () => {
  const provider = createTwilioSmsProvider({
    accountSid: "AC123",
    authToken: "secret",
    fromPhoneNumber: "+15551234567",
    async fetcher() {
      return new Response("nope", { status: 500 })
    }
  })

  await assert.rejects(
    Promise.resolve(provider.sendVerificationCode({
      phoneNumber: "+905551112233",
      code: "482931",
      expiresAt: "2999-01-01T00:05:00.000Z"
    })),
    /SMS provider/
  )
})
