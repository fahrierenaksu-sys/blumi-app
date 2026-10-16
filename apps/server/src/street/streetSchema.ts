import {
  createMigrationLedgerProbe,
  createStaticChatReceiptSchema,
  type ChatReceiptSchemaProbe,
  type MigrationLedgerProbeOptions
} from "../chat/chatReceiptSchema"

/** The street table arrives with migration 079; until its ledger row exists the street stays off. */
export const STREET_MIGRATION_ID = "079_street.sql"

export type StreetSchemaProbe = ChatReceiptSchemaProbe

export function createStreetSchemaProbe(
  pool: Parameters<typeof createMigrationLedgerProbe>[0],
  options: MigrationLedgerProbeOptions = {}
): StreetSchemaProbe {
  return createMigrationLedgerProbe(pool, STREET_MIGRATION_ID, options)
}

export const createStaticStreetSchema = createStaticChatReceiptSchema
