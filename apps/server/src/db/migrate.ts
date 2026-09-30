import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Pool, type PoolClient } from "pg"
import { resolveServerConfig } from "../config"

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS blumi_migrations (
    id TEXT PRIMARY KEY,
    checksum CHAR(64),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE blumi_migrations
    ADD COLUMN IF NOT EXISTS checksum CHAR(64)
`

// A migration takes table locks inside its transaction. Without a limit a
// migration queued behind a long reader holds every later request on that
// table in the lock queue. The limit is applied with SET LOCAL inside the
// migration transaction, so it does not depend on a pooler forwarding
// startup options and never leaks to the session.
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 5_000
// Separate from the lock limit: how long the pool waits to open a database
// connection at all (network, TLS, pooler queue, authentication).
export const DEFAULT_MIGRATION_CONNECT_TIMEOUT_MS = 10_000

export interface MigrationTimeouts {
  lockTimeoutMs?: number
  connectTimeoutMs?: number
}

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

export async function runMigrations(input: {
  databaseUrl: string
  migrationsDirectory?: string
} & MigrationTimeouts): Promise<MigrationResult> {
  const pool = new Pool({
    connectionString: input.databaseUrl,
    max: 1,
    connectionTimeoutMillis: requireTimeout(
      input.connectTimeoutMs ?? DEFAULT_MIGRATION_CONNECT_TIMEOUT_MS,
      "connectTimeoutMs"
    )
  })

  try {
    return await runMigrationsWithClient(
      await pool.connect(),
      input.migrationsDirectory ?? defaultMigrationsDirectory(),
      { lockTimeoutMs: input.lockTimeoutMs }
    )
  } finally {
    await pool.end()
  }
}

export async function runMigrationsWithClient(
  client: PoolClient,
  migrationsDirectory: string,
  options: Pick<MigrationTimeouts, "lockTimeoutMs"> = {}
): Promise<MigrationResult> {
  const lockTimeoutMs = requireTimeout(
    options.lockTimeoutMs ?? DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
    "lockTimeoutMs"
  )
  try {
    await client.query(MIGRATIONS_TABLE_SQL)
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('blumi:migrations', 0))"
    )
    try {
      const files = (await readdir(migrationsDirectory))
        .filter((file) => file.endsWith(".sql"))
        .sort()
      const applied: string[] = []
      const skipped: string[] = []

      for (const file of files) {
        const sql = await readFile(join(migrationsDirectory, file), "utf8")
        const checksum = createMigrationChecksum(sql)
        const alreadyApplied = await client.query(
          "SELECT checksum FROM blumi_migrations WHERE id = $1",
          [file]
        )
        if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
          const storedChecksum = alreadyApplied.rows[0]?.checksum
          if (storedChecksum === null || storedChecksum === undefined) {
            await client.query(
              `UPDATE blumi_migrations
                  SET checksum = $2
                WHERE id = $1
                  AND checksum IS NULL`,
              [file, checksum]
            )
          } else if (String(storedChecksum).trim() !== checksum) {
            throw new Error(
              `Migration checksum mismatch for ${file}; applied migrations are immutable.`
            )
          }
          skipped.push(file)
          continue
        }

        await client.query("BEGIN")
        try {
          await client.query("SELECT set_config('lock_timeout', $1, true)", [
            `${lockTimeoutMs}ms`
          ])
          await client.query(sql)
          await client.query(
            "INSERT INTO blumi_migrations (id, checksum) VALUES ($1, $2)",
            [file, checksum]
          )
          await client.query("COMMIT")
          applied.push(file)
        } catch (error) {
          await client.query("ROLLBACK")
          throw error
        }
      }

      return { applied, skipped }
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended('blumi:migrations', 0))"
      )
    }
  } finally {
    client.release()
  }
}

function requireTimeout(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 600_000) {
    throw new Error(`${name} must be an integer between 1 and 600000 milliseconds.`)
  }
  return value
}

export function parseMigrationTimeouts(
  env: Record<string, string | undefined>
): MigrationTimeouts {
  const read = (key: string): number | undefined => {
    const raw = env[key]?.trim()
    if (!raw) return undefined
    if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a whole number of milliseconds.`)
    return Number(raw)
  }
  return {
    lockTimeoutMs: read("BLUMI_MIGRATION_LOCK_TIMEOUT_MS"),
    connectTimeoutMs: read("BLUMI_MIGRATION_CONNECT_TIMEOUT_MS")
  }
}

function createMigrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex")
}

function defaultMigrationsDirectory(): string {
  return resolve(__dirname, "../../db/migrations")
}

if (require.main === module) {
  const config = resolveServerConfig({
    ...process.env,
    BLUMI_AUTH_REPOSITORY:
      process.env.BLUMI_AUTH_REPOSITORY ?? "postgres"
  })
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.")
  }

  runMigrations({
    databaseUrl: config.databaseUrl,
    ...parseMigrationTimeouts(process.env)
  })
    .then((result) => {
      process.stdout.write(
        `Blumi migrations applied=${result.applied.length} skipped=${result.skipped.length}\n`
      )
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      process.exit(1)
    })
}
