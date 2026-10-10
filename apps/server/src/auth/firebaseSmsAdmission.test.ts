import assert from "node:assert/strict"
import test from "node:test"
import type { Pool } from "pg"
import { canonicalSmsIp, createPostgresSmsAdmission, smsDestinationCountry } from "./firebaseSmsAdmission"

test("IPv6 address rotation within one /64 and IPv4-mapped addresses share budgets", () => {
  assert.equal(canonicalSmsIp("203.0.113.7"), "203.0.113.7")
  assert.equal(canonicalSmsIp("::ffff:203.0.113.7"), "203.0.113.7")
  assert.equal(canonicalSmsIp("::ffff:cb00:7107"), "203.0.113.7")
  assert.equal(canonicalSmsIp("2001:db8:1:2::1"), canonicalSmsIp("2001:db8:1:2:ffff:ffff:ffff:ffff"))
  assert.notEqual(canonicalSmsIp("2001:db8:1:2::1"), canonicalSmsIp("2001:db8:1:3::1"))
  assert.equal(canonicalSmsIp("2001:0db8:0001:0002::1"), canonicalSmsIp("2001:db8:1:2::1"))
  for (const invalid of ["", "not-an-ip", "203.0.113.7, 198.51.100.1", "fe80::1%en0"]) {
    assert.equal(canonicalSmsIp(invalid), null)
  }
})

test("SMS destination uses full metadata for shared calling codes, never client country", () => {
  assert.equal(smsDestinationCountry("+12025550101"), "US")
  assert.equal(smsDestinationCountry("+14165550101"), "CA")
  assert.equal(smsDestinationCountry("+15550000001"), null)
  assert.equal(smsDestinationCountry("+12025550101 ext. 9"), null)
  assert.equal(smsDestinationCountry("not-a-phone"), null)
})

test("invalid or cross-project SMS events never reach the database", async () => {
  const reserve = createPostgresSmsAdmission({
    pool: { connect: async () => assert.fail("invalid events must not query") } as unknown as Pool,
    projectId: "fixture-project", hmacSecret: "fixture-key-with-at-least-32-bytes-long",
    expectedMigrationChecksum: "a".repeat(64)
  })
  const event = { eventId: "fixture", resource: "projects/fixture-project", smsType: "SIGN_IN_OR_SIGN_UP",
    timestamp: new Date().toISOString(), phoneNumber: "+15550000001", ipAddress: "203.0.113.7" }
  for (const change of [{ resource: "projects/another-project" }, { resource: "projects/fixture-project/tenants/other" },
    { smsType: "MULTI_FACTOR_SIGN_IN" }, { phoneNumber: "not-a-phone" }, { ipAddress: "unknown" },
    { eventId: "" }, { eventId: "invalid\u0000event" }, { eventId: "x".repeat(257) },
    { eventId: undefined as unknown as string }, { timestamp: "invalid" }]) {
    assert.deepEqual(await reserve({ ...event, ...change }), { allowed: false, reason: "invalid_event" })
  }
})
