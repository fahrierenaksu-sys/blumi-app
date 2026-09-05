import { createHash } from "node:crypto"

export interface RateBudgetResult { allowed: boolean; retryAfterSeconds: number }
export interface SharedRateBudget {
  consumeUser(userId: string): Promise<RateBudgetResult>
  purgeExpired(): Promise<void>
}
export const USER_REQUESTS_PER_MINUTE = 100
const WINDOW_MS = 60_000

export function userBudgetKey(userId: string): string {
  return createHash("sha256").update(`http-user:${userId}`).digest("hex")
}

export function createInMemoryRateBudget(now: () => number = Date.now): SharedRateBudget {
  const budgets = new Map<string, { window: number; count: number }>()
  return {
    async consumeUser(userId) {
      const time = now(), observedWindow = Math.floor(time / WINDOW_MS) * WINDOW_MS, key = userBudgetKey(userId)
      const current = budgets.get(key)
      const window = Math.max(current?.window ?? observedWindow, observedWindow)
      const count = current?.window === window ? Math.min(current.count + 1, USER_REQUESTS_PER_MINUTE + 1) : 1
      budgets.set(key, { window, count })
      return { allowed: count <= USER_REQUESTS_PER_MINUTE, retryAfterSeconds: Math.min(60, Math.max(1, Math.ceil((window + WINDOW_MS - time) / 1000))) }
    },
    async purgeExpired() {
      const time = now()
      for (const [key, value] of budgets) if (value.window + WINDOW_MS <= time) budgets.delete(key)
    }
  }
}

interface BudgetExecutor { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

export function createPostgresRateBudget(pool: BudgetExecutor): SharedRateBudget {
  return {
    async consumeUser(userId) {
      const result = await pool.query(
        `WITH clock AS (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms),
         bucket AS (SELECT (now_ms / $2::bigint) * $2::bigint AS started, now_ms FROM clock)
         INSERT INTO blumi_shared_rate_budgets (budget_key, window_started_ms, request_count)
         SELECT $1, started, 1 FROM bucket
         ON CONFLICT (budget_key) DO UPDATE SET
           window_started_ms = GREATEST(blumi_shared_rate_budgets.window_started_ms, EXCLUDED.window_started_ms),
           request_count = CASE WHEN blumi_shared_rate_budgets.window_started_ms >= EXCLUDED.window_started_ms
             THEN LEAST(blumi_shared_rate_budgets.request_count + 1, $3::int + 1) ELSE 1 END
         RETURNING request_count <= $3 AS allowed,
           LEAST(60, GREATEST(1, ceil((window_started_ms + $2 - (SELECT now_ms FROM bucket)) / 1000.0)))::int AS retry_after_seconds`,
        [userBudgetKey(userId), WINDOW_MS, USER_REQUESTS_PER_MINUTE]
      )
      const row = result.rows[0]
      if (!row || typeof row.allowed !== "boolean") throw new Error("Shared request budget unavailable")
      return { allowed: row.allowed, retryAfterSeconds: Number(row.retry_after_seconds) }
    },
    async purgeExpired() {
      await pool.query(`WITH expired AS (
        SELECT budget_key FROM blumi_shared_rate_budgets
        WHERE window_started_ms < floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint - $1
        ORDER BY window_started_ms LIMIT 500 FOR UPDATE SKIP LOCKED
      ) DELETE FROM blumi_shared_rate_budgets WHERE budget_key IN (SELECT budget_key FROM expired)`, [WINDOW_MS])
    }
  }
}
