import { createHash, createHmac, randomBytes } from "node:crypto"
import type { Pool, PoolClient } from "pg"
import { canonicalSmsIp, SMS_ADMISSION_MIGRATION_ID, smsDestinationCountry } from "./firebaseSmsAdmission"

export type SmsPlatform = "ios" | "android"
export type SmsDeviceProofVerifier = (input: {
  platform: SmsPlatform; installationId: string; payload: string; proof: string;
  publicKey: string | null; signCount: number; now: number
}) => Promise<{ publicKey: string | null; signCount: number }>

export function smsDevicePayload(projectId: string, platform: SmsPlatform,
  installationId: string, challenge: string, phoneNumber: string): string {
  return JSON.stringify(["blumi-sms-permit-v1", projectId, platform, installationId, challenge, phoneNumber])
}

export function createSmsDeviceGate(options: {
  pool: Pool; projectId: string; hmacSecret: string;
  expectedMigrationChecksum: string; verifyProof: SmsDeviceProofVerifier
}) {
  if (Buffer.byteLength(options.hmacSecret) < 32 || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(options.projectId) ||
    !/^[0-9a-f]{64}$/.test(options.expectedMigrationChecksum)) {
    throw new Error("Invalid SMS gate configuration")
  }
  const hash = (scope: string, value: string) => createHmac("sha256", options.hmacSecret)
    .update(JSON.stringify(["blumi-sms-v1", options.projectId, scope, value])).digest("hex")
  async function transaction<T>(run: (db: PoolClient, now: Date) => Promise<T>): Promise<T> {
    const db = await options.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SET LOCAL statement_timeout = '2500ms'")
      await db.query("SET LOCAL lock_timeout = '1000ms'")
      await db.query("SET LOCAL idle_in_transaction_session_timeout = '4000ms'")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["blumi:sms-admission:v1"])
      const schema = (await db.query("SELECT checksum FROM blumi_migrations WHERE id = $1", [SMS_ADMISSION_MIGRATION_ID])).rows[0]
      const policy = (await db.query("SELECT enabled FROM blumi_sms_admission_config WHERE singleton = true")).rows[0]
      const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0]?.now
      if (schema?.checksum?.trim() !== options.expectedMigrationChecksum || policy?.enabled !== true || !(now instanceof Date)) {
        throw new Error("SMS gate unavailable")
      }
      const result = await run(db, now)
      await db.query("COMMIT")
      return result
    } catch (error) {
      try { await db.query("ROLLBACK") } catch { /* Remain closed. */ }
      throw error
    } finally { db.release() }
  }
  function identify(input: { platform: SmsPlatform; installationId: string; phoneNumber: string }) {
    if (input.platform !== "ios" && input.platform !== "android") throw new Error("Invalid SMS gate input")
    const pattern = input.platform === "ios" ? /^[A-Za-z0-9+/]{43}=$/ : /^[A-Za-z0-9_-]{43}$/
    if (!pattern.test(input.installationId) || !/^\+[1-9]\d{7,14}$/.test(input.phoneNumber)) throw new Error("Invalid SMS gate input")
    const country = smsDestinationCountry(input.phoneNumber)
    if (!country) throw new Error("Invalid SMS gate input")
    return { installationKey: hash("installation", `${input.platform}:${input.installationId}`),
      phoneKey: hash("phone", input.phoneNumber), country }
  }
  return {
    async challenge(input: { platform: SmsPlatform; installationId?: string; phoneNumber: string; ipAddress: string }) {
      const installationId = input.installationId ?? (input.platform === "android" ? randomBytes(32).toString("base64url") : "")
      const { installationKey, phoneKey, country } = identify({ ...input, installationId })
      const ip = canonicalSmsIp(input.ipAddress)
      if (!ip) throw new Error("Invalid SMS gate input")
      return transaction(async (db, now) => {
        const market = (await db.query("SELECT enabled, price_valid_until FROM blumi_sms_country_policy WHERE country = $1", [country])).rows[0]
        if (market?.enabled !== true || !(market.price_valid_until instanceof Date) || market.price_valid_until <= now) {
          throw new Error("SMS gate unavailable")
        }
        const installation = (await db.query("SELECT platform FROM blumi_sms_installations WHERE installation_key = $1", [installationKey])).rows[0]
        // Android IDs are server-minted and persisted once by the app. A client
        // cannot invent a different ID to reset the same registered budget.
        if (input.platform === "android" && input.installationId && !installation) throw new Error("SMS gate unavailable")
        const stats = (await db.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE ip_key = $1)::int AS ip_count,
          count(*) FILTER (WHERE installation_key = $2)::int AS installation_count
          FROM blumi_sms_device_challenges WHERE created_at > $3`,
          [hash("ip", ip), installationKey, new Date(now.getTime() - 900_000)])).rows[0]
        if (stats.total >= 300 || stats.ip_count >= 20 || stats.installation_count >= 6) throw new Error("SMS gate limit")
        const spent = (await db.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits WHERE installation_key = $1 AND created_at > $2",
          [installationKey, new Date(now.getTime() - 86_400_000)])).rows[0]
        if (spent.total >= 3) throw new Error("SMS device limit")
        if (input.platform === "android" && !installation) {
          await db.query("INSERT INTO blumi_sms_installations (installation_key, platform, created_at) VALUES ($1, 'android', $2)", [installationKey, now])
        }
        const challenge = randomBytes(32).toString("base64url")
        await db.query(`INSERT INTO blumi_sms_device_challenges
          (challenge_key, installation_key, phone_key, ip_key, platform, created_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [hash("challenge", challenge), installationKey,
          phoneKey, hash("ip", ip), input.platform, now, new Date(now.getTime() + 120_000)])
        await db.query("SELECT blumi_sms_prune_expired()")
        return { challenge, installationId, registrationRequired: !installation,
          expiresAt: new Date(now.getTime() + 120_000).toISOString() }
      })
    },
    async permit(input: { platform: SmsPlatform; installationId: string; challenge: string; phoneNumber: string; proof: string }) {
      const { installationKey, phoneKey } = identify(input)
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.challenge) || typeof input.proof !== "string" ||
        input.proof.length < 1 || input.proof.length > 130_000) throw new Error("Invalid SMS gate input")
      const challengeKey = hash("challenge", input.challenge)
      // Claim exactly once before external attestation verification. No network
      // call holds the shared SMS lock. A failed proof burns this challenge.
      const context = await transaction(async (db, now) => {
        const claimed = await db.query(`UPDATE blumi_sms_device_challenges SET consumed_at = $4
          WHERE challenge_key = $1 AND installation_key = $2 AND phone_key = $3 AND platform = $5
            AND consumed_at IS NULL AND expires_at > $4 RETURNING expires_at`,
          [challengeKey, installationKey, phoneKey, now, input.platform])
        if (claimed.rowCount !== 1) throw new Error("SMS challenge rejected")
        const device = (await db.query("SELECT * FROM blumi_sms_installations WHERE installation_key = $1", [installationKey])).rows[0]
        return { now: now.getTime(), expiresAt: claimed.rows[0].expires_at as Date,
          publicKey: device?.public_key ?? null, signCount: Number(device?.sign_count ?? 0), existed: Boolean(device) }
      })
      const payload = smsDevicePayload(options.projectId, input.platform, input.installationId, input.challenge, input.phoneNumber)
      const proof = await options.verifyProof({ ...input, payload, publicKey: context.publicKey,
        signCount: context.signCount, now: context.now })
      return transaction(async (db, now) => {
        if (context.expiresAt <= now || !Number.isSafeInteger(proof.signCount) || proof.signCount < 0 ||
          (input.platform === "ios" && (typeof proof.publicKey !== "string" || proof.publicKey.length > 2048))) {
          throw new Error("SMS proof rejected")
        }
        const existing = (await db.query("SELECT * FROM blumi_sms_installations WHERE installation_key = $1", [installationKey])).rows[0]
        if (input.platform === "ios") {
          if (!context.existed) {
            if (existing || proof.signCount !== 0) throw new Error("SMS proof rejected")
            await db.query(`INSERT INTO blumi_sms_installations
              (installation_key, platform, public_key, sign_count, created_at) VALUES ($1, 'ios', $2, 0, $3)`,
              [installationKey, proof.publicKey, now])
          } else {
            if (!existing || proof.publicKey !== existing.public_key || proof.signCount <= Number(existing.sign_count)) {
              throw new Error("SMS proof rejected")
            }
            await db.query("UPDATE blumi_sms_installations SET sign_count = $2 WHERE installation_key = $1", [installationKey, proof.signCount])
          }
        } else if (!existing || existing.platform !== "android" || proof.publicKey !== null) throw new Error("SMS proof rejected")
        const recent = (await db.query(`SELECT count(*)::int AS total, max(created_at) AS latest,
          count(*) FILTER (WHERE phone_key = $3 AND consumed_at IS NULL AND expires_at > $4)::int AS active_phone
          FROM blumi_sms_device_permits WHERE installation_key = $1 AND created_at > $2`,
          [installationKey, new Date(now.getTime() - 86_400_000), phoneKey, now])).rows[0]
        if (recent.total >= 3) throw new Error("SMS device limit")
        if (recent.latest instanceof Date && now.getTime() - recent.latest.getTime() < 60_000) throw new Error("SMS device cooldown")
        const active = await db.query("SELECT 1 FROM blumi_sms_device_permits WHERE phone_key = $1 AND consumed_at IS NULL AND expires_at > $2", [phoneKey, now])
        if (active.rowCount) throw new Error("SMS phone cooldown")
        const expires = new Date(now.getTime() + 60_000)
        await db.query(`INSERT INTO blumi_sms_device_permits
          (challenge_key, installation_key, phone_key, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)`,
          [challengeKey, installationKey, phoneKey, now, expires])
        return { expiresAt: expires.toISOString() }
      })
    }
  }
}

export function smsRequestHash(payload: string): string {
  return createHash("sha256").update(payload).digest("base64url")
}
