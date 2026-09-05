import type { QueryResultRow } from "pg"
import { assertTicketPurgeLimit } from "../realtime/realtimeTicketStore"
import type {
  RealtimeTicketStore,
  StoredRealtimeTicket
} from "../realtime/realtimeTicketStore"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

/** PostgreSQL is the cross-instance source of truth for upgrade tickets. */
export function createPostgresRealtimeTicketStore(
  pool: QueryExecutor
): RealtimeTicketStore {
  return {
    async purgeExpired(now, limit) {
      assertTicketPurgeLimit(limit)
      const result = await pool.query(
        `WITH expired AS (
           SELECT ticket_digest FROM blumi_realtime_tickets
            WHERE expires_at <= $1 ORDER BY expires_at
            LIMIT $2 FOR UPDATE SKIP LOCKED
         ) DELETE FROM blumi_realtime_tickets
            WHERE ticket_digest IN (SELECT ticket_digest FROM expired)
            RETURNING ticket_digest`, [now, limit]
      )
      return result.rows.length
    },
    async issue(ticket: StoredRealtimeTicket) {
      const result = await pool.query(
        `INSERT INTO blumi_realtime_tickets (
            ticket_digest, session_token_hash, expires_at
          ) VALUES ($1, $2, $3)
          ON CONFLICT (ticket_digest) DO NOTHING
          RETURNING ticket_digest`,
        [ticket.digest, ticket.sessionTokenHash, new Date(ticket.expiresAtMs)]
      )
      return result.rows.length === 1
    },
    async consume(digest, now) {
      const result = await pool.query(
        `DELETE FROM blumi_realtime_tickets
          WHERE ticket_digest = $1
            AND expires_at > $2
          RETURNING session_token_hash`,
        [digest, now]
      )
      return result.rows[0]
        ? String(result.rows[0].session_token_hash)
        : null
    }
  }
}
