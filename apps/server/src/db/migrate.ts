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

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

export async function runMigrations(input: {
  databaseUrl: string
  migrationsDirectory?: string
}): Promise<MigrationResult> {
  const pool = new Pool({
    connectionString: input.databaseUrl
  })

  try {
    return await runMigrationsWithClient(
      await pool.connect(),
      input.migrationsDirectory ?? defaultMigrationsDirectory()
    )
  } finally {
    await pool.end()
  }
}

export async function runMigrationsWithClient(
  client: PoolClient,
  migrationsDirectory: string
): Promise<MigrationResult> {
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

  runMigrations({ databaseUrl: config.databaseUrl })
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
