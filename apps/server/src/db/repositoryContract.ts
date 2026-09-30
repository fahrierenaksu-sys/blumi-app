import test from "node:test"
import { randomInt, randomUUID } from "node:crypto"
import { Pool } from "pg"

/**
 * Shared repository contract harness.
 *
 * Every case runs against the in-memory repository in the default server test
 * run and against the PostgreSQL repository under the isolated PostgreSQL gate
 * (`BLUMI_TEST_REQUIRE_POSTGRES=1` plus a gate-provided `DATABASE_URL`). A
 * case must only use the repository interface, so one assertion set defines
 * the behaviour both implementations owe their callers.
 *
 * Contract test files pass `process.env.DATABASE_URL` in explicitly: the gate
 * selects files that reference it, and each gate file gets a fresh database.
 */
export interface RepositoryContractBackend<Repository> {
  kind: "in-memory" | "postgres"
  repository: Repository
  /**
   * Readable ID scoped to this case: the same prefix returns the same ID
   * within a case, and never collides with another case's IDs.
   */
  id(prefix: string): string
  /**
   * Makes account rows exist for tables with account foreign keys. It is a
   * no-op in memory; in PostgreSQL it inserts minimal `blumi_accounts` rows.
   */
  ensureUsers(...userIds: string[]): Promise<void>
}

export interface RepositoryContractFactories<Repository> {
  inMemory(): Repository
  postgres(pool: Pool): Repository
}

export type RepositoryContractCase<Repository> = (
  backend: RepositoryContractBackend<Repository>
) => Promise<void>

export function runRepositoryContract<Repository>(input: {
  name: string
  databaseUrl: string | undefined
  factories: RepositoryContractFactories<Repository>
  cases: Readonly<Record<string, RepositoryContractCase<Repository>>>
}): void {
  const postgresRequired = process.env.BLUMI_TEST_REQUIRE_POSTGRES === "1"
  for (const [caseName, runCase] of Object.entries(input.cases)) {
    test(`${input.name} contract (in-memory): ${caseName}`, async () => {
      await runCase({
        kind: "in-memory",
        repository: input.factories.inMemory(),
        id: createIdFactory(),
        ensureUsers: async () => {}
      })
    })
    test(`${input.name} contract (postgres): ${caseName}`, {
      skip: postgresRequired ? false : "PostgreSQL contract runs in the isolated gate"
    }, async () => {
      if (!input.databaseUrl) {
        throw new Error("Use the isolated postgres-gate runner for PostgreSQL contracts.")
      }
      const pool = new Pool({ connectionString: input.databaseUrl, max: 4 })
      try {
        await runCase({
          kind: "postgres",
          repository: input.factories.postgres(pool),
          id: createIdFactory(),
          ensureUsers: (...userIds) => ensurePostgresUsers(pool, userIds)
        })
      } finally {
        await pool.end()
      }
    })
  }
}

function createIdFactory(): (prefix: string) => string {
  const scope = randomUUID().slice(0, 8)
  return (prefix) => `${prefix}_${scope}`
}

async function ensurePostgresUsers(pool: Pool, userIds: readonly string[]): Promise<void> {
  for (const userId of userIds) {
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id) DO NOTHING`,
      [`account_${userId}`, userId, `+1555${String(randomInt(0, 10_000_000)).padStart(7, "0")}`]
    )
  }
}
