import type { QueryResultRow } from "pg"
import {
  cloneRoomShowcaseSnapshot,
  type RoomShowcaseSnapshot,
  type RoomSnapshotRepository
} from "../rooms/roomSnapshotRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[]; rowCount?: number | null }>
}

export function createPostgresRoomSnapshotRepository(
  pool: QueryExecutor
): RoomSnapshotRepository {
  return {
    async getLatest(userId) {
      const result = await pool.query(
        `SELECT user_id, room_revision, asset_key, mime_type,
                renderer_version, body, is_public, headline, updated_at
           FROM blumi_room_showcase_snapshots
          WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0] ? mapSnapshot(result.rows[0]) : null
    },
    async findByAssetKey(assetKey) {
      const result = await pool.query(
        `SELECT user_id, room_revision, asset_key, mime_type,
                renderer_version, body, is_public, headline, updated_at
           FROM blumi_room_showcase_snapshots
          WHERE asset_key = $1`,
        [assetKey]
      )
      return result.rows[0] ? mapSnapshot(result.rows[0]) : null
    },
    async save(input) {
      const result = await pool.query(
        `INSERT INTO blumi_room_showcase_snapshots (
           user_id, room_revision, asset_key, mime_type,
           renderer_version, body, is_public, headline, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) DO UPDATE SET
           room_revision = EXCLUDED.room_revision,
           asset_key = EXCLUDED.asset_key,
           mime_type = EXCLUDED.mime_type,
           renderer_version = EXCLUDED.renderer_version,
           body = EXCLUDED.body,
           updated_at = EXCLUDED.updated_at
         WHERE blumi_room_showcase_snapshots.room_revision < EXCLUDED.room_revision
         RETURNING user_id, room_revision, asset_key, mime_type,
                   renderer_version, body, is_public, headline, updated_at`,
        [
          input.userId,
          input.roomRevision,
          input.assetKey,
          input.mimeType,
          input.rendererVersion,
          input.body,
          input.isPublic,
          input.headline,
          new Date(input.updatedAt)
        ]
      )
      if (result.rows[0]) return mapSnapshot(result.rows[0])
      const current = await this.getLatest(input.userId)
      if (!current) throw new Error("Room showcase snapshot could not be resolved.")
      return cloneRoomShowcaseSnapshot(current)
    },
    async updateVisibility(input) {
      const result = await pool.query(
        `UPDATE blumi_room_showcase_snapshots
            SET is_public = $3, headline = $4
          WHERE user_id = $1 AND room_revision = $2
          RETURNING user_id, room_revision, asset_key, mime_type,
                    renderer_version, body, is_public, headline, updated_at`,
        [input.userId, input.roomRevision, input.isPublic, input.headline]
      )
      return result.rows[0] ? mapSnapshot(result.rows[0]) : null
    }
  }
}

function mapSnapshot(row: QueryResultRow): RoomShowcaseSnapshot {
  const body = row.body instanceof Uint8Array
    ? Buffer.from(row.body)
    : Buffer.from(String(row.body), "base64")
  return {
    userId: String(row.user_id),
    roomRevision: Number(row.room_revision),
    assetKey: String(row.asset_key),
    mimeType: row.mime_type === "image/webp"
      ? "image/webp"
      : (() => { throw new Error("Unsupported room snapshot mime type.") })(),
    rendererVersion: String(row.renderer_version),
    body,
    isPublic: Boolean(row.is_public),
    headline: typeof row.headline === "string" ? row.headline : null,
    updatedAt: new Date(row.updated_at as string | Date).toISOString()
  }
}
