import type { QueryResultRow } from "pg"
import {
  decideThreadRoomInviteAccess,
  type ThreadRoomInviteReader
} from "../miniRooms/threadRoomInviteRead"
import { mapInvite } from "./postgresMiniRoomRepository"

interface QueryExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: QueryResultRow[] }>
}

/**
 * GET /v1/threads/:threadId/room-invites in one statement: membership,
 * partner, block, match and connection, partner moderation, test persona
 * and the thread's invites. Pending invites past their expiry are marked
 * expired in the same statement (as listInvitesForThread does) and are
 * returned as expired; the write only runs when the read authorizes the
 * caller, exactly like the composed reader.
 */
export function createPostgresThreadRoomInviteReader(pool: QueryExecutor): ThreadRoomInviteReader {
  return {
    async readThreadRoomInvites({ threadId, userId, now = new Date() }) {
      const result = await pool.query(
        `WITH thread AS (
           SELECT t.thread_id, t.mini_room_id,
                  EXISTS (SELECT 1 FROM blumi_chat_thread_participants AS p
                           WHERE p.thread_id = t.thread_id AND p.user_id = $2) AS is_member,
                  (SELECT p.user_id FROM blumi_chat_thread_participants AS p
                    WHERE p.thread_id = t.thread_id AND p.user_id <> $2
                    ORDER BY p.participant_order LIMIT 1) AS partner_user_id
             FROM blumi_chat_threads AS t
            WHERE t.thread_id = $1
         ), facts AS (
           SELECT thread.*,
                  EXISTS (SELECT 1 FROM blumi_safety_blocks AS b
                           WHERE (b.actor_user_id = $2 AND b.blocked_user_id = thread.partner_user_id)
                              OR (b.actor_user_id = thread.partner_user_id AND b.blocked_user_id = $2)) AS blocked,
                  (SELECT m.match_id FROM blumi_matches AS m
                    WHERE m.participant_key IN ($2 || ':' || thread.partner_user_id,
                                                thread.partner_user_id || ':' || $2)
                    LIMIT 1) AS match_id,
                  (SELECT c.mini_room_id FROM blumi_connection_matches AS c
                    WHERE (c.participant_a_user_id = $2 AND c.participant_b_user_id = thread.partner_user_id)
                       OR (c.participant_a_user_id = thread.partner_user_id AND c.participant_b_user_id = $2)
                    ORDER BY c.matched_at DESC LIMIT 1) AS connection_mini_room_id,
                  COALESCE((SELECT a.moderation_status IS DISTINCT FROM 'banned'
                                   AND NOT (a.moderation_status = 'suspended'
                                            AND (a.suspended_until IS NULL OR a.suspended_until > $3))
                              FROM blumi_accounts AS a WHERE a.user_id = thread.partner_user_id), false) AS partner_allowed,
                  EXISTS (SELECT 1 FROM blumi_test_personas AS persona
                           WHERE persona.user_id = thread.partner_user_id) AS partner_is_test_persona
             FROM thread
         ), allowed AS (
           SELECT 1 FROM facts
            WHERE facts.is_member AND facts.partner_user_id IS NOT NULL AND NOT facts.blocked AND facts.partner_allowed
              AND ((facts.thread_id = 'thread_match_' || facts.match_id AND facts.mini_room_id = 'match_' || facts.match_id)
                OR (facts.thread_id = 'thread_connection_' || facts.connection_mini_room_id
                    AND facts.mini_room_id = facts.connection_mini_room_id))
         ), expired AS (
           UPDATE blumi_mini_room_invites
              SET status = 'expired', decided_at = $3
            WHERE source_thread_id = $1 AND status = 'pending' AND expires_at <= $3
              AND EXISTS (SELECT 1 FROM allowed)
         )
         SELECT facts.*,
                CASE WHEN EXISTS (SELECT 1 FROM allowed) THEN (
                  SELECT COALESCE(json_agg(json_build_object(
                           'invite_id', invite.invite_id,
                           'room_id', invite.room_id,
                           'sender_user_id', invite.sender_user_id,
                           'recipient_user_id', invite.recipient_user_id,
                           'sender_spot_id', invite.sender_spot_id,
                           'source_thread_id', invite.source_thread_id,
                           -- This statement cannot see its own UPDATE: report the
                           -- status and decision time the expiry writes.
                           'status', CASE WHEN invite.status = 'pending' AND invite.expires_at <= $3
                                          THEN 'expired' ELSE invite.status END,
                           'created_at', invite.created_at,
                           'expires_at', invite.expires_at,
                           'decided_at', CASE WHEN invite.status = 'pending' AND invite.expires_at <= $3
                                              THEN $3::timestamptz ELSE invite.decided_at END,
                           'room_session_id', mini_room.mini_room_id
                         ) ORDER BY invite.created_at ASC, invite.invite_id ASC), '[]'::json)
                    FROM blumi_mini_room_invites AS invite
                    LEFT JOIN blumi_mini_rooms AS mini_room ON mini_room.invite_id = invite.invite_id
                   WHERE invite.source_thread_id = $1
                ) END AS invites
           FROM facts`,
        [threadId, userId, now]
      )
      const row = result.rows[0]
      const decision = decideThreadRoomInviteAccess(row ? {
        threadId: String(row.thread_id),
        miniRoomId: String(row.mini_room_id),
        isMember: row.is_member === true,
        partnerUserId: row.partner_user_id === null ? null : String(row.partner_user_id),
        blocked: row.blocked === true,
        matchId: row.match_id === null ? null : String(row.match_id),
        connectionMiniRoomId: row.connection_mini_room_id === null ? null : String(row.connection_mini_room_id),
        partnerAllowed: row.partner_allowed === true
      } : null)
      if (decision !== "ok") return { status: decision }
      const invites = Array.isArray(row!.invites) ? row!.invites as QueryResultRow[] : []
      return {
        status: "ok",
        partnerUserId: String(row!.partner_user_id),
        partnerIsTestPersona: row!.partner_is_test_persona === true,
        invites: invites.map(mapInvite)
      }
    }
  }
}
