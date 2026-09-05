import type { QueryResultRow } from "pg"
import type { ReferralInvite, ReferralRepository } from "../referrals/referralRepository"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}

interface TransactionalQueryExecutor extends QueryExecutor {
  connect?: () => Promise<{ query: QueryExecutor["query"]; release(): void }>
}

export function createPostgresReferralRepository(
  pool: TransactionalQueryExecutor
): ReferralRepository {
  return {
    async issueInvite(input) {
      const result = await pool.query(
        `INSERT INTO blumi_referral_invites (code, inviter_user_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (inviter_user_id) DO UPDATE
           SET inviter_user_id = EXCLUDED.inviter_user_id
         RETURNING code, inviter_user_id, created_at, claimed_by_user_id, claimed_at`,
        [input.code, input.inviterUserId, new Date(input.createdAt)]
      )
      return mapInvite(result.rows[0])
    },
    async claimInvite(input) {
      const client = pool.connect ? await pool.connect() : null
      const executor = client ?? pool
      try {
        if (client) await executor.query("BEGIN")
        await executor.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [input.inviteeUserId]
        )
        const result = await executor.query(
          `UPDATE blumi_referral_invites
              SET claimed_by_user_id = $2,
                  claimed_at = $3
            WHERE code = $1
              AND inviter_user_id <> $2
              AND claimed_by_user_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM blumi_referral_invites
                 WHERE claimed_by_user_id = $2
              )
          RETURNING code`,
          [input.code, input.inviteeUserId, new Date(input.claimedAt)]
        )
        if (client) await executor.query("COMMIT")
        return result.rows.length === 1
      } catch (error) {
        if (client) await executor.query("ROLLBACK")
        throw error
      } finally {
        client?.release()
      }
    }
  }
}

function mapInvite(row: QueryResultRow | undefined): ReferralInvite {
  if (!row) throw new Error("Referral invite could not be stored.")
  return {
    code: String(row.code),
    inviterUserId: String(row.inviter_user_id),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.claimed_by_user_id ? { claimedByUserId: String(row.claimed_by_user_id) } : {}),
    ...(row.claimed_at ? { claimedAt: new Date(row.claimed_at).toISOString() } : {})
  }
}
