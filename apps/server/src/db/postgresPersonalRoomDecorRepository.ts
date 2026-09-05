import type { QueryResultRow } from "pg"
import {
  clonePersonalRoomDecor,
  type PersonalRoomDecorRepository,
  type PersonalRoomDecorSnapshot
} from "../rooms/personalRoomDecorRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[]; rowCount?: number | null }>
}

export function createPostgresPersonalRoomDecorRepository(
  pool: QueryExecutor
): PersonalRoomDecorRepository {
  return {
    async get(userId) {
      const result = await pool.query(
        `SELECT user_id, revision, decor, updated_at
           FROM blumi_personal_room_decor
          WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0] ? mapSnapshot(result.rows[0]) : null
    },
    async save(input) {
      const saved = await pool.query(
        input.expectedRevision === 0 ? `INSERT INTO blumi_personal_room_decor (
            user_id, revision, decor, updated_at
          )
          SELECT $1, 1, $3::jsonb, $4
           WHERE $2 = 0
          ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id, revision, decor, updated_at`
        : `UPDATE blumi_personal_room_decor SET
            revision = blumi_personal_room_decor.revision + 1,
            decor = $3::jsonb,
            updated_at = $4
          WHERE user_id = $1 AND blumi_personal_room_decor.revision = $2
        RETURNING user_id, revision, decor, updated_at`,
        [
          input.userId,
          input.expectedRevision,
          JSON.stringify(input.decor),
          new Date(input.updatedAt)
        ]
      )
      if (saved.rows[0]) {
        return { kind: "saved", snapshot: mapSnapshot(saved.rows[0]) }
      }
      const current = await this.get(input.userId)
      if (!current) {
        throw new Error("Personal room revision could not be resolved.")
      }
      return { kind: "conflict", current }
    }
  }
}

function mapSnapshot(row: QueryResultRow): PersonalRoomDecorSnapshot {
  const decor =
    typeof row.decor === "string"
      ? JSON.parse(row.decor) as PersonalRoomDecorSnapshot["decor"]
      : row.decor as PersonalRoomDecorSnapshot["decor"]
  return {
    userId: String(row.user_id),
    revision: Number(row.revision),
    decor: clonePersonalRoomDecor(decor),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}
