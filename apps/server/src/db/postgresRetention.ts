/**
 * Retention for finished work and operational audit rows that nothing reads
 * after their window. Nothing here holds user content or an idempotency key:
 * - blumi_chat_delivery_outbox: a completed job is the tombstone that stops an
 *   idempotent client resend from delivering the message twice
 *   (ON CONFLICT (message_id) DO NOTHING), so it is kept 30 days, far beyond
 *   any client retry. The message row itself is never touched.
 * - blumi_push_receipts: only receipts with an outcome; open ones are work.
 * - blumi_push_delivery_audit, blumi_notification_policy_audit: operational
 *   audit, 30 days.
 * - blumi_notification_policy_events, 'message' and 'like' claims only, 30
 *   days (2026-10-02). Each pushed chat message added one row per recipient
 *   forever. Their keys are unique per event (message id, anonymous like id),
 *   so a claim is only needed for the producer's retry window and the
 *   one-hour frequency cap; 30 days matches the chat outbox tombstone.
 *   'match' and 'discovery_watch' claims stay permanent (migration 036).
 *   No index serves this global time scan yet; at today's size a scan every
 *   ten minutes is cheap. The next migration should add
 *   (created_at) WHERE notification_type IN ('message', 'like').
 */
export const RETENTION_POLICIES = Object.freeze([
  { table: "blumi_chat_delivery_outbox", key: "message_id", expired: "completed_at < NOW() - INTERVAL '30 days'" },
  { table: "blumi_push_receipts", key: "ticket_id", expired: "outcome IS NOT NULL AND created_at < NOW() - INTERVAL '7 days'" },
  { table: "blumi_push_delivery_audit", key: "audit_id", expired: "occurred_at < NOW() - INTERVAL '30 days'" },
  { table: "blumi_notification_policy_audit", key: "audit_id", expired: "occurred_at < NOW() - INTERVAL '30 days'" },
  {
    table: "blumi_notification_policy_events",
    key: "event_id",
    expired: "notification_type IN ('message', 'like') AND created_at < NOW() - INTERVAL '30 days'"
  }
] as const)

export type RetentionTable = (typeof RETENTION_POLICIES)[number]["table"]
export type RetentionResult = Record<RetentionTable, number>

interface RetentionExecutor {
  query(sql: string, values?: unknown[]): Promise<{ rowCount?: number | null }>
}

export interface RetentionService {
  purgeExpired(): Promise<RetentionResult>
}

/**
 * Each batch is its own autocommit statement, so locks are short and a
 * concurrent worker skips rows another one holds. One tick deletes at most
 * batchSize x maxBatches rows per table and resumes on the next tick.
 */
export function createPostgresRetentionService(
  pool: RetentionExecutor,
  options: { batchSize?: number; maxBatches?: number } = {}
): RetentionService {
  const batchSize = options.batchSize ?? 2000
  const maxBatches = options.maxBatches ?? 10
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) throw new RangeError("Invalid retention batch size")
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new RangeError("Invalid retention batch count")
  return {
    async purgeExpired() {
      const result = {} as RetentionResult
      for (const policy of RETENTION_POLICIES) {
        let deleted = 0
        for (let batch = 0; batch < maxBatches; batch++) {
          const removed = await pool.query(
            `DELETE FROM ${policy.table} WHERE (${policy.key}) IN (
               SELECT ${policy.key} FROM ${policy.table}
                WHERE ${policy.expired}
                LIMIT $1 FOR UPDATE SKIP LOCKED)`,
            [batchSize]
          )
          const count = removed.rowCount ?? 0
          deleted += count
          if (count < batchSize) break
        }
        result[policy.table] = deleted
      }
      return result
    }
  }
}
