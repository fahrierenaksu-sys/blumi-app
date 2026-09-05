import type { QueryResultRow } from "pg"
import { cloneMiniRoom } from "../miniRooms/miniRoomRepository"
import { sharedRoomDecorSnapshotSchema } from "@blumi/contracts"
import type {
  MiniRoomCompletionIntent,
  MiniRoomInviteRecord,
  MiniRoomRecord,
  MiniRoomRepository
} from "../miniRooms/miniRoomRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresMiniRoomRepository(
  pool: QueryExecutor
): MiniRoomRepository {
  return {
    async saveInvite(invite) {
      await pool.query(
        `INSERT INTO blumi_mini_room_invites (
            invite_id, room_id, sender_user_id, recipient_user_id,
            sender_spot_id, source_thread_id, status, created_at, expires_at,
            decided_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (invite_id) DO UPDATE SET
            status = EXCLUDED.status,
            decided_at = EXCLUDED.decided_at`,
        [
          invite.inviteId,
          invite.roomId ?? null,
          invite.senderUserId,
          invite.recipientUserId,
          invite.senderSpotId ?? null,
          invite.sourceThreadId ?? null,
          invite.status,
          invite.createdAt,
          invite.expiresAt ?? null,
          invite.decidedAt ?? null
        ]
      )
    },
    async createOrFindPendingChatInvite(invite, now = new Date()) {
      if (!invite.sourceThreadId || !invite.expiresAt) {
        throw new Error("Chat room invites require a source thread and expiry.")
      }
      await pool.query(
        `UPDATE blumi_mini_room_invites
            SET status = 'expired', decided_at = $2
          WHERE source_thread_id = $1
            AND status = 'pending'
            AND expires_at <= $2`,
        [invite.sourceThreadId, now]
      )
      const inserted = await pool.query(
        `INSERT INTO blumi_mini_room_invites (
           invite_id, room_id, sender_user_id, recipient_user_id,
           sender_spot_id, source_thread_id, status, created_at, expires_at,
           decided_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
         ON CONFLICT DO NOTHING
         RETURNING invite_id, room_id, sender_user_id, recipient_user_id,
                   sender_spot_id, source_thread_id, status, created_at,
                   expires_at, decided_at`,
        [
          invite.inviteId,
          invite.roomId ?? null,
          invite.senderUserId,
          invite.recipientUserId,
          invite.senderSpotId ?? null,
          invite.sourceThreadId,
          invite.status,
          new Date(invite.createdAt),
          new Date(invite.expiresAt)
        ]
      )
      if (inserted.rows[0]) {
        return { invite: mapInvite(inserted.rows[0]), created: true }
      }
      const existing = await pool.query(
        `SELECT invite.invite_id, invite.room_id, invite.sender_user_id,
                invite.recipient_user_id, invite.sender_spot_id,
                invite.source_thread_id, invite.status, invite.created_at,
                invite.expires_at, invite.decided_at,
                mini_room.mini_room_id AS room_session_id
           FROM blumi_mini_room_invites AS invite
           LEFT JOIN blumi_mini_rooms AS mini_room
             ON mini_room.invite_id = invite.invite_id
          WHERE invite.source_thread_id = $1
          ORDER BY invite.created_at DESC
          LIMIT 1`,
        [invite.sourceThreadId]
      )
      if (!existing.rows[0]) {
        throw new Error("Room invite creation did not persist.")
      }
      return { invite: mapInvite(existing.rows[0]), created: false }
    },
    async findInvite(inviteId) {
      const result = await pool.query(
        `SELECT invite.invite_id, invite.room_id, invite.sender_user_id,
                invite.recipient_user_id, invite.sender_spot_id,
                invite.source_thread_id, invite.status, invite.created_at,
                invite.expires_at, invite.decided_at,
                mini_room.mini_room_id AS room_session_id
           FROM blumi_mini_room_invites AS invite
           LEFT JOIN blumi_mini_rooms AS mini_room
             ON mini_room.invite_id = invite.invite_id
          WHERE invite.invite_id = $1`,
        [inviteId]
      )
      return result.rows[0] ? mapInvite(result.rows[0]) : null
    },
    async listInvitesForThread(sourceThreadId, now = new Date()) {
      const result = await pool.query(
        `WITH expired_invites AS (
           UPDATE blumi_mini_room_invites
              SET status = 'expired', decided_at = $2
            WHERE source_thread_id = $1
              AND status = 'pending'
              AND expires_at <= $2
         )
         SELECT invite.invite_id, invite.room_id, invite.sender_user_id,
                invite.recipient_user_id, invite.sender_spot_id,
                invite.source_thread_id, invite.status, invite.created_at,
                invite.expires_at, invite.decided_at,
                mini_room.mini_room_id AS room_session_id
           FROM blumi_mini_room_invites AS invite
           LEFT JOIN blumi_mini_rooms AS mini_room
             ON mini_room.invite_id = invite.invite_id
          WHERE invite.source_thread_id = $1
          ORDER BY invite.created_at ASC`,
        [sourceThreadId, now]
      )
      return result.rows.map(mapInvite)
    },
    async transitionPendingInvite(input) {
      const result = await pool.query(
        `UPDATE blumi_mini_room_invites
            SET status = $2,
                decided_at = $3
          WHERE invite_id = $1
            AND status = 'pending'
        RETURNING invite_id`,
        [input.inviteId, input.status, new Date(input.decidedAt)]
      )
      return result.rows.length === 1
    },
    async listPendingInvitesForUser(userId) {
      const result = await pool.query(
        `SELECT invite_id, room_id, sender_user_id, recipient_user_id,
                sender_spot_id, source_thread_id, status, created_at,
                expires_at, decided_at
           FROM blumi_mini_room_invites
          WHERE status = 'pending'
            AND (sender_user_id = $1 OR recipient_user_id = $1)
          ORDER BY created_at DESC`,
        [userId]
      )
      return result.rows.map(mapInvite)
    },
    async acceptPendingInvite(input) {
      const miniRoom = input.miniRoom
      try {
        const result = await pool.query(
          `WITH accepted_invite AS (
             UPDATE blumi_mini_room_invites
                SET status = 'accepted',
                    decided_at = $11
              WHERE invite_id = $10
                AND status = 'pending'
                AND (expires_at IS NULL OR expires_at > $11)
             RETURNING invite_id, sender_user_id
           ), inserted_room AS (
             INSERT INTO blumi_mini_rooms (
               mini_room_id, lobby_room_id, participant_a_user_id,
               participant_b_user_id, livekit_room_name, started_at,
               ended_at, ended_by_user_id, invite_id, source_thread_id, shared_decor
             )
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, invite_id, $9,
                    jsonb_build_object(
                      'ownerUserId', accepted_invite.sender_user_id,
                      'revision', COALESCE(decor.revision, 0),
                      'capturedAt', $11::timestamptz,
                      'source', CASE WHEN decor.user_id IS NULL THEN 'default' ELSE 'inviter' END,
                      'decor', COALESCE(decor.decor, '{"schemaVersion":3,"geometryVersion":"room_v2","roomShellId":"room_v2_shell_blumi_world_v1","placedItems":[]}'::jsonb)
                    )
               FROM accepted_invite LEFT JOIN blumi_personal_room_decor AS decor
                 ON decor.user_id = accepted_invite.sender_user_id
             RETURNING mini_room_id
           )
           INSERT INTO blumi_active_mini_room_participants (
             user_id, mini_room_id
           )
           SELECT participant.user_id, inserted_room.mini_room_id
             FROM inserted_room
             CROSS JOIN (VALUES ($3), ($4)) AS participant(user_id)
           RETURNING user_id`,
          [
            miniRoom.miniRoomId,
            miniRoom.lobbyRoomId,
            miniRoom.participantUserIds[0],
            miniRoom.participantUserIds[1],
            miniRoom.livekitRoomName,
            miniRoom.startedAt,
            miniRoom.endedAt ?? null,
            miniRoom.endedByUserId ?? null,
            miniRoom.sourceThreadId ?? null,
            input.inviteId,
            new Date(input.decidedAt)
          ]
        )
        return result.rows.length === 2 ? "accepted" : "invite_unavailable"
      } catch (error) {
        if (isParticipantClaimViolation(error)) {
          const cancelled = await pool.query(
            `UPDATE blumi_mini_room_invites
                SET status = 'cancelled',
                    decided_at = $2
              WHERE invite_id = $1
                AND status = 'pending'
            RETURNING invite_id`,
            [input.inviteId, new Date(input.decidedAt)]
          )
          return cancelled.rows.length === 1
            ? "participant_busy"
            : "invite_unavailable"
        }
        throw error
      }
    },
    async rollbackAcceptedMiniRoom(input) {
      const result = await pool.query(
        `WITH deleted_room AS (
           DELETE FROM blumi_mini_rooms
            WHERE mini_room_id = $2
              AND invite_id = $1
           RETURNING mini_room_id
         )
         UPDATE blumi_mini_room_invites
            SET status = 'cancelled',
                decided_at = $3
          WHERE invite_id = $1
            AND status = 'accepted'
            AND EXISTS (SELECT 1 FROM deleted_room)
        RETURNING invite_id`,
        [input.inviteId, input.miniRoomId, new Date(input.decidedAt)]
      )
      return result.rows.length === 1
    },
    async findMiniRoom(miniRoomId) {
      const result = await pool.query(
        `SELECT mini_room_id, lobby_room_id, participant_a_user_id,
                participant_b_user_id, livekit_room_name, started_at,
                ended_at, ended_by_user_id, completion_reward_date,
                completion_requested_at, completion_requested_by_user_id,
                source_thread_id, shared_decor
           FROM blumi_mini_rooms
          WHERE mini_room_id = $1`,
        [miniRoomId]
      )
      return result.rows[0] ? mapMiniRoom(result.rows[0]) : null
    },
    async findMiniRoomByInviteId(inviteId) {
      const result = await pool.query(
        `SELECT mini_room_id, lobby_room_id, participant_a_user_id,
                participant_b_user_id, livekit_room_name, started_at,
                ended_at, ended_by_user_id, completion_reward_date,
                completion_requested_at, completion_requested_by_user_id,
                source_thread_id, shared_decor
           FROM blumi_mini_rooms
          WHERE invite_id = $1
          LIMIT 1`,
        [inviteId]
      )
      return result.rows[0] ? mapMiniRoom(result.rows[0]) : null
    },
    async findActiveMiniRoomForUser(userId) {
      const result = await pool.query(
        `SELECT mini_room_id, lobby_room_id, participant_a_user_id,
                participant_b_user_id, livekit_room_name, started_at,
                ended_at, ended_by_user_id, completion_reward_date,
                completion_requested_at, completion_requested_by_user_id,
                source_thread_id, shared_decor
           FROM blumi_mini_rooms
          WHERE ended_at IS NULL
            AND (participant_a_user_id = $1 OR participant_b_user_id = $1)
          ORDER BY started_at DESC
          LIMIT 1`,
        [userId]
      )
      return result.rows[0] ? mapMiniRoom(result.rows[0]) : null
    },
    async anchorMiniRoomCompletion(input) {
      const result = await pool.query(
        `UPDATE blumi_mini_rooms
            SET completion_reward_date = COALESCE(completion_reward_date, $3),
                completion_requested_at = COALESCE(completion_requested_at, $4),
                completion_requested_by_user_id = COALESCE(
                  completion_requested_by_user_id,
                  $2
                )
          WHERE mini_room_id = $1
            AND ended_at IS NULL
            AND ($2 = participant_a_user_id OR $2 = participant_b_user_id)
        RETURNING completion_reward_date, completion_requested_at,
                  completion_requested_by_user_id`,
        [
          input.miniRoomId,
          input.requestedByUserId,
          input.rewardDate,
          new Date(input.requestedAt)
        ]
      )
      return result.rows[0] ? mapCompletionIntent(result.rows[0]) : null
    },
    async endMiniRoom(miniRoomId, endedByUserId, endedAt) {
      const result = await pool.query(
        `WITH ended_room AS (
           UPDATE blumi_mini_rooms
            SET ended_at = $2,
                ended_by_user_id = $3
          WHERE mini_room_id = $1
            AND ended_at IS NULL
          RETURNING mini_room_id, lobby_room_id, participant_a_user_id,
                    participant_b_user_id, livekit_room_name, started_at,
                    ended_at, ended_by_user_id, completion_reward_date,
                    completion_requested_at, completion_requested_by_user_id,
                    source_thread_id, shared_decor
         ), released_participants AS (
           DELETE FROM blumi_active_mini_room_participants
            WHERE mini_room_id IN (SELECT mini_room_id FROM ended_room)
           RETURNING mini_room_id
         )
         SELECT mini_room_id, lobby_room_id, participant_a_user_id,
                participant_b_user_id, livekit_room_name, started_at,
                ended_at, ended_by_user_id, completion_reward_date,
                completion_requested_at, completion_requested_by_user_id,
                source_thread_id, shared_decor
           FROM ended_room`,
        [miniRoomId, endedAt, endedByUserId]
      )
      return result.rows[0] ? mapMiniRoom(result.rows[0]) : null
    },
    async separateUserPair(input) {
      const result = await pool.query(
        `WITH cancelled_invites AS (
           UPDATE blumi_mini_room_invites
              SET status = 'cancelled', decided_at = $3
            WHERE status = 'pending'
              AND (
                (sender_user_id = $1 AND recipient_user_id = $2) OR
                (sender_user_id = $2 AND recipient_user_id = $1)
              )
         ), ended_rooms AS (
           UPDATE blumi_mini_rooms
              SET ended_at = $3, ended_by_user_id = $1
            WHERE ended_at IS NULL
              AND (
                (participant_a_user_id = $1 AND participant_b_user_id = $2) OR
                (participant_a_user_id = $2 AND participant_b_user_id = $1)
              )
          RETURNING mini_room_id, lobby_room_id, participant_a_user_id,
                    participant_b_user_id, livekit_room_name, started_at,
                    ended_at, ended_by_user_id, completion_reward_date,
                    completion_requested_at, completion_requested_by_user_id,
                    source_thread_id, shared_decor
         ), released_participants AS (
           DELETE FROM blumi_active_mini_room_participants
            WHERE mini_room_id IN (SELECT mini_room_id FROM ended_rooms)
         )
         SELECT mini_room_id, lobby_room_id, participant_a_user_id,
                participant_b_user_id, livekit_room_name, started_at,
                ended_at, ended_by_user_id, completion_reward_date,
                completion_requested_at, completion_requested_by_user_id,
                source_thread_id, shared_decor
           FROM ended_rooms`,
        [input.actorUserId, input.otherUserId, new Date(input.endedAt)]
      )
      return result.rows.map(mapMiniRoom)
    }
  }
}

function isParticipantClaimViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "blumi_active_mini_room_participants_pkey"
  )
}

function mapInvite(row: QueryResultRow): MiniRoomInviteRecord {
  return {
    inviteId: String(row.invite_id),
    senderUserId: String(row.sender_user_id),
    recipientUserId: String(row.recipient_user_id),
    status: String(row.status) as MiniRoomInviteRecord["status"],
    createdAt: new Date(row.created_at).toISOString(),
    ...(typeof row.room_id === "string" && row.room_id
      ? { roomId: row.room_id }
      : {}),
    ...(typeof row.sender_spot_id === "string" && row.sender_spot_id
      ? { senderSpotId: row.sender_spot_id }
      : {}),
    ...(typeof row.source_thread_id === "string" && row.source_thread_id
      ? { sourceThreadId: row.source_thread_id }
      : {}),
    ...(row.expires_at
      ? { expiresAt: new Date(row.expires_at).toISOString() }
      : {}),
    ...(typeof row.room_session_id === "string" && row.room_session_id
      ? { roomSessionId: row.room_session_id }
      : {}),
    ...(row.decided_at
      ? { decidedAt: new Date(row.decided_at).toISOString() }
      : {})
  }
}

function mapMiniRoom(row: QueryResultRow): MiniRoomRecord {
  return cloneMiniRoom({
    miniRoomId: String(row.mini_room_id),
    lobbyRoomId: String(row.lobby_room_id),
    participantUserIds: [
      String(row.participant_a_user_id),
      String(row.participant_b_user_id)
    ],
    livekitRoomName: String(row.livekit_room_name),
    startedAt: new Date(row.started_at).toISOString(),
    ...(row.shared_decor ? { sharedDecor: sharedRoomDecorSnapshotSchema.parse(row.shared_decor) } : {}),
    ...(typeof row.source_thread_id === "string" && row.source_thread_id
      ? { sourceThreadId: row.source_thread_id }
      : {}),
    ...(row.ended_at ? { endedAt: new Date(row.ended_at).toISOString() } : {}),
    ...(row.ended_by_user_id ? { endedByUserId: String(row.ended_by_user_id) } : {}),
    ...(row.completion_reward_date
      ? { completionIntent: mapCompletionIntent(row) }
      : {})
  })
}

function mapCompletionIntent(row: QueryResultRow): MiniRoomCompletionIntent {
  const rewardDate = row.completion_reward_date instanceof Date
    ? row.completion_reward_date.toISOString().slice(0, 10)
    : String(row.completion_reward_date).slice(0, 10)
  return {
    rewardDate,
    requestedAt: new Date(row.completion_requested_at).toISOString(),
    requestedByUserId: String(row.completion_requested_by_user_id)
  }
}
