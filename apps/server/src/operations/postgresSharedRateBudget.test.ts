import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresRateBudget, userBudgetKey } from "./sharedRateBudget"

test("independent PostgreSQL instances atomically enforce one user budget", { skip: !process.env.DATABASE_URL }, async () => {
  const pools = [new Pool({ connectionString: process.env.DATABASE_URL }), new Pool({ connectionString: process.env.DATABASE_URL })]
  try {
    const instances = pools.map(pool => createPostgresRateBudget(pool))
    const minute = async () => String((await pools[0]!.query("SELECT floor(extract(epoch FROM clock_timestamp()) / 60) AS minute")).rows[0].minute)
    for (let attempt = 0; attempt < 3; attempt++) {
      const user = `rate_test_${randomUUID()}`, before = await minute()
      const results = await Promise.all(Array.from({ length: 110 }, (_, i) => instances[i % 2]!.consumeUser(user)))
      // A fixed-window budget intentionally renews at a minute boundary.
      if (before !== await minute()) continue
      assert.equal(results.filter(result => result.allowed).length, 100)
      assert.equal(results.filter(result => !result.allowed).length, 10)
      assert.ok(results.every(result => result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 60))
      assert.equal((await instances[0]!.consumeUser(`${user}_other`)).allowed, true)
      // Model an older statement reaching the row lock after a newer window.
      await pools[0]!.query("UPDATE blumi_shared_rate_budgets SET window_started_ms = window_started_ms + 60000 WHERE budget_key = $1", [userBudgetKey(user)])
      assert.equal((await instances[1]!.consumeUser(user)).allowed, false)
      await instances[1]!.purgeExpired()
      return
    }
    assert.fail("Unable to exercise one stable rate window")
  } finally { await Promise.all(pools.map(pool => pool.end())) }
})
