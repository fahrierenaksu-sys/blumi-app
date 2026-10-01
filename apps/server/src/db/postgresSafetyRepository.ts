import type { QueryResultRow } from "pg"
import { REPORT_REASONS } from "@blumi/contracts"
import { moderationRiskRank } from "../safety/moderationQueue"
import {
  ESCALATION_REPLAY_WINDOW_MS,
  isEscalatingRequestRetry,
  pendingReportEscalation,
  storedReportAnswersKeyedRequest,
  type BlockRecord,
  type PendingReportReasonSummary,
  type ReportRecord,
  type SaveReportAndBlockResult,
  type SafetyRepository
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
    async saveReportAndBlock(report, block, policy) {
      const client = pool.connect ? await pool.connect() : null
      const executor = client ?? pool
      try {
        if (client) await executor.query("BEGIN")
        // One lock per actor: the idempotency replay, the pending-report
        // dedupe and the window cap all see the actor's committed reports.
        await executor.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`blumi:safety-report:${report.actorUserId}`]
        )
        if (report.idempotencyKey) {
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
            if (!storedReportAnswersKeyedRequest(replay, report)) {
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
        if (report.idempotencyKey) {
          // The schema keeps only the first request's key, so a retry of a
          // request that escalated a report is recognised by its content.
          // Only reports still pending or resolved within the replay window
          // can match; blumi_safety_reports_actor_created_at_idx serves it.
          const candidates = await executor.query(
            `SELECT report_id, actor_user_id, reported_user_id, reason, note,
                    idempotency_key, created_at, status, resolution_action,
                    resolution_note, resolved_at, resolved_by_admin_id,
                    resolved_by_token_id, resolution_suspended_until
               FROM blumi_safety_reports
              WHERE actor_user_id = $1 AND reported_user_id = $2
                AND (status = 'pending' OR resolved_at >= $3)
              ORDER BY created_at DESC, report_id DESC
              LIMIT 20`,
            [
              report.actorUserId,
              report.reportedUserId,
              new Date(Date.parse(report.createdAt) - ESCALATION_REPLAY_WINDOW_MS)
            ]
          )
          const escalated = candidates.rows.map(mapReport).find((candidate) => isEscalatingRequestRetry(candidate, report))
          if (escalated) {
            const savedBlock = await ensureBlock(executor, block)
            if (client) await executor.query("COMMIT")
            return { kind: "escalated", report: escalated, block: savedBlock } as SaveReportAndBlockResult
          }
        }
        // blumi_safety_reports_actor_created_at_idx serves both reads.
        const pending = await executor.query(
          `SELECT report_id, actor_user_id, reported_user_id, reason, note,
                  idempotency_key, created_at, status, resolution_action,
                  resolution_note, resolved_at, resolved_by_admin_id,
                  resolved_by_token_id, resolution_suspended_until
             FROM blumi_safety_reports
            WHERE actor_user_id = $1 AND reported_user_id = $2 AND status = 'pending'
            ORDER BY created_at ASC, report_id ASC
            LIMIT 1`,
          [report.actorUserId, report.reportedUserId]
        )
        if (pending.rows[0]) {
          const existing = mapReport(pending.rows[0])
          const escalation = pendingReportEscalation(existing, report)
          if (!escalation) {
            const savedBlock = await ensureBlock(executor, block)
            if (client) await executor.query("COMMIT")
            return { kind: "replayed", report: existing, block: savedBlock } as SaveReportAndBlockResult
          }
          // An admin may have resolved it since the read (the actor lock does
          // not cover resolution): then nothing is updated and the repeat is
          // filed as a new report below.
          const updated = await executor.query(
            `UPDATE blumi_safety_reports
                SET reason = $2, note = $3
              WHERE report_id = $1 AND status = 'pending'
          RETURNING report_id, actor_user_id, reported_user_id, reason, note,
                    idempotency_key, created_at, status, resolution_action,
                    resolution_note, resolved_at, resolved_by_admin_id,
                    resolved_by_token_id, resolution_suspended_until`,
            [existing.reportId, escalation.reason, escalation.note ?? null]
          )
          if (updated.rows[0]) {
            const savedBlock = await ensureBlock(executor, block)
            if (client) await executor.query("COMMIT")
            return { kind: "escalated", report: mapReport(updated.rows[0]), block: savedBlock } as SaveReportAndBlockResult
          }
        }
        if (policy) {
          const recent = await executor.query(
            `SELECT count(*)::int AS report_count
               FROM blumi_safety_reports
              WHERE actor_user_id = $1 AND created_at >= $2`,
            [report.actorUserId, new Date(policy.windowStartedAt)]
          )
          if (Number(recent.rows[0]?.report_count ?? 0) >= policy.maxReportsInWindow) {
            if (client) await executor.query("COMMIT")
            return { kind: "limited" } as SaveReportAndBlockResult
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

    async listReportsForActor(actorUserId, limit = 50) {
      const result = await pool.query(
        `SELECT report_id, actor_user_id, reported_user_id, reason, note, idempotency_key,
                created_at, status, resolution_action, resolution_note,
                resolved_at, resolved_by_admin_id, resolved_by_token_id,
                resolution_suspended_until
          FROM blumi_safety_reports
          WHERE actor_user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [actorUserId, limit]
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

    async listPendingReportsByRisk(options) {
      // Rank groups come from moderationQueue so SQL and code share one order.
      const ranks = new Map<number, string[]>()
      for (const reason of REPORT_REASONS) {
        const rank = moderationRiskRank(reason)
        ranks.set(rank, [...(ranks.get(rank) ?? []), reason])
      }
      const rankGroups = [...ranks.entries()].sort(([left], [right]) => left - right)
      const values: unknown[] = []
      const rankCases = rankGroups.map(([rank, reasons]) => {
        values.push(reasons)
        return `WHEN reason = ANY($${values.length}::text[]) THEN ${Number(rank)}`
      }).join(" ")
      let afterCondition = ""
      if (options.after) {
        values.push(options.after.riskRank, new Date(options.after.createdAt), options.after.reportId)
        const base = values.length - 2
        afterCondition = `WHERE (risk_rank, created_at, report_id) > ($${base}::int, $${base + 1}::timestamptz, $${base + 2}::text)`
      }
      values.push(options.limit)
      // blumi_safety_reports_status_idx narrows to pending rows; the backlog
      // is sorted after ranking (no stored rank column; see report).
      const result = await pool.query(
        `SELECT * FROM (
           SELECT report_id, actor_user_id, reported_user_id, reason, note, idempotency_key,
                  created_at, status, resolution_action, resolution_note,
                  resolved_at, resolved_by_admin_id, resolved_by_token_id,
                  resolution_suspended_until,
                  CASE ${rankCases} ELSE ${Number(rankGroups[rankGroups.length - 1]![0])} END AS risk_rank
             FROM blumi_safety_reports
            WHERE status = 'pending'
         ) pending
         ${afterCondition}
         ORDER BY risk_rank ASC, created_at ASC, report_id ASC
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
      // A suspend/ban first locks the reported account row. Account deletion
      // locks the same row before it deletes it (and records a phone ban for a
      // banned account), so a ban either commits first and is carried over,
      // or finds the account gone and is refused instead of being recorded
      // as an enforcement nobody received.
      const result = await pool.query(
        `WITH target_account AS (
           SELECT account_id
             FROM blumi_accounts
            WHERE $3 IN ('suspend', 'ban')
              AND user_id = (SELECT reported_user_id FROM blumi_safety_reports WHERE report_id = $1)
            FOR UPDATE
         ), resolved_report AS (
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
              AND ($3 NOT IN ('suspend', 'ban') OR EXISTS (SELECT 1 FROM target_account))
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
                    -- A shorter second suspension never cuts a longer one.
                    WHEN $3 = 'suspend' AND moderation_status = 'suspended'
                      AND suspended_until > $8 THEN suspended_until
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
      if (!current.rows[0]) return "not_found"
      if (current.rows[0].status === "pending" && ["suspend", "ban"].includes(resolution.action)) {
        return "reported_account_missing"
      }
      return "conflict"
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
