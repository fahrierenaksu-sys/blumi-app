import { randomUUID } from "node:crypto"
import type { Pool, PoolClient, QueryResultRow } from "pg"
import { AdminQuotaExtensionLimitError, AdminUserNotFoundError } from "../admin/adminUsersService"
import type {
  AdminQuotaActionInput,
  AdminQuotaAuditEvent,
  AdminQuotaSnapshot,
  AdminUserRecord,
  AdminUserRepository
} from "../admin/adminUsersService"

const MAX_DAILY_EXTENSION = 100

export function createPostgresAdminUserRepository(pool: Pool): AdminUserRepository {
  return {
    async searchUsers(query, limit) {
      const escaped = query.replace(/[\\%_]/g, "\\$&")
      const result = await pool.query(
        `SELECT user_id, display_name, phone_number, created_at
           FROM blumi_accounts
          WHERE user_id = $1
             OR phone_number = $1
             OR display_name ILIKE $2 ESCAPE E'\\\\'
          ORDER BY created_at DESC, user_id
          LIMIT $3`,
        [query, `%${escaped}%`, limit]
      )
      return result.rows.map(mapUser)
    },

    async findUser(userId) {
      const result = await pool.query(
        `SELECT user_id, display_name, phone_number, created_at
           FROM blumi_accounts WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0] ? mapUser(result.rows[0]) : null
    },

    async getQuota(userId, now) {
      const result = await pool.query(
        `SELECT decision_limit, extension_decisions, used, remaining, resets_at
           FROM blumi_discovery_decision_quota($1, $2)`,
        [userId, now]
      )
      if (!result.rows[0]) throw new Error("Discovery quota query returned no row.")
      return mapQuota(result.rows[0])
    },

    async resetQuota(input) {
      return updateQuota(pool, input, "quota_reset")
    },

    async grantQuota(input) {
      return updateQuota(pool, input, "quota_grant")
    },

    async listQuotaAudit(userId, limit) {
      const result = await pool.query(
        `SELECT a.audit_id, a.action, a.amount, a.reason, a.operator_id,
                a.token_id, a.previous_quota, a.current_quota, a.created_at
           FROM blumi_admin_user_audit a
           JOIN blumi_accounts u ON u.user_id = a.target_user_id
          WHERE a.target_user_id = $1
          ORDER BY a.sequence_id DESC
          LIMIT $2`,
        [userId, limit]
      )
      return result.rows.map(mapAuditEvent)
    }
  }
}

async function updateQuota(
  pool: Pool,
  input: AdminQuotaActionInput,
  action: AdminQuotaAuditEvent["action"]
): Promise<{ quota: AdminQuotaSnapshot; event: AdminQuotaAuditEvent }> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const day = input.now.toISOString().slice(0, 10)
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${input.userId}:${day}`]
    )
    const user = await client.query(
      "SELECT user_id FROM blumi_accounts WHERE user_id = $1 FOR UPDATE",
      [input.userId]
    )
    if (!user.rowCount) {
      throw new AdminUserNotFoundError()
    }
    await client.query(
      `INSERT INTO blumi_discovery_decision_quotas (user_id, quota_day)
       VALUES ($1, $2::date)
       ON CONFLICT (user_id, quota_day) DO NOTHING`,
      [input.userId, day]
    )
    const current = await client.query(
      `SELECT used_decisions, extension_decisions
         FROM blumi_discovery_decision_quotas
        WHERE user_id = $1 AND quota_day = $2::date
        FOR UPDATE`,
      [input.userId, day]
    )
    const previousUsed = Number(current.rows[0]?.used_decisions ?? 0)
    const previousExtension = Number(current.rows[0]?.extension_decisions ?? 0)
    if (action === "quota_grant" && previousExtension + (input.amount ?? 0) > MAX_DAILY_EXTENSION) {
      throw new AdminQuotaExtensionLimitError()
    }
    if (action === "quota_reset") {
      await client.query(
        `UPDATE blumi_discovery_decision_quotas
            SET used_decisions = 0
          WHERE user_id = $1 AND quota_day = $2::date`,
        [input.userId, day]
      )
    } else {
      await client.query(
        `UPDATE blumi_discovery_decision_quotas
            SET extension_decisions = extension_decisions + $3
          WHERE user_id = $1 AND quota_day = $2::date`,
        [input.userId, day, input.amount]
      )
    }
    const previousQuota = quotaFromParts(previousExtension, previousUsed, input.now)
    const nextUsed = action === "quota_reset" ? 0 : previousUsed
    const nextExtension = action === "quota_grant" ? previousExtension + (input.amount ?? 0) : previousExtension
    const currentQuota = quotaFromParts(nextExtension, nextUsed, input.now)
    const event: AdminQuotaAuditEvent = {
      eventId: randomUUID(),
      action,
      amount: action === "quota_grant" ? input.amount ?? null : null,
      reason: input.reason,
      operatorId: input.operatorId,
      tokenId: input.tokenId,
      previousQuota,
      currentQuota,
      createdAt: input.now.toISOString()
    }
    await insertAudit(client, input.userId, event)
    await client.query("COMMIT")
    return { quota: currentQuota, event }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function insertAudit(
  client: PoolClient,
  userId: string,
  event: AdminQuotaAuditEvent
): Promise<void> {
  await client.query(
    `INSERT INTO blumi_admin_user_audit (
       audit_id, target_user_id, action, amount, reason, operator_id, token_id,
       previous_quota, current_quota, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
    [event.eventId, userId, event.action, event.amount, event.reason,
      event.operatorId, event.tokenId, JSON.stringify(event.previousQuota),
      JSON.stringify(event.currentQuota), new Date(event.createdAt)]
  )
}

function quotaFromParts(extensionDecisions: number, used: number, now: Date): AdminQuotaSnapshot {
  const limit = 10 + extensionDecisions
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return {
    limit,
    extensionDecisions,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: day.toISOString()
  }
}

function mapUser(row: QueryResultRow): AdminUserRecord {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name ?? ""),
    phoneNumber: String(row.phone_number ?? ""),
    createdAt: new Date(row.created_at as string | number | Date).toISOString()
  }
}

function mapQuota(row: QueryResultRow): AdminQuotaSnapshot {
  return {
    limit: Number(row.decision_limit),
    extensionDecisions: Number(row.extension_decisions),
    used: Number(row.used),
    remaining: Number(row.remaining),
    resetsAt: new Date(row.resets_at as string | number | Date).toISOString()
  }
}

function mapAuditEvent(row: QueryResultRow): AdminQuotaAuditEvent {
  return {
    eventId: String(row.audit_id),
    action: row.action === "quota_reset" ? "quota_reset" : "quota_grant",
    amount: row.amount === null ? null : Number(row.amount),
    reason: String(row.reason),
    operatorId: String(row.operator_id),
    tokenId: String(row.token_id),
    previousQuota: parseQuota(row.previous_quota),
    currentQuota: parseQuota(row.current_quota),
    createdAt: new Date(row.created_at as string | number | Date).toISOString()
  }
}

function parseQuota(value: unknown): AdminQuotaSnapshot {
  const parsed = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>
  return {
    limit: Number(parsed.limit),
    extensionDecisions: Number(parsed.extensionDecisions),
    used: Number(parsed.used),
    remaining: Number(parsed.remaining),
    resetsAt: String(parsed.resetsAt)
  }
}
