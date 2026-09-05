import type { QueryResultRow } from "pg"
import type { AccountRecoveryRepository, AccountRecoveryRequest } from "../account/accountRecoveryService"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresAccountRecoveryRepository(pool: QueryExecutor): AccountRecoveryRepository {
  return {
    async save(request) {
      await pool.query(
        `INSERT INTO blumi_account_recovery_requests (request_id, account_id, claimed_old_phone_number, new_phone_number, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          request.requestId,
          request.accountId ?? null,
          request.claimedOldPhoneNumber ?? null,
          request.newPhoneNumber,
          request.status,
          new Date(request.createdAt)
        ]
      )
    },
    async list(limit) {
      const result = await pool.query(
        `SELECT request_id, account_id, claimed_old_phone_number, new_phone_number, status, created_at, resolved_at, resolved_by_operator_id, resolved_by_token_id
           FROM blumi_account_recovery_requests ORDER BY created_at DESC LIMIT $1`, [limit]
      )
      return result.rows.map(mapRequest)
    },
    async listPage(input) {
      const result = await pool.query(
        `SELECT request_id, account_id, claimed_old_phone_number, new_phone_number, status, created_at, resolved_at, resolved_by_operator_id, resolved_by_token_id
           FROM blumi_account_recovery_requests
          WHERE ($2::text IS NULL OR status = $2)
            AND ($3::timestamptz IS NULL OR (created_at, request_id) < ($3::timestamptz, $4::text))
          ORDER BY created_at DESC, request_id DESC LIMIT $1`,
        [input.limit, input.status ?? null, input.before?.createdAt ?? null, input.before?.requestId ?? null]
      )
      return result.rows.map(mapRequest)
    },
    async resolve(input) {
      const result = await pool.query(
        `UPDATE blumi_account_recovery_requests
            SET status = $2, resolved_at = $3, resolved_by_operator_id = $4, resolved_by_token_id = $5
          WHERE request_id = $1 AND status = 'pending'
          RETURNING request_id, account_id, claimed_old_phone_number, new_phone_number, status, created_at, resolved_at, resolved_by_operator_id, resolved_by_token_id`,
        [input.requestId, input.status, input.now, input.operatorId, input.tokenId]
      )
      return result.rows[0] ? mapRequest(result.rows[0]) : null
    }
  }
}

function mapRequest(row: QueryResultRow): AccountRecoveryRequest {
  const status = row.status
  if (status !== "pending" && status !== "manual_review_required" && status !== "rejected") throw new Error("Invalid recovery status.")
  return {
    requestId: String(row.request_id),
    ...(row.account_id ? { accountId: String(row.account_id) } : {}),
    ...(row.claimed_old_phone_number ? { claimedOldPhoneNumber: String(row.claimed_old_phone_number) } : {}),
    newPhoneNumber: String(row.new_phone_number),
    createdAt: new Date(row.created_at).toISOString(),
    status,
    ...(row.resolved_at ? { resolvedAt: new Date(row.resolved_at).toISOString() } : {}),
    ...(row.resolved_by_operator_id ? { resolvedByOperatorId: String(row.resolved_by_operator_id) } : {}),
    ...(row.resolved_by_token_id ? { resolvedByTokenId: String(row.resolved_by_token_id) } : {})
  }
}
