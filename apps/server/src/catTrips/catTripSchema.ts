import { createMigrationLedgerProbe, type ChatReceiptSchemaProbe, type MigrationLedgerProbeOptions } from "../chat/chatReceiptSchema"

/**
 * The traveling cat's tables come from migration 077. Like receipts (070) the
 * binary ships before the owner applies it: until the ledger row with the
 * packaged checksum exists, no query names these tables and every cat route
 * answers `enabled: false`.
 */
export const CAT_TRIPS_MIGRATION_ID = "077_cat_trips.sql"

export type CatTripSchemaProbe = ChatReceiptSchemaProbe

export function createCatTripSchemaProbe(
  pool: Parameters<typeof createMigrationLedgerProbe>[0],
  options: MigrationLedgerProbeOptions = {}
): CatTripSchemaProbe {
  return createMigrationLedgerProbe(pool, CAT_TRIPS_MIGRATION_ID, options)
}
