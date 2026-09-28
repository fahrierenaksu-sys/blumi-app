import { Pool } from "pg"
import { auditDatabaseRelease, type DatabaseReleaseAudit } from "../src/operations/databaseReleaseAudit"

const expectedProjectRef = process.argv[process.argv.indexOf("--project-ref") + 1]
const connectionString = process.env.DATABASE_URL?.trim()
if (!/^[a-z0-9]{20}$/.test(expectedProjectRef ?? "")) {
  throw new Error("Pass the exact Supabase project ref with --project-ref.")
}
if (!connectionString) throw new Error("DATABASE_URL is required.")
const connection = new URL(connectionString)
if (connection.username.split(".").at(-1) !== expectedProjectRef) {
  throw new Error("DATABASE_URL does not match --project-ref; audit refused.")
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 })
async function main(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN READ ONLY")
    await client.query("SET LOCAL statement_timeout = '20s'")
    const result = await auditDatabaseRelease(client)
    await client.query("ROLLBACK")
    const findings = issueCount(result)
    process.stdout.write(JSON.stringify({ projectRef: expectedProjectRef, ...result, findings }, null, 2) + "\n")
    if (process.argv.includes("--require-clean") && findings > 0) process.exitCode = 2
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

function issueCount(result: DatabaseReleaseAudit): number {
  return result.missingMigrations + result.changedMigrations + result.unexpectedMigrations +
    result.orphanInventories + result.duplicateAvatarInventoryRows + result.duplicateRoomInventoryRows +
    result.malformedAvatarInventoryRows + result.malformedRoomInventoryRows + result.invalidBalanceRows +
    result.unknownOwnedAvatarIds + result.unknownOwnedRoomIds + result.unknownEquippedAvatarIds +
    result.unownedEquippedAvatarIds + result.exposedTables + result.exposedSequences + result.exposedFunctions
}

void main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
