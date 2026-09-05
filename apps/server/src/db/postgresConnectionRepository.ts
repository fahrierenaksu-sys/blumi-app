import type {
  ConnectionDecisionRecord,
  ConnectionMatch
} from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import type { ConnectionRepository } from "../connections/connectionRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresConnectionRepository(
  pool: QueryExecutor
): ConnectionRepository {
  return {
    async saveDecision(decision) {
      await pool.query(
        `INSERT INTO blumi_connection_decisions (
            mini_room_id, actor_user_id, partner_user_id, status, decided_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (mini_room_id, actor_user_id) DO NOTHING`,
        [
          decision.miniRoomId,
          decision.actorUserId,
          decision.partnerUserId,
          decision.status,
          decision.decidedAt
        ]
      )
    },
    async findDecision(miniRoomId, actorUserId) {
      const result = await pool.query(
        `SELECT mini_room_id, actor_user_id, partner_user_id, status, decided_at
           FROM blumi_connection_decisions
          WHERE mini_room_id = $1 AND actor_user_id = $2`,
        [miniRoomId, actorUserId]
      )
      return result.rows[0] ? mapDecision(result.rows[0]) : null
    },
    async findMatch(miniRoomId) {
      const result = await pool.query(
        `SELECT mini_room_id, participant_a_user_id, participant_b_user_id, matched_at
           FROM blumi_connection_matches
          WHERE mini_room_id = $1`,
        [miniRoomId]
      )
      return result.rows[0] ? mapMatch(result.rows[0]) : null
    },
    async findMatchBetween(userAId, userBId) {
      const result = await pool.query(
        `SELECT mini_room_id, participant_a_user_id, participant_b_user_id, matched_at
           FROM blumi_connection_matches
          WHERE (
            participant_a_user_id = $1 AND participant_b_user_id = $2
          ) OR (
            participant_a_user_id = $2 AND participant_b_user_id = $1
          )
          ORDER BY matched_at DESC
          LIMIT 1`,
        [userAId, userBId]
      )
      return result.rows[0] ? mapMatch(result.rows[0]) : null
    },
    async saveMatch(match) {
      await pool.query(
        `INSERT INTO blumi_connection_matches (
            mini_room_id, participant_a_user_id, participant_b_user_id, matched_at
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (mini_room_id) DO NOTHING`,
        [
          match.miniRoomId,
          match.participantUserIds[0],
          match.participantUserIds[1],
          match.matchedAt
        ]
      )
    }
  }
}

function mapDecision(row: QueryResultRow): ConnectionDecisionRecord {
  return {
    miniRoomId: String(row.mini_room_id),
    actorUserId: String(row.actor_user_id),
    partnerUserId: String(row.partner_user_id),
    status: row.status === "saved" ? "saved" : "passed",
    decidedAt: new Date(row.decided_at).toISOString()
  }
}

function mapMatch(row: QueryResultRow): ConnectionMatch {
  return {
    miniRoomId: String(row.mini_room_id),
    participantUserIds: [
      String(row.participant_a_user_id),
      String(row.participant_b_user_id)
    ],
    matchedAt: new Date(row.matched_at).toISOString()
  }
}
