import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { CHAT_RECEIPTS_MIGRATION_ID } from "../chat/chatReceiptSchema"

interface MigrationIdentity { id: string; checksum: string }
interface SchemaQueryExecutor {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

/**
 * Additive migrations this binary can run without. The code that uses their
 * objects probes the ledger at runtime and stays off until they are applied,
 * so the binary may deploy first. If one is applied, its checksum must still
 * match the packaged file. Add an id here only together with such a probe.
 */
export const OPTIONAL_READINESS_MIGRATIONS: readonly string[] = Object.freeze([
  CHAT_RECEIPTS_MIGRATION_ID
])

/** Read the packaged schema manifest once at service construction, not on each probe. */
export function createSchemaReadinessCheck(
  pool: SchemaQueryExecutor,
  expected: readonly MigrationIdentity[] = loadPackagedMigrationManifest(),
  optional: readonly string[] = OPTIONAL_READINESS_MIGRATIONS
): () => Promise<void> {
  if (!expected.length) throw new Error("Packaged migration manifest is empty")
  const optionalIds = new Set(optional)
  return async () => {
    const result = await pool.query("SELECT id, checksum FROM blumi_migrations WHERE id = ANY($1::text[])", [expected.map(row => row.id)])
    const actual = new Map(result.rows.map(row => [String(row.id), String(row.checksum).trim()]))
    if (expected.some(row => {
      const applied = actual.get(row.id)
      if (applied === undefined && optionalIds.has(row.id)) return false
      return applied !== row.checksum
    })) throw new Error("Database migrations are incomplete or incompatible")
    const missing = await pool.query(
      "SELECT relation FROM unnest($1::text[]) AS relation WHERE to_regclass(relation) IS NULL",
      [["blumi_accounts", "blumi_sessions", "blumi_chat_messages", "blumi_push_delivery_outbox", "blumi_realtime_tickets", "blumi_admin_user_audit", "blumi_realtime_connection_leases"]]
    )
    if (missing.rows.length) throw new Error("Required database schema is missing")
  }
}

function loadPackagedMigrationManifest(): readonly MigrationIdentity[] {
  const directory = resolve(__dirname, "../../db/migrations")
  return readdirSync(directory).filter(name => name.endsWith(".sql")).sort().map(id => ({
    id, checksum: createHash("sha256").update(readFileSync(join(directory, id), "utf8")).digest("hex")
  }))
}
