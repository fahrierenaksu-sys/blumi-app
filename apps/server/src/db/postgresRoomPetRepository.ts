import type { QueryResultRow } from "pg"
import type { RoomPetNameStatus, RoomPetRecord, RoomPetRepository, RoomPetRoomState } from "../roomPets/roomPetRepository"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[]; rowCount?: number | null }>
}

const PET_COLUMNS = "pet_id, user_id, species_item_id, name, name_status, room_state, revision, created_at, updated_at"

export function createPostgresRoomPetRepository(pool: QueryExecutor): RoomPetRepository {
  async function findByUser(userId: string): Promise<RoomPetRecord | null> {
    const result = await pool.query(`SELECT ${PET_COLUMNS} FROM blumi_room_pets WHERE user_id = $1`, [userId])
    return result.rows[0] ? toRecord(result.rows[0]) : null
  }

  return {
    findByUser,
    async adopt(input) {
      // UNIQUE (user_id) decides a race: exactly one concurrent adopt inserts.
      const inserted = await pool.query(
        `INSERT INTO blumi_room_pets (pet_id, user_id, species_item_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING ${PET_COLUMNS}`,
        [input.petId, input.userId, input.speciesItemId, input.name, input.createdAt]
      )
      if (inserted.rows[0]) return { outcome: "adopted", pet: toRecord(inserted.rows[0]) }
      const existing = await findByUser(input.userId)
      if (!existing) throw new Error("Room pet adopt conflicted without an existing pet.")
      return { outcome: "already_has_pet", pet: existing }
    },
    async rename(userId, name, updatedAt) {
      const result = await pool.query(
        `UPDATE blumi_room_pets
         SET name = $2, name_status = 'active', revision = revision + 1, updated_at = $3
         WHERE user_id = $1
         RETURNING ${PET_COLUMNS}`,
        [userId, name, updatedAt]
      )
      return result.rows[0] ? toRecord(result.rows[0]) : null
    },
    async deleteByUser(userId) {
      const result = await pool.query("DELETE FROM blumi_room_pets WHERE user_id = $1", [userId])
      return result.rowCount ?? 0
    }
  }
}

function toRecord(row: QueryResultRow): RoomPetRecord {
  return {
    petId: String(row.pet_id),
    userId: String(row.user_id),
    speciesItemId: String(row.species_item_id),
    name: String(row.name),
    nameStatus: row.name_status as RoomPetNameStatus,
    roomState: row.room_state as RoomPetRoomState,
    revision: Number(row.revision),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}
