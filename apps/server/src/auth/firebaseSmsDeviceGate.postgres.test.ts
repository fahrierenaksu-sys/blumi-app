import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { createSmsDeviceGate, type SmsDeviceProofVerifier } from "./firebaseSmsDeviceGate"
import { createPostgresSmsAdmission, SMS_ADMISSION_MIGRATION_ID } from "./firebaseSmsAdmission"

const checksum = createHash("sha256").update(readFileSync(resolve(__dirname, "../../db/migrations", SMS_ADMISSION_MIGRATION_ID))).digest("hex")
const phone = (index = 1) => `+1202555${String(100 + index).padStart(4, "0")}`
async function fixture(verifyProof: SmsDeviceProofVerifier = async () => ({ publicKey: null, signCount: 0 })) {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  const restricted = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c role=blumi_sms_device_gate", max: 4 })
  await pool.query("TRUNCATE blumi_sms_send_admissions, blumi_sms_device_permits, blumi_sms_device_challenges, blumi_sms_installations, blumi_sms_country_policy")
  await pool.query(`INSERT INTO blumi_sms_admission_config
    (singleton, enabled, cost_limit_24_hours_microusd, cost_limit_month_microusd, opening_month_utc)
    VALUES (true, true, 6000000, 20000000, to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM')) ON CONFLICT (singleton) DO UPDATE SET
    enabled = true, cost_limit_24_hours_microusd = 6000000, cost_limit_month_microusd = 20000000,
    opening_month_utc = to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM'), opening_cost_microusd = 0`)
  await pool.query(`INSERT INTO blumi_sms_country_policy VALUES ('US', true, 10000, clock_timestamp() + interval '1 day', 1500, 2000000)`)
  const options = { projectId: "fixture-project", hmacSecret: "fixture-key-with-at-least-32-bytes-long", expectedMigrationChecksum: checksum }
  const gates = [pool, restricted].map(pool => createSmsDeviceGate({ ...options, pool, verifyProof }))
  const reserve = createPostgresSmsAdmission({ ...options, pool })
  return { pool, restricted, gates, reserve, close: async () => { await restricted.end(); await pool.end() } }
}
const base = { platform: "android" as const, phoneNumber: phone(), ipAddress: "203.0.113.7" }

test("one verified installation shares three permits across phones, IPs and independent instances", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    let installationId: string | undefined
    for (let i = 0; i < 3; i++) {
      const challenge = await f.gates[i % 2]!.challenge({ ...base, installationId,
        phoneNumber: phone(i + 1), ipAddress: `198.51.100.${i + 1}` })
      installationId = challenge.installationId
      await f.gates[(i + 1) % 2]!.permit({ ...base, installationId, phoneNumber: phone(i + 1),
        challenge: challenge.challenge, proof: "fixture-verified-proof" })
      assert.equal((await f.reserve({ eventId: randomUUID(), resource: "projects/fixture-project", smsType: "SIGN_IN_OR_SIGN_UP",
        timestamp: new Date().toISOString(), phoneNumber: phone(i + 1), ipAddress: `198.51.100.${i + 1}` })).allowed, true)
      await f.pool.query("UPDATE blumi_sms_device_permits SET created_at = created_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds'")
    }
    await assert.rejects(f.gates[1]!.challenge({ ...base, installationId, phoneNumber: phone(10), ipAddress: "192.0.2.9" }), /device limit/)
    assert.equal((await f.pool.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits")).rows[0].total, 3)
    assert.equal((await f.pool.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 3)
  } finally { await f.close() }
})

test("parallel requests can create only one permit during the installation cooldown", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    const first = await f.gates[0]!.challenge(base)
    const challenges = [first]
    for (let i = 1; i < 6; i++) challenges.push(await f.gates[i % 2]!.challenge({ ...base, installationId: first.installationId, phoneNumber: phone(i + 1) }))
    const results = await Promise.allSettled(challenges.map((challenge, i) => f.gates[i % 2]!.permit({
      ...base, installationId: first.installationId, phoneNumber: phone(i + 1), challenge: challenge.challenge, proof: "fixture-proof"
    })))
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
    assert.equal((await f.pool.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits")).rows[0].total, 1)
  } finally { await f.close() }
})

test("a challenge is single-use, destination-bound, installation-bound and short-lived", disposablePostgresSkip(), async () => {
  let verifications = 0
  const f = await fixture(async () => { verifications += 1; return { publicKey: null, signCount: 0 } })
  try {
    const first = await f.gates[0]!.challenge(base)
    const second = await f.gates[1]!.challenge({ ...base, phoneNumber: phone(2) })
    const request = { ...base, installationId: first.installationId, challenge: first.challenge, proof: "fixture-proof" }
    await assert.rejects(f.gates[0]!.permit({ ...request, phoneNumber: phone(2) }), /challenge rejected/)
    await assert.rejects(f.gates[0]!.permit({ ...request, installationId: second.installationId }), /challenge rejected/)
    assert.equal(verifications, 0)
    await f.gates[1]!.permit(request)
    await assert.rejects(f.gates[0]!.permit(request), /challenge rejected/)
    assert.equal(verifications, 1)
    await f.pool.query("UPDATE blumi_sms_device_challenges SET expires_at = created_at + interval '1 microsecond'")
    await assert.rejects(f.gates[0]!.permit({ ...request, installationId: second.installationId, phoneNumber: phone(2), challenge: second.challenge }), /challenge rejected/)
    await assert.rejects(f.gates[0]!.challenge({ ...base, installationId: "x".repeat(43) }), /unavailable/)
  } finally { await f.close() }
})

test("failed attestation burns its challenge and never issues a permit", disposablePostgresSkip(), async () => {
  const f = await fixture(async () => { throw new Error("rejected proof") })
  try {
    const challenge = await f.gates[1]!.challenge(base)
    const request = { ...base, installationId: challenge.installationId, challenge: challenge.challenge, proof: "fixture-proof" }
    await assert.rejects(f.gates[0]!.permit(request), /rejected proof/)
    await assert.rejects(f.gates[1]!.permit(request), /challenge rejected/)
    assert.equal((await f.pool.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits")).rows[0].total, 0)
  } finally { await f.close() }
})

test("the gate role cannot change policy, attested public keys or erase device budgets", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    const challenge = await f.gates[1]!.challenge(base)
    await f.gates[1]!.permit({ ...base, installationId: challenge.installationId, challenge: challenge.challenge, proof: "fixture-proof" })
    await assert.rejects(f.restricted.query("UPDATE blumi_sms_admission_config SET enabled = false"), /permission denied/)
    await assert.rejects(f.restricted.query("DELETE FROM blumi_sms_device_permits"), /permission denied/)
    await assert.rejects(f.restricted.query("UPDATE blumi_sms_installations SET public_key = 'other'"), /permission denied/)
    await assert.rejects(f.restricted.query("UPDATE blumi_sms_device_permits SET consumed_at = clock_timestamp()"), /permission denied/)
    await assert.rejects(f.restricted.query("SELECT * FROM blumi_sms_send_admissions"), /permission denied/)
  } finally { await f.close() }
})

test("iOS assertion counters cannot be reset or committed out of order across instances", disposablePostgresSkip(), async () => {
  let releaseFirst!: () => void
  const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve })
  const f = await fixture(async input => {
    if (input.publicKey === null) return { publicKey: "fixture-public-key", signCount: 0 }
    const count = Number(input.proof)
    if (count === 1) await firstHeld
    return { publicKey: input.publicKey, signCount: count }
  })
  try {
    const ios = { ...base, platform: "ios" as const, installationId: "a".repeat(43) + "=" }
    const registration = await f.gates[0]!.challenge(ios)
    await f.gates[0]!.permit({ ...ios, challenge: registration.challenge, proof: "fixture-registration" })
    await f.pool.query("UPDATE blumi_sms_device_permits SET created_at = created_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds'")
    const first = await f.gates[0]!.challenge({ ...ios, phoneNumber: phone(2) })
    const second = await f.gates[1]!.challenge({ ...ios, phoneNumber: phone(3) })
    const older = f.gates[0]!.permit({ ...ios, phoneNumber: phone(2), challenge: first.challenge, proof: "1" })
    const olderSettled = Promise.allSettled([older])
    await f.gates[1]!.permit({ ...ios, phoneNumber: phone(3), challenge: second.challenge, proof: "2" })
    releaseFirst()
    const results = [...await olderSettled, { status: "fulfilled" }]
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
    assert.equal((await f.pool.query("SELECT sign_count FROM blumi_sms_installations")).rows[0].sign_count, "2")
    const reset = await f.gates[1]!.challenge({ ...ios, phoneNumber: phone(4) })
    await assert.rejects(f.gates[0]!.permit({ ...ios, phoneNumber: phone(4), challenge: reset.challenge, proof: "0" }), /proof rejected/)
    assert.equal((await f.pool.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits")).rows[0].total, 2)
  } finally { releaseFirst(); await f.close() }
})
