import type { RoomLayout } from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import type { RoomRepository } from "../rooms/roomRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresRoomRepository(
  pool: QueryExecutor
): RoomRepository {
  return {
    async findLayout(roomId) {
      const result = await pool.query(
        `SELECT room_id, spots, proximity_radius
           FROM blumi_room_layouts
          WHERE room_id = $1`,
        [roomId]
      )
      return result.rows[0] ? mapLayout(result.rows[0]) : null
    },
    async saveLayout(layout) {
      await pool.query(
        `INSERT INTO blumi_room_layouts (
            room_id, spots, proximity_radius, created_at
          ) VALUES ($1, $2, $3, now())
          ON CONFLICT (room_id) DO UPDATE SET
            spots = EXCLUDED.spots,
            proximity_radius = EXCLUDED.proximity_radius`,
        [layout.roomId, JSON.stringify(layout.spots), layout.proximityRadius]
      )
    }
  }
}

function mapLayout(row: QueryResultRow): RoomLayout {
  const spots = Array.isArray(row.spots) ? row.spots : []
  return {
    roomId: String(row.room_id),
    proximityRadius: Number(row.proximity_radius),
    spots: spots.map((spot) => ({
      spotId: String(spot.spotId),
      kind: spot.kind === "seat" ? "seat" : "hotspot",
      x: Number(spot.x),
      y: Number(spot.y),
      ...(typeof spot.label === "string" ? { label: spot.label } : {})
    }))
  }
}
