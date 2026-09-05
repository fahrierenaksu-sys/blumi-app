import type { QueryResultRow } from "pg"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import type {
  PresenceRecord,
  PresenceRepository
} from "../presence/presenceRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresPresenceRepository(
  pool: QueryExecutor
): PresenceRepository {
  return {
    async listRoomPresence(roomId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.room_id = $1
          ORDER BY presence.joined_at ASC`,
        [roomId]
      )
      return result.rows.map(mapPresence)
    },
    async findUserPresence(roomId, userId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.room_id = $1 AND presence.user_id = $2`,
        [roomId, userId]
      )
      return result.rows[0] ? mapPresence(result.rows[0]) : null
    },
    async findUserPresenceAcrossRooms(userId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.user_id = $1
          ORDER BY presence.updated_at DESC
          LIMIT 1`,
        [userId]
      )
      return result.rows[0] ? mapPresence(result.rows[0]) : null
    },
    async savePresence(record) {
      await pool.query(
        `INSERT INTO blumi_room_presence (
            room_id, user_id, display_name, spot_id,
            in_mini_room, joined_at, updated_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (room_id, user_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            spot_id = EXCLUDED.spot_id,
            in_mini_room = EXCLUDED.in_mini_room,
            updated_at = EXCLUDED.updated_at,
            expires_at = EXCLUDED.expires_at`,
        [
          record.roomId,
          record.userId,
          record.displayName,
          record.spotId,
          record.inMiniRoom,
          record.joinedAt,
          record.updatedAt,
          record.expiresAt
        ]
      )
    },
    async updateUserAvatarSelection() {
      // Account rows are the canonical avatar source. This legacy interface
      // remains a no-op so callers cannot reintroduce a fallible dual write.
    },
    async deletePresence(roomId, userId) {
      await pool.query(
        `DELETE FROM blumi_room_presence
          WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      )
    },
    async deleteUserPresence(userId) {
      await pool.query(
        "DELETE FROM blumi_room_presence WHERE user_id = $1",
        [userId]
      )
    },
    async updateMiniRoomStatus(userIds, inMiniRoom) {
      if (userIds.length === 0) return
      await pool.query(
        `UPDATE blumi_room_presence
            SET in_mini_room = $1,
                updated_at = now()
          WHERE user_id = ANY($2::text[])`,
        [inMiniRoom, [...userIds]]
      )
    }
  }
}

async function deleteExpired(pool: QueryExecutor, now: Date): Promise<void> {
  await pool.query(
    "DELETE FROM blumi_room_presence WHERE expires_at <= $1",
    [now]
  )
}

function mapPresence(row: QueryResultRow): PresenceRecord {
  return {
    roomId: String(row.room_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    avatar: normalizeStoredAvatarSelection({
      presetId: row.avatar_preset_id,
      loadout: row.avatar_selection,
      revision: row.avatar_revision
    }),
    spotId: String(row.spot_id),
    inMiniRoom: Boolean(row.in_mini_room),
    joinedAt: new Date(row.joined_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString()
  }
}
