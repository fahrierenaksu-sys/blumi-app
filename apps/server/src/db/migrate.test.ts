import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { runMigrationsWithClient } from "./migrate"

test("migration runner applies sql files once in sorted order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-migrations-"))
  await writeFile(join(directory, "002_second.sql"), "SELECT 2")
  await writeFile(join(directory, "001_first.sql"), "SELECT 1")
  const client = createFakeMigrationClient()

  const first = await runMigrationsWithClient(client as never, directory)
  const second = await runMigrationsWithClient(client as never, directory)

  assert.deepEqual(first.applied, ["001_first.sql", "002_second.sql"])
  assert.deepEqual(first.skipped, [])
  assert.deepEqual(second.applied, [])
  assert.deepEqual(second.skipped, ["001_first.sql", "002_second.sql"])
  assert.deepEqual(client.executedSql.filter((sql) => sql === "SELECT 1" || sql === "SELECT 2"), [
    "SELECT 1",
    "SELECT 2"
  ])
  assert.equal(client.releaseCount, 2)
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_lock")).length,
    2
  )
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_unlock")).length,
    2
  )
})

test("migration runner fails closed when an applied migration changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-migration-drift-"))
  const migrationPath = join(directory, "001_stable.sql")
  await writeFile(migrationPath, "SELECT 1")
  const client = createFakeMigrationClient()

  await runMigrationsWithClient(client as never, directory)
  await writeFile(migrationPath, "SELECT 2")

  await assert.rejects(
    runMigrationsWithClient(client as never, directory),
    /checksum mismatch.*001_stable\.sql/i
  )
  assert.equal(client.releaseCount, 2)
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_unlock")).length,
    2
  )
})

function createFakeMigrationClient() {
  const applied = new Map<string, string | null>()
  return {
    executedSql: [] as string[],
    releaseCount: 0,
    async query(sql: string, values?: unknown[]) {
      this.executedSql.push(sql.trim())
      if (sql.includes("SELECT checksum FROM blumi_migrations")) {
        const id = String(values?.[0])
        return applied.has(id)
          ? { rowCount: 1, rows: [{ checksum: applied.get(id) }] }
          : { rowCount: 0, rows: [] }
      }
      if (sql.includes("INSERT INTO blumi_migrations")) {
        applied.set(String(values?.[0]), String(values?.[1]))
      }
      if (sql.includes("UPDATE blumi_migrations") && sql.includes("checksum")) {
        applied.set(String(values?.[0]), String(values?.[1]))
      }
      return { rowCount: 0, rows: [] }
    },
    release() {
      this.releaseCount += 1
    }
  }
}
