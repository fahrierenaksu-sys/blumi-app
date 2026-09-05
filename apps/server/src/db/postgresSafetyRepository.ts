import type { QueryResultRow } from "pg"
import { REPORT_REASONS } from "@blumi/contracts"
import type {
  BlockRecord,
  PendingReportReasonSummary,
  ReportRecord,
  SaveReportAndBlockResult,
  SafetyRepository
} from "../safety/safetyRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

interface TransactionalQueryExecutor extends QueryExecutor {
  connect?: () => Promise<{
    query: QueryExecutor["query"]
    release(): void
  }>
}

export function createPostgresSafetyRepository(
  pool: TransactionalQueryExecutor
): SafetyRepository {
  return {
    async listBlocks(actorUserId) {
      const result = await pool.query(
        `SELECT actor_user_id, blocked_user_id, created_at
           FROM blumi_safety_blocks
          WHERE actor_user_id = $1
          ORDER BY created_at DESC`,
        [actorUserId]
      )
      return result.rows.map(mapBlock)
    },
    async listBlockedUserIdsBetween(viewerUserId, candidateUserIds) {
      if (candidateUserIds.length === 0) return []
      const result = await pool.query(
        `SELECT DISTINCT CASE
                  WHEN actor_user_id = $1 THEN blocked_user_id
                  ELSE actor_user_id
                END AS blocked_user_id
           FROM blumi_safety_blocks
          WHERE (
            actor_user_id = $1
            AND blocked_user_id = ANY($2::text[])
          ) OR (
            blocked_user_id = $1
            AND actor_user_id = ANY($2::text[])
          )`,
        [viewerUserId, candidateUserIds]
      )
      return result.rows.flatMap((row) =>
        typeof row.blocked_user_id === "string"
          ? [row.blocked_user_id]
          : []
      )
    },

    async findBlock(actorUserId, blockedUserId) {
      const result = await pool.query(
        `SELECT actor_user_id, blocked_user_id, created_at
           FROM blumi_safety_blocks
          WHERE actor_user_id = $1 AND blocked_user_id = $2`,
        [actorUserId, blockedUserId]
      )
      return result.rows[0] ? mapBlock(result.rows[0]) : null
    },

    async saveBlock(block) {
      const result = await pool.query(
        `INSERT INTO blumi_safety_blocks (
            actor_user_id, blocked_user_id, created_at
          ) VALUES ($1, $2, $3)
          ON CONFLICT (actor_user_id, blocked_user_id) DO NOTHING`,
        [
          block.actorUserId,
          block.blockedUserId,
          new Date(block.createdAt)
        ]
      )
    },

    async deleteBlock(actorUserId, blockedUserId) {
      await pool.query(
        `DELETE FROM blumi_safety_blocks
          WHERE actor_user_id = $1 AND blocked_user_id = $2`,
        [actorUserId, blockedUserId]
      )
    },

    async saveReport(report) {
      await pool.query(
        `INSERT INTO blumi_safety_reports (
            report_id, actor_user_id, reported_user_id, reason, note, created_at,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          report.reportId,
          report.actorUserId,
          report.reportedUserId,
          report.reason,
          report.note ?? null,
          new Date(report.createdAt),
          report.status
        ]
      )
    },
    async saveReportAndBlock(report, block) {
      const client = pool.connect ? await pool.connect() : null
      const executor = client ?? pool
      try {
        if (client) await executor.query("BEGIN")
        if (report.idempotencyKey) {
          await executor.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [`${report.actorUserId}:${report.idempotencyKey}`]
          )
          const existing = await executor.query(
            `SELECT report_id, actor_user_id, reported_user_id, reason, note,
                    idempotency_key, created_at, status, resolution_action,
                    resolution_note, resolved_at, resolved_by_admin_id,
                    resolved_by_token_id, resolution_suspended_until
               FROM blumi_safety_reports
              WHERE actor_user_id = $1 AND idempotency_key = $2`,
            [report.actorUserId, report.idempotencyKey]
          )
          if (existing.rows[0]) {
            const replay = mapReport(existing.rows[0])
            if (!sameReportPayload(replay, report)) {
              if (client) await executor.query("COMMIT")
              return { kind: "conflict" } as SaveReportAndBlockResult
            }
            const savedBlock = await ensureBlock(executor, {
              actorUserId: replay.actorUserId,
              blockedUserId: replay.reportedUserId,
              createdAt: replay.createdAt
            })
            if (client) await executor.query("COMMIT")
            return {
              kind: "replayed",
              report: replay,
              block: savedBlock
            } as SaveReportAndBlockResult
          }
        }
        await executor.query(
          `INSERT INTO blumi_safety_reports (
              report_id, actor_user_id, reported_user_id, reason, note,
              idempotency_key, created_at, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            report.reportId,
            report.actorUserId,
            report.reportedUserId,
            report.reason,
            report.note ?? null,
            report.idempotencyKey ?? null,
            new Date(report.createdAt),
            report.status
          ]
        )
        const savedBlock = await ensureBlock(executor, block)
        if (client) await executor.query("COMMIT")
        return {
          kind: "created",
          report: { ...report },
          block: savedBlock
        } as SaveReportAndBlockResult
      } catch (error) {
        if (client) await executor.query("ROLLBACK")
        throw error
      } finally {
        client?.release()
      }
    },

    async listReportsForActor(actorUserId) {
      const result = await pool.query(
        `SELECT report_id, actor_user_id, reported_user_id, reason, note, idempotency_key,
                created_at, status, resolution_action, resolution_note,
                resolved_at, resolved_by_admin_id, resolved_by_token_id,
                resolution_suspended_until
           FROM blumi_safety_reports
          WHERE actor_user_id = $1
          ORDER BY created_at DESC`,
        [actorUserId]
      )
      return result.rows.map(mapReport)
    },

    async listAllReports(options) {
      const values: unknown[] = []
      const where = options.status ? "WHERE status = $1" : ""
      if (options.status) values.push(options.status)
      values.push(options.limit)
      const result = await pool.query(
        `SELECT report_id, actor_user_id, reported_user_id, reason, note, idempotency_key,
                created_at, status, resolution_action, resolution_note,
                resolved_at, resolved_by_admin_id, resolved_by_token_id,
                resolution_suspended_until
           FROM blumi_safety_reports
          ${where}
          ORDER BY created_at DESC
          LIMIT $${values.length}`,
        values
      )
      return result.rows.map(mapReport)
    },

    async summarizePendingReports(query) {
      const values = REPORT_REASONS.flatMap((reason) => [
        reason,
        new Date(query.breachedBeforeByReason[reason])
      ])
      const breachConditions = REPORT_REASONS.map(
        (_reason, index) =>
          `(reason = $${index * 2 + 1} AND created_at < $${index * 2 + 2})`
      ).join(" OR ")
      const result = await pool.query(
        `SELECT reason,
                COUNT(*)::int AS pending_count,
                COUNT(*) FILTER (WHERE ${breachConditions})::int AS breached_count,
                MIN(created_at) AS oldest_pending_created_at
           FROM blumi_safety_reports
          WHERE status = 'pending'
          GROUP BY reason`,
        values
      )
      return result.rows.map(mapPendingReportReasonSummary)
    },

    async findReport(reportId) {
      const result = await pool.query(
        `SELECT report_id, actor_user_id, reported_user_id, reason, note, idempotency_key,
                created_at, status, resolution_action, resolution_note,
                resolved_at, resolved_by_admin_id, resolved_by_token_id,
                resolution_suspended_until
           FROM blumi_safety_reports
          WHERE report_id = $1`,
        [reportId]
      )
      return result.rows[0] ? mapReport(result.rows[0]) : null
    },

    async resolveReport(reportId, resolution) {
      const status = resolution.action === "dismiss" ? "dismissed" : "resolved"
      const result = await pool.query(
        `WITH resolved_report AS (
           UPDATE blumi_safety_reports
              SET status = $2,
                  resolution_action = $3,
                  resolution_note = $4,
                  resolved_at = $5,
                  resolved_by_admin_id = $6,
                  resolved_by_token_id = $7,
                  resolution_suspended_until = $8
            WHERE report_id = $1
              AND status = 'pending'
          RETURNING report_id, reported_user_id
         ), moderated_account AS (
           UPDATE blumi_accounts
              SET moderation_status = CASE
                    WHEN moderation_status = 'banned' THEN 'banned'
                    WHEN $3 = 'ban' THEN 'banned'
                    WHEN moderation_status = 'suspended' AND $3 = 'warn' THEN 'suspended'
                    WHEN $3 = 'suspend' THEN 'suspended'
                    WHEN $3 = 'warn' THEN 'warned'
                    ELSE moderation_status
                  END,
                  moderation_updated_at = CASE
                    WHEN moderation_status = 'banned' THEN moderation_updated_at
                    WHEN moderation_status = 'suspended' AND $3 = 'warn'
                      THEN moderation_updated_at
                    WHEN $3 IN ('warn', 'suspend', 'ban') THEN $5
                    ELSE moderation_updated_at
                  END,
                  suspended_until = CASE
                    WHEN moderation_status = 'banned' THEN suspended_until
                    WHEN $3 = 'ban' THEN NULL
                    WHEN $3 = 'suspend' THEN $8
                    ELSE suspended_until
                  END,
                  updated_at = CASE
                    WHEN moderation_status = 'banned' THEN updated_at
                    WHEN moderation_status = 'suspended' AND $3 = 'warn' THEN updated_at
                    WHEN $3 IN ('warn', 'suspend', 'ban') THEN $5
                    ELSE updated_at
                  END
            WHERE user_id IN (SELECT reported_user_id FROM resolved_report)
          RETURNING account_id
         )
         SELECT report_id FROM resolved_report`,
        [
          reportId,
          status,
          resolution.action,
          resolution.note ?? null,
          new Date(resolution.resolvedAt),
          resolution.resolvedByAdminId ?? null,
          resolution.resolvedByTokenId ?? null,
          resolution.suspendedUntil
            ? new Date(resolution.suspendedUntil)
            : null
        ]
      )
      if (result.rows.length === 1) return "resolved"
      const current = await pool.query(
        `SELECT status
           FROM blumi_safety_reports
          WHERE report_id = $1`,
        [reportId]
      )
      return current.rows[0] ? "conflict" : "not_found"
    }
  }
}

function mapBlock(row: QueryResultRow): BlockRecord {
  return {
    actorUserId: String(row.actor_user_id),
    blockedUserId: String(row.blocked_user_id),
    createdAt: new Date(row.created_at).toISOString()
  }
}

function mapReport(row: QueryResultRow): ReportRecord {
  const resolution =
    row.resolution_action && row.resolved_at
      ? {
          action: String(row.resolution_action),
          ...(row.resolution_note
            ? { adminNote: String(row.resolution_note) }
            : {}),
          resolvedAt: new Date(row.resolved_at).toISOString(),
          ...(row.resolved_by_admin_id
            ? { resolvedByAdminId: String(row.resolved_by_admin_id) }
            : {}),
          ...(row.resolved_by_token_id
            ? { resolvedByTokenId: String(row.resolved_by_token_id) }
            : {}),
          ...(row.resolution_suspended_until
            ? { suspendedUntil: new Date(row.resolution_suspended_until).toISOString() }
            : {})
        }
      : undefined
  return {
    reportId: String(row.report_id),
    actorUserId: String(row.actor_user_id),
    reportedUserId: String(row.reported_user_id),
    reason: String(row.reason) as ReportRecord["reason"],
    ...(row.note ? { note: String(row.note) } : {}),
    ...(row.idempotency_key ? { idempotencyKey: String(row.idempotency_key) } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    status: row.status
      ? String(row.status) as ReportRecord["status"]
      : "pending",
    ...(resolution ? { resolution } : {})
  }
}

function mapPendingReportReasonSummary(
  row: QueryResultRow
): PendingReportReasonSummary {
  return {
    reason: String(row.reason) as PendingReportReasonSummary["reason"],
    pendingCount: Number(row.pending_count),
    breachedCount: Number(row.breached_count),
    oldestPendingCreatedAt: new Date(row.oldest_pending_created_at).toISOString()
  }
}

async function ensureBlock(
  executor: QueryExecutor,
  block: BlockRecord
): Promise<BlockRecord> {
  const result = await executor.query(
    `INSERT INTO blumi_safety_blocks (
        actor_user_id, blocked_user_id, created_at
      ) VALUES ($1, $2, $3)
      ON CONFLICT (actor_user_id, blocked_user_id) DO UPDATE
        SET created_at = blumi_safety_blocks.created_at
      RETURNING actor_user_id, blocked_user_id, created_at`,
    [block.actorUserId, block.blockedUserId, new Date(block.createdAt)]
  )
  return mapBlock(result.rows[0] ?? {
    actor_user_id: block.actorUserId,
    blocked_user_id: block.blockedUserId,
    created_at: block.createdAt
  })
}

function sameReportPayload(left: ReportRecord, right: ReportRecord): boolean {
  return (
    left.reportedUserId === right.reportedUserId &&
    left.reason === right.reason &&
    (left.note ?? undefined) === (right.note ?? undefined)
  )
}
