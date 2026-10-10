import { createHmac } from "node:crypto"
import type { Pool } from "pg"
import type { FirebasePhoneIdentity } from "./firebaseAuth"
import type { AfterResponseTasks } from "../operations/afterResponseTasks"
import { SMS_ADMISSION_MIGRATION_ID, smsDestinationCountry } from "./firebaseSmsAdmission"

/** Only server-verified Firebase phone identities call this observer. A
 * completion means a verified phone login was observed, not delivery proof. */
export function createSmsOutcomeObserver(options: {
  pool: Pool; projectId: string; hmacSecret: string; expectedMigrationChecksum: string
}) {
  if (Buffer.byteLength(options.hmacSecret) < 32 || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(options.projectId) ||
    !/^[0-9a-f]{64}$/.test(options.expectedMigrationChecksum)) throw new Error("Invalid SMS observer configuration")
  const hash = (scope: string, value: string) => createHmac("sha256", options.hmacSecret)
    .update(JSON.stringify(["blumi-sms-v1", options.projectId, scope, value])).digest("hex")
  return async (input: { resource: string; eventId: string; timestamp: string; providerId: string; phoneNumber: string }) => {
    const timestamp = Date.parse(input.timestamp)
    if (input.resource !== `projects/${options.projectId}` || input.providerId !== "phone" ||
      typeof input.eventId !== "string" || !input.eventId.length || input.eventId.length > 256 ||
      !Number.isFinite(timestamp) || !smsDestinationCountry(input.phoneNumber)) return false
    const db = await options.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SET LOCAL ROLE blumi_sms_observer")
      await db.query("SET LOCAL statement_timeout = '2500ms'")
      await db.query("SET LOCAL lock_timeout = '1000ms'")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["blumi:sms-admission:v1"])
      const schema = (await db.query("SELECT checksum FROM blumi_migrations WHERE id = $1", [SMS_ADMISSION_MIGRATION_ID])).rows[0]
      if (schema?.checksum?.trim() !== options.expectedMigrationChecksum) throw new Error("SMS observer schema unavailable")
      const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0]?.now
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("SMS observer unavailable")
      if (timestamp > now.getTime() + 30_000 || timestamp < now.getTime() - 300_000) {
        await db.query("ROLLBACK"); return false
      }
      const key = hash("verification", input.eventId)
      if ((await db.query("SELECT 1 FROM blumi_sms_send_admissions WHERE verification_key = $1", [key])).rowCount) {
        await db.query("ROLLBACK"); return false
      }
      // Always choose the latest send before the signed login time, including
      // an already-marked one. A second event must never credit an older SMS.
      const updated = await db.query(`UPDATE blumi_sms_send_admissions SET verified_at = $4, verification_key = $5
        WHERE event_key = (SELECT event_key FROM blumi_sms_send_admissions
          WHERE phone_key = $1 AND admitted_at >= $2 AND admitted_at <= $3
          ORDER BY admitted_at DESC, event_key DESC LIMIT 1) AND verified_at IS NULL`,
        [hash("phone", input.phoneNumber), new Date(timestamp - 600_000), new Date(timestamp + 1000), now, key])
      await db.query("COMMIT")
      return updated.rowCount === 1
    } catch (error) {
      try { await db.query("ROLLBACK") } catch { /* No credit on failure. */ }
      throw error
    } finally { db.release() }
  }
}

/** Bounded background work: no optional statistics dependency in login's
 * response path. Refreshing a token preserves authTime and cannot mint credit. */
export function createPhoneOutcomeReporter(options: {
  projectId: string; tasks: AfterResponseTasks
  record: ReturnType<typeof createSmsOutcomeObserver>
}) {
  let pending = 0
  return (identity: FirebasePhoneIdentity) => {
    if (pending >= 2) return
    pending++
    options.tasks.run("sms-verification-outcome", async () => {
      try {
        await options.record({ resource: `projects/${options.projectId}`, providerId: "phone",
          phoneNumber: identity.phoneNumber, eventId: JSON.stringify([identity.uid, identity.authTime]),
          timestamp: new Date(identity.authTime * 1000).toISOString() })
      } finally { pending-- }
    })
  }
}
