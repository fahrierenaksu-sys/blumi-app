import type { Pool } from "pg"

export type AnalyticsPeriod = "24h" | "7d" | "30d"

export interface AdminAnalyticsSnapshot {
  generatedAt: string
  activityUpdatedAt: string | null
  safetyUpdatedAt: string | null
  period: AnalyticsPeriod
  environment: string
  online: { users: number; connections: number; scope: "this-instance" }
  activity: {
    registrations: number
    matches: number
    messages: number
    roomInvites: number
    roomJoins: number
    shopTransactions: number
    purchaseCredits: number
    purchaseReversals: number
  } | null
  safety: { pending: number; overdue: number; oldestPendingAt: string | null; blocks: number } | null
  funnel: { registered: number; profileComplete: number; discovered: number; matched: number; messaged: number; invited: number; joined: number } | null
  trend: readonly { day: string; registrations: number; matches: number; messages: number }[] | null
  unavailable: readonly string[]
}

export interface AdminAnalyticsService {
  snapshot(period: AnalyticsPeriod, online: { users: number; connections: number }): Promise<AdminAnalyticsSnapshot>
}

const INTERVALS: Record<AnalyticsPeriod, string> = {
  "24h": "24 hours", "7d": "7 days", "30d": "30 days"
}
const HEAVY_CACHE_MS = 5 * 60 * 1000
const BUCKETS: Record<AnalyticsPeriod, { count: number; seconds: number }> = {
  "24h": { count: 24, seconds: 60 * 60 },
  "7d": { count: 7, seconds: 24 * 60 * 60 },
  "30d": { count: 30, seconds: 24 * 60 * 60 }
}

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod | null {
  return value === undefined ? "7d" : value === "24h" || value === "7d" || value === "30d" ? value : null
}

export function createAdminAnalyticsService(options: {
  pool?: Pool
  environment: string
  now?: () => Date
}): AdminAnalyticsService {
  const now = options.now ?? (() => new Date())
  const pool = options.pool
  type HeavySnapshot = Pick<AdminAnalyticsSnapshot, "activity" | "funnel" | "trend"> & { updatedAt: string }
  const heavyCache = new Map<AnalyticsPeriod, HeavySnapshot>()
  const heavyInFlight = new Map<AnalyticsPeriod, Promise<HeavySnapshot>>()
  return {
    async snapshot(period, onlineCounts) {
      const generatedAt = now().toISOString()
      const online = { ...onlineCounts, scope: "this-instance" as const }
      const base = { generatedAt, period, environment: options.environment, online }
      const unavailable = ["activeWindows", "retention", "otpSuccess", "apiLatency", "providerCosts", "deployStatus"]
      if (!pool) return { ...base, activityUpdatedAt: null, safetyUpdatedAt: null, activity: null, safety: null, funnel: null, trend: null, unavailable: [...unavailable, "databaseMetrics"] }

      const interval = INTERVALS[period]
      const cached = heavyCache.get(period)
      let heavyPromise = cached && Date.parse(generatedAt) - Date.parse(cached.updatedAt) < HEAVY_CACHE_MS
        ? Promise.resolve(cached)
        : heavyInFlight.get(period)
      if (!heavyPromise) {
        heavyPromise = (async (): Promise<HeavySnapshot> => {
          const updatedAt = now().toISOString()
          const [activityResult, funnelResult, trendResult] = await Promise.all([
        pool.query(`SELECT
          (SELECT count(*) FROM blumi_accounts WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz) AS registrations,
          (SELECT count(*) FROM blumi_matches WHERE matched_at >= $1::timestamptz - $2::interval AND matched_at < $1::timestamptz) AS matches,
          (SELECT count(*) FROM blumi_chat_messages WHERE sent_at >= $1::timestamptz - $2::interval AND sent_at < $1::timestamptz) AS messages,
          (SELECT count(*) FROM blumi_mini_room_invites WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz AND source_thread_id IS NOT NULL) AS "roomInvites",
          (SELECT count(*) FROM blumi_mini_rooms WHERE started_at >= $1::timestamptz - $2::interval AND started_at < $1::timestamptz AND source_thread_id IS NOT NULL) AS "roomJoins",
          (SELECT count(*) FROM blumi_store_transactions WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz) AS "shopTransactions",
          (SELECT count(*) FROM blumi_economy_iap_ledger WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz AND entry_type = 'credit') AS "purchaseCredits",
          (SELECT count(*) FROM blumi_economy_iap_ledger WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz AND entry_type = 'reversal') AS "purchaseReversals"`, [updatedAt, interval]),
        pool.query(`WITH cohort AS (
          SELECT user_id, onboarding_profile_complete FROM blumi_accounts
          WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz
        ) SELECT count(*) AS registered,
          count(*) FILTER (WHERE onboarding_profile_complete) AS "profileComplete",
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM blumi_discovery_decisions d WHERE d.from_user_id = cohort.user_id AND d.decided_at >= $1::timestamptz - $2::interval AND d.decided_at < $1::timestamptz)) AS discovered,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM blumi_matches m WHERE (m.participant_a_user_id = cohort.user_id OR m.participant_b_user_id = cohort.user_id) AND m.matched_at >= $1::timestamptz - $2::interval AND m.matched_at < $1::timestamptz)) AS matched,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM blumi_chat_messages c WHERE c.sender_user_id = cohort.user_id AND c.sent_at >= $1::timestamptz - $2::interval AND c.sent_at < $1::timestamptz)) AS messaged,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM blumi_mini_room_invites i WHERE i.sender_user_id = cohort.user_id AND i.source_thread_id IS NOT NULL AND i.created_at >= $1::timestamptz - $2::interval AND i.created_at < $1::timestamptz)) AS invited,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM blumi_mini_rooms r WHERE (r.participant_a_user_id = cohort.user_id OR r.participant_b_user_id = cohort.user_id) AND r.source_thread_id IS NOT NULL AND r.started_at >= $1::timestamptz - $2::interval AND r.started_at < $1::timestamptz)) AS joined
          FROM cohort`, [updatedAt, interval]),
        pool.query(`WITH events AS (
          SELECT created_at AS event_at, 'registration' AS kind FROM blumi_accounts WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz
          UNION ALL SELECT matched_at, 'match' FROM blumi_matches WHERE matched_at >= $1::timestamptz - $2::interval AND matched_at < $1::timestamptz
          UNION ALL SELECT sent_at, 'message' FROM blumi_chat_messages WHERE sent_at >= $1::timestamptz - $2::interval AND sent_at < $1::timestamptz
        ), grouped AS (
          SELECT floor(extract(epoch FROM event_at - ($1::timestamptz - $2::interval)) / $3::integer)::integer AS bucket,
            count(*) FILTER (WHERE kind = 'registration') AS registrations,
            count(*) FILTER (WHERE kind = 'match') AS matches,
            count(*) FILTER (WHERE kind = 'message') AS messages
          FROM events GROUP BY 1
        ) SELECT ($1::timestamptz - $2::interval + buckets.bucket * $3::integer * interval '1 second') AS day,
          coalesce(grouped.registrations, 0) AS registrations, coalesce(grouped.matches, 0) AS matches,
          coalesce(grouped.messages, 0) AS messages
          FROM generate_series(0, $4::integer - 1) AS buckets(bucket)
          LEFT JOIN grouped ON grouped.bucket = buckets.bucket ORDER BY buckets.bucket`,
          [updatedAt, interval, BUCKETS[period].seconds, BUCKETS[period].count])
      ])
          const counts = (row: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, Number(row[key] ?? 0)]))
          const activity = counts(activityResult.rows[0], ["registrations", "matches", "messages", "roomInvites", "roomJoins", "shopTransactions", "purchaseCredits", "purchaseReversals"]) as unknown as NonNullable<AdminAnalyticsSnapshot["activity"]>
          const funnel = counts(funnelResult.rows[0], ["registered", "profileComplete", "discovered", "matched", "messaged", "invited", "joined"]) as unknown as NonNullable<AdminAnalyticsSnapshot["funnel"]>
          const trend = trendResult.rows.map((row) => ({ day: new Date(row.day).toISOString(), registrations: Number(row.registrations), matches: Number(row.matches), messages: Number(row.messages) }))
          const result = { updatedAt, activity, funnel, trend }
          heavyCache.set(period, result)
          return result
        })()
        heavyInFlight.set(period, heavyPromise)
        void heavyPromise.finally(() => heavyInFlight.delete(period)).catch(() => {})
      }
      const safetyPromise = pool.query(`SELECT
        (SELECT count(*) FROM blumi_safety_reports WHERE status = 'pending') AS pending,
        (SELECT count(*) FROM blumi_safety_reports WHERE status = 'pending' AND created_at < $1::timestamptz - interval '4 hours') AS overdue,
        (SELECT min(created_at) FROM blumi_safety_reports WHERE status = 'pending') AS oldest_pending_at,
        (SELECT count(*) FROM blumi_safety_blocks WHERE created_at >= $1::timestamptz - $2::interval AND created_at < $1::timestamptz) AS blocks`, [generatedAt, interval])
      const [heavy, safetyResult] = await Promise.all([heavyPromise, safetyPromise])
      const safetyRow = safetyResult.rows[0]
      const safety = {
        pending: Number(safetyRow.pending), overdue: Number(safetyRow.overdue),
        oldestPendingAt: safetyRow.oldest_pending_at ? new Date(safetyRow.oldest_pending_at).toISOString() : null,
        blocks: Number(safetyRow.blocks)
      }
      return { ...base, activityUpdatedAt: heavy.updatedAt, safetyUpdatedAt: generatedAt,
        activity: heavy.activity, safety, funnel: heavy.funnel, trend: heavy.trend, unavailable }
    }
  }
}
