import {
  createMigrationLedgerProbe,
  type ChatReceiptSchemaProbe,
  type MigrationLedgerProbeOptions
} from "./chatReceiptSchema"

/**
 * "Delete chat for me" stores a per-participant `hidden_through`, added by
 * migration 071. Like receipts (070), the binary ships before the owner
 * applies it: until the ledger row with the packaged checksum exists, no
 * query names `hidden_through`, and the hide route answers 409
 * CHAT_HIDE_UNAVAILABLE so the app keeps its on-device hide.
 */
export const CHAT_HIDE_MIGRATION_ID = "071_chat_hide_for_me_and_advisor_fixes.sql"

export type ChatHideSchemaProbe = ChatReceiptSchemaProbe

export function createChatHideSchemaProbe(
  pool: Parameters<typeof createMigrationLedgerProbe>[0],
  options: MigrationLedgerProbeOptions = {}
): ChatHideSchemaProbe {
  return createMigrationLedgerProbe(pool, CHAT_HIDE_MIGRATION_ID, options)
}
