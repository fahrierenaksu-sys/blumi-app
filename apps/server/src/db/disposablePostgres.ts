import assert from "node:assert/strict"

/**
 * Guards for tests that write to PostgreSQL. `DATABASE_URL` alone is not
 * enough: `.env.local` can point at the live database, so a shell that
 * exported it would make a plain `npm test` write there. Writing tests run
 * only inside the isolated gate (`npm run verify:postgres`), which sets
 * `BLUMI_TEST_REQUIRE_POSTGRES=1` and a per-file database on a throwaway
 * local cluster.
 */
export function disposablePostgresSkip(): { skip: boolean } {
  return {
    skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL?.trim()
  }
}

export function assertDisposablePostgresDatabase(
  databaseUrl: string | undefined
): asserts databaseUrl is string {
  assert.ok(databaseUrl, "DATABASE_URL is required")
  assert.equal(process.env.BLUMI_TEST_REQUIRE_POSTGRES, "1",
    "run this integration test only through the disposable PostgreSQL gate")
  const url = new URL(databaseUrl)
  assert.equal(url.hostname, "localhost", "PostgreSQL gate must use its local Unix socket")
  assert.match(url.searchParams.get("host") ?? "", /blumi-pg-gate-/,
    "PostgreSQL socket must belong to a disposable blumi-pg-gate cluster")
  assert.match(url.pathname, /^\/blumi_gate_\d+$/,
    "integration tests require a per-file disposable blumi_gate database")
}

/**
 * Returns the connection string only when it points at a disposable gate
 * database. Pass every test connection through this so the check runs right
 * before the first connect, whatever the test does with the pool.
 */
export function disposablePostgresUrl(databaseUrl: string | undefined): string {
  assertDisposablePostgresDatabase(databaseUrl)
  return databaseUrl
}

/**
 * Environment for a child test process. `DATABASE_URL` survives only when the
 * isolated gate set it (gate flag plus a throwaway-cluster URL). Any other
 * value, for example one exported in the developer's shell, is dropped, so a
 * plain test run cannot reach a real database even by mistake.
 */
export function sanitizeTestDatabaseEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { DATABASE_URL: databaseUrl, BLUMI_TEST_REQUIRE_POSTGRES: gateFlag, ...rest } = environment
  if (gateFlag === "1" && databaseUrl && isDisposablePostgresUrl(databaseUrl)) {
    return { ...rest, DATABASE_URL: databaseUrl, BLUMI_TEST_REQUIRE_POSTGRES: gateFlag }
  }
  return rest
}

function isDisposablePostgresUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl)
    return url.hostname === "localhost"
      && /blumi-pg-gate-/.test(url.searchParams.get("host") ?? "")
      && /^\/blumi_gate_\d+$/.test(url.pathname)
  } catch {
    return false
  }
}
