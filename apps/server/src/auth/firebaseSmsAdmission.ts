import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { parsePhoneNumberFromString } from "libphonenumber-js/max"
import type { Pool } from "pg"

export const SMS_ADMISSION_MIGRATION_ID = "072_firebase_sms_admission.sql"
export const SMS_PHONE_COOLDOWN_MS = 60_000
export const SMS_PHONE_REQUESTS_PER_DAY = 3
const DAY_MS = 86_400_000
const EVENT_MAX_AGE_MS = 300_000

export interface SmsAdmissionEvent {
  eventId: string
  resource: string
  timestamp: string
  smsType: string
  phoneNumber: string
  ipAddress: string
}

export type SmsAdmissionResult = {
  allowed: boolean
  reason: "admitted" | "invalid_event" | "disabled" | "replay" | "phone_cooldown" |
    "phone_limit" | "ip_limit" | "project_limit" | "project_burst_limit" |
    "country_unavailable" | "country_limit" | "country_cost_limit" | "daily_cost_limit" | "monthly_cost_limit" |
    "device_permit_required"
}

/** Called only inside Firebase's signed beforeSmsSent trigger, never a public API. */
export function createPostgresSmsAdmission(options: {
  pool: Pool
  hmacSecret: string
  projectId: string
  expectedMigrationChecksum: string
}): (event: SmsAdmissionEvent) => Promise<SmsAdmissionResult> {
  if (Buffer.byteLength(options.hmacSecret, "utf8") < 32 ||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(options.projectId) ||
    !/^[0-9a-f]{64}$/.test(options.expectedMigrationChecksum)) {
    throw new Error("SMS admission configuration is invalid.")
  }
  const digest = (scope: string, value: string): string => createHmac("sha256", options.hmacSecret)
    .update(JSON.stringify(["blumi-sms-v1", options.projectId, scope, value])).digest("hex")
  const refuse = (reason: SmsAdmissionResult["reason"]): SmsAdmissionResult => ({ allowed: false, reason })

  return async (event) => {
    const ip = canonicalSmsIp(event.ipAddress)
    const issuedAt = Date.parse(event.timestamp)
    if (!ip || event.resource !== `projects/${options.projectId}` ||
      event.smsType !== "SIGN_IN_OR_SIGN_UP" ||
      typeof event.eventId !== "string" || event.eventId.length === 0 || event.eventId.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(event.eventId) ||
      !/^\+[1-9]\d{7,14}$/.test(event.phoneNumber) || !Number.isFinite(issuedAt)) {
      return refuse("invalid_event")
    }
    const phoneKey = digest("phone", event.phoneNumber)
    const country = smsDestinationCountry(event.phoneNumber)
    if (!country) return refuse("country_unavailable")
    const ipKey = digest("ip", ip)
    const eventKey = digest("event", event.eventId)
    const client = await options.pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("SET LOCAL statement_timeout = '2500ms'")
      await client.query("SET LOCAL lock_timeout = '1000ms'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '4000ms'")
      // Missing schema/config is an error, never permission. One project lock
      // serializes reservation across instances and all phones/IPs/flows.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        "blumi:sms-admission:v1"
      ])
      const migration = (await client.query("SELECT checksum FROM blumi_migrations WHERE id = $1", [
        SMS_ADMISSION_MIGRATION_ID
      ])).rows[0]
      if (migration?.checksum?.trim() !== options.expectedMigrationChecksum) {
        throw new Error("SMS admission schema is unavailable.")
      }
      const config = (await client.query(
        // The restricted function role can read policy, never update it.
        // Operators acquire the same advisory lock before changing policy.
        "SELECT * FROM blumi_sms_admission_config WHERE singleton = true"
      )).rows[0]
      if (!config || config.enabled !== true) {
        await client.query("ROLLBACK")
        return refuse("disabled")
      }
      const limits = [config.ip_limit_15_minutes, config.ip_limit_24_hours,
        config.project_limit_24_hours, config.project_limit_15_minutes]
      if (!limits.every(value => Number.isSafeInteger(value) && value > 0 && value <= 1500)) {
        throw new Error("SMS admission configuration is invalid.")
      }
      const clock = (await client.query("SELECT clock_timestamp() AS now")).rows[0]?.now
      if (!(clock instanceof Date) || !Number.isFinite(clock.getTime())) {
        throw new Error("SMS admission clock is unavailable.")
      }
      // The provider timestamp is checked for freshness; it never sets budgets.
      const time = clock.getTime()
      const monthKey = clock.toISOString().slice(0, 7)
      const openingCost = readMicroUsd(config.opening_cost_microusd)
      if (typeof config.opening_month_utc !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(config.opening_month_utc) ||
        config.opening_month_utc > monthKey || openingCost === null) {
        throw new Error("SMS admission opening balance is unavailable.")
      }
      if (issuedAt > time + 30_000 || issuedAt < time - EVENT_MAX_AGE_MS) {
        await client.query("ROLLBACK")
        return refuse("invalid_event")
      }
      const market = (await client.query(
        "SELECT * FROM blumi_sms_country_policy WHERE country = $1", [country]
      )).rows[0]
      // A price listing is not permission. Unknown/expired markets fail closed.
      if (!market || market.enabled !== true || !(market.price_valid_until instanceof Date) ||
        market.price_valid_until.getTime() <= time) {
        await client.query("ROLLBACK")
        return refuse("country_unavailable")
      }
      const dailyCostLimit = readMicroUsd(config.cost_limit_24_hours_microusd)
      const monthlyCostLimit = readMicroUsd(config.cost_limit_month_microusd)
      const price = readMicroUsd(market.price_microusd, 10_000_000n)
      const countryCostLimit = readMicroUsd(market.cost_limit_24_hours_microusd)
      if (!Number.isSafeInteger(market.limit_24_hours) || market.limit_24_hours < 1 ||
        market.limit_24_hours > 1500 || dailyCostLimit === null || monthlyCostLimit === null ||
        price === null || price === 0n || countryCostLimit === null || countryCostLimit === 0n) {
        throw new Error("SMS admission pricing is invalid.")
      }
      const duplicate = await client.query(
        "SELECT 1 FROM blumi_sms_send_admissions WHERE event_key = $1", [eventKey]
      )
      if (duplicate.rowCount) {
        await client.query("ROLLBACK")
        return refuse("replay")
      }
      const daily = new Date(time - DAY_MS)
      const month = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1))
      const recent = (await client.query(
        `SELECT count(*) FILTER (WHERE admitted_at > $4)::int AS project_count,
          count(*) FILTER (WHERE admitted_at > $3)::int AS project_short_count,
          count(*) FILTER (WHERE phone_key = $1 AND admitted_at > $4)::int AS phone_count,
          max(admitted_at) FILTER (WHERE phone_key = $1 AND admitted_at > $4) AS phone_latest,
          count(*) FILTER (WHERE ip_key = $2 AND admitted_at > $4)::int AS ip_day_count,
          count(*) FILTER (WHERE ip_key = $2 AND admitted_at > $3)::int AS ip_short_count,
          count(*) FILTER (WHERE country = $6 AND admitted_at > $4)::int AS country_count,
          coalesce(sum(charge_microusd) FILTER (WHERE admitted_at > $4), 0)::text AS day_cost,
          coalesce(sum(charge_microusd) FILTER (WHERE admitted_at >= $5), 0)::text AS month_cost,
          coalesce(sum(charge_microusd) FILTER (WHERE country = $6 AND admitted_at > $4), 0)::text AS country_cost
         FROM blumi_sms_send_admissions WHERE admitted_at >= $7`,
        [phoneKey, ipKey, new Date(time - 900_000), daily, month, country,
          new Date(Math.min(daily.getTime(), month.getTime()))]
      )).rows[0]
      if (!recent) throw new Error("SMS admission budget is unavailable.")
      const dayCost = readMicroUsd(recent.day_cost)
      const monthCost = readMicroUsd(recent.month_cost)
      const countryCost = readMicroUsd(recent.country_cost)
      if (dayCost === null || monthCost === null || countryCost === null) {
        throw new Error("SMS admission pricing is invalid.")
      }
      let reason: SmsAdmissionResult["reason"] | undefined
      if (monthCost + price + (config.opening_month_utc === monthKey ? openingCost : 0n) > monthlyCostLimit) reason = "monthly_cost_limit"
      else if (dayCost + price > dailyCostLimit) reason = "daily_cost_limit"
      else if (countryCost + price > countryCostLimit) reason = "country_cost_limit"
      else if (recent.project_count >= config.project_limit_24_hours) reason = "project_limit"
      else if (recent.project_short_count >= config.project_limit_15_minutes) reason = "project_burst_limit"
      else if (recent.country_count >= market.limit_24_hours) reason = "country_limit"
      else if (recent.ip_day_count >= config.ip_limit_24_hours ||
        recent.ip_short_count >= config.ip_limit_15_minutes) reason = "ip_limit"
      else if (recent.phone_count >= SMS_PHONE_REQUESTS_PER_DAY) reason = "phone_limit"
      else if (recent.phone_latest instanceof Date &&
        time - recent.phone_latest.getTime() < SMS_PHONE_COOLDOWN_MS) reason = "phone_cooldown"
      if (reason) {
        await client.query("ROLLBACK")
        return refuse(reason)
      }
      // Firebase exposes the destination, not our installation proof. Require
      // a short-lived, destination-bound permit issued by the attested gate.
      // This does not attest the SDK caller itself; a race can consume the
      // intended phone's permit, but cannot authorize a different destination
      // or create another paid send without another budgeted device permit.
      const permit = (await client.query(
        `SELECT challenge_key FROM blumi_sms_device_permits
         WHERE phone_key = $1 AND consumed_at IS NULL AND expires_at > $2
         ORDER BY created_at LIMIT 1`, [phoneKey, clock]
      )).rows[0]
      if (!permit) {
        await client.query("ROLLBACK")
        return refuse("device_permit_required")
      }
      const consumed = await client.query(
        "UPDATE blumi_sms_device_permits SET consumed_at = $2 WHERE challenge_key = $1 AND consumed_at IS NULL",
        [permit.challenge_key, clock]
      )
      if (consumed.rowCount !== 1) throw new Error("SMS admission permit is unavailable.")
      // Reserve before the provider sends. A delivery failure is not refunded:
      // retry storms must never reopen a budget or create unbounded billing.
      await client.query(
        "INSERT INTO blumi_sms_send_admissions (event_key, phone_key, ip_key, admitted_at, country, charge_microusd) VALUES ($1, $2, $3, $4, $5, $6)",
        [eventKey, phoneKey, ipKey, clock, country, price.toString()]
      )
      await client.query("SELECT blumi_sms_prune_expired()")
      await client.query("COMMIT")
      return { allowed: true, reason: "admitted" }
    } catch (error) {
      try { await client.query("ROLLBACK") } catch { /* The caller still blocks SMS. */ }
      throw error
    } finally {
      client.release()
    }
  }
}

// Shared country calling codes (notably +1) must use full phone metadata;
// the client never supplies the country or price used to debit the budget.
export function smsDestinationCountry(phone: string): string | null {
  try {
    const parsed = parsePhoneNumberFromString(phone)
    return parsed?.number === phone && parsed.isPossible() && parsed.country ? parsed.country : null
  } catch { return null }
}

function readMicroUsd(value: unknown, max = 10_000_000_000n): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,10})$/.test(value)) return null
  const amount = BigInt(value)
  return amount <= max ? amount : null
}

/** Collapse IPv4-mapped addresses and IPv6 /64s: address rotation is not a new budget. */
export function canonicalSmsIp(address: string): string | null {
  const version = isIP(address)
  if (version === 4) return address
  if (version !== 6 || address.includes("%")) return null
  let normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  if (normalized.startsWith("::ffff:")) {
    const tail = normalized.slice(7).split(":")
    if (tail.length === 2) {
      const value = parseInt(tail[0]!, 16) * 65_536 + parseInt(tail[1]!, 16)
      return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join(".")
    }
  }
  const [left, right] = normalized.split("::")
  const first = left ? left.split(":") : []
  const last = right ? right.split(":") : []
  const groups = normalized.includes("::")
    ? [...first, ...Array(8 - first.length - last.length).fill("0"), ...last]
    : first
  normalized = groups.slice(0, 4).map(group => group.padStart(4, "0")).join(":")
  return `${normalized}::/64`
}
