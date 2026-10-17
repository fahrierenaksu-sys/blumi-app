import { createMigrationLedgerProbe, type ChatReceiptSchemaProbe, type MigrationLedgerProbeOptions } from "../chat/chatReceiptSchema"

/**
 * The room pet table comes from migration 078. The binary may ship before
 * the owner applies it: until the ledger row with the packaged checksum
 * exists, no query names the table and the pet routes answer 409.
 */
export const ROOM_PETS_MIGRATION_ID = "078_room_pets.sql"

export type RoomPetSchemaProbe = ChatReceiptSchemaProbe

export function createRoomPetSchemaProbe(
  pool: Parameters<typeof createMigrationLedgerProbe>[0],
  options: MigrationLedgerProbeOptions = {}
): RoomPetSchemaProbe {
  return createMigrationLedgerProbe(pool, ROOM_PETS_MIGRATION_ID, options)
}
