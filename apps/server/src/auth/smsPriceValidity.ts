import type { Pool } from "pg"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"

const DAY_MS = 86_400_000
/** Warn this long before the earliest enabled SMS price stops being valid. */
export const SMS_PRICE_WARNING_MS = 7 * DAY_MS
export const SMS_PRICE_CHECK_INTERVAL_MS = 3_600_000

/**
 * `expired` and `no_enabled_country` mean SMS sign-in is already refused for
 * at least one market (2026-10-17: every price expired and nobody noticed).
 */
export type SmsPriceValidityState =
  "unchecked" | "ok" | "expiring" | "expired" | "no_enabled_country" | "unavailable"

export interface SmsPriceValidity {
  state: SmsPriceValidityState
  /** Whole days until the earliest enabled price expires; null when unknown. */
  daysLeft: number | null
}

export interface SmsPriceValiditySnapshot {
  earliestValidUntil: Date | null
  now: Date
}

export function classifySmsPriceValidity(snapshot: SmsPriceValiditySnapshot): SmsPriceValidity {
  const { earliestValidUntil, now } = snapshot
  if (earliestValidUntil === null) return { state: "no_enabled_country", daysLeft: null }
  const remainingMs = earliestValidUntil.getTime() - now.getTime()
  if (!Number.isFinite(remainingMs)) return { state: "unavailable", daysLeft: null }
  if (remainingMs <= 0) return { state: "expired", daysLeft: 0 }
  const daysLeft = Math.floor(remainingMs / DAY_MS)
  return { state: remainingMs < SMS_PRICE_WARNING_MS ? "expiring" : "ok", daysLeft }
}

/** Reads with the database clock, the same clock the SMS gate refuses by. */
export function createPostgresSmsPriceValidityReader(pool: Pick<Pool, "query">) {
  return async (): Promise<SmsPriceValiditySnapshot> => {
    const row = (await pool.query(`SELECT min(price_valid_until) AS earliest, clock_timestamp() AS now
      FROM blumi_sms_country_policy WHERE enabled = true`)).rows[0]
    if (!row || !(row.now instanceof Date) || (row.earliest !== null && !(row.earliest instanceof Date))) {
      throw new Error("SMS price validity is unreadable")
    }
    return { earliestValidUntil: row.earliest, now: row.now }
  }
}

export type SmsPriceValidityLog = (level: "warn" | "error", line: string) => void

export interface SmsPriceValidityMonitor {
  current(): SmsPriceValidity
  check(): Promise<SmsPriceValidity>
}

/** Logs one fixed-shape JSON line per check while sign-in is at risk; never country, price or IDs. */
export function createSmsPriceValidityMonitor(options: {
  read: () => Promise<SmsPriceValiditySnapshot>
  log: SmsPriceValidityLog
}): SmsPriceValidityMonitor {
  let current: SmsPriceValidity = { state: "unchecked", daysLeft: null }
  return {
    current: () => current,
    async check() {
      let errorKind: string | undefined
      try {
        current = classifySmsPriceValidity(await options.read())
      } catch (error) {
        errorKind = safeOperationalErrorKind(error)
        current = { state: "unavailable", daysLeft: null }
      }
      if (current.state !== "ok") {
        options.log(current.state === "expiring" ? "warn" : "error", JSON.stringify({
          event: "blumi_sms_price_validity", ...current, ...(errorKind ? { errorKind } : {})
        }))
      }
      return current
    }
  }
}
