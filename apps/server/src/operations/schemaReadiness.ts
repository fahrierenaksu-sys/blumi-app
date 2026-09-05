import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

interface MigrationIdentity { id: string; checksum: string }
interface SchemaQueryExecutor {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

/** Read the packaged schema manifest once at service construction, not on each probe. */
export function createSchemaReadinessCheck(
  pool: SchemaQueryExecutor,
  expected: readonly MigrationIdentity[] = loadPackagedMigrationManifest()
): () => Promise<void> {
  if (!expected.length) throw new Error("Packaged migration manifest is empty")
  return async () => {
    const result = await pool.query("SELECT id, checksum FROM blumi_migrations WHERE id = ANY($1::text[])", [expected.map(row => row.id)])
    const actual = new Map(result.rows.map(row => [String(row.id), String(row.checksum).trim()]))
    if (expected.some(row => actual.get(row.id) !== row.checksum)) throw new Error("Database migrations are incomplete or incompatible")
    const missing = await pool.query(
      "SELECT relation FROM unnest($1::text[]) AS relation WHERE to_regclass(relation) IS NULL",
      [["blumi_accounts", "blumi_sessions", "blumi_chat_messages", "blumi_push_delivery_outbox", "blumi_realtime_tickets"]]
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
