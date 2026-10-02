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
