import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { assertBetaResetRunsReady, assertResetMayRun, BETA_RESET_RUNS_TABLE, countBetaResetRuns, recordBetaResetRun } from "./betaResetRuns"

const RUN = { commit: "0123456789ab", planHash: "a".repeat(64), repeatReason: null }

test("the reset marker refuses an unrecorded apply, a second apply without a reason, and a concurrent apply", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  const first = await pool.connect()
  const second = await pool.connect()
  try {
    // Without migration 076 the dry run says so and an apply is refused before it locks anything.
    await first.query("BEGIN")
    await first.query(`DROP TABLE ${BETA_RESET_RUNS_TABLE}`)
    assert.equal(await countBetaResetRuns(first), null)
    await assert.rejects(assertBetaResetRunsReady(first), /076_beta_reset_runs\.sql is not applied.*refused/)
    await first.query("ROLLBACK")

    assert.equal(await countBetaResetRuns(first), 0)
    await assertBetaResetRunsReady(first)
    // Two applies race: the second waits on the first one's lock, then sees its committed row.
    await first.query("BEGIN")
    await first.query(`LOCK TABLE ${BETA_RESET_RUNS_TABLE} IN EXCLUSIVE MODE`)
    await assertResetMayRun(first, null)
    await second.query("BEGIN")
    const secondLocked = second.query(`LOCK TABLE ${BETA_RESET_RUNS_TABLE} IN EXCLUSIVE MODE`)
    await recordBetaResetRun(first, RUN)
    await first.query("COMMIT")
    await secondLocked
    await assert.rejects(assertResetMayRun(second, null), /already applied to this database \(1 recorded\)/)
    await assertResetMayRun(second, "owner approved a second run")
    await second.query("ROLLBACK")

    // A rolled-back reset leaves no marker.
    await first.query("BEGIN")
    await recordBetaResetRun(first, { ...RUN, repeatReason: "rolled back with the reset" })
    await first.query("ROLLBACK")
    assert.equal(await countBetaResetRuns(first), 1)

    // The table refuses anything but a commit, a plan hash and a bounded reason.
    for (const bad of [{ ...RUN, commit: "not-a-commit" }, { ...RUN, planHash: "short" }, { ...RUN, repeatReason: "short" }]) {
      await assert.rejects(recordBetaResetRun(first, bad), /check constraint/)
    }
    const { rows } = await first.query(`SELECT relrowsecurity AS rls,
      has_table_privilege('anon', 'public.${BETA_RESET_RUNS_TABLE}', 'SELECT') AS anon,
      has_table_privilege('authenticated', 'public.${BETA_RESET_RUNS_TABLE}', 'SELECT') AS authenticated
      FROM pg_class WHERE relname = $1`, [BETA_RESET_RUNS_TABLE])
    assert.deepEqual(rows[0], { rls: true, anon: false, authenticated: false })
  } finally {
    await first.query("ROLLBACK").catch(() => undefined)
    await second.query("ROLLBACK").catch(() => undefined)
    first.release()
    second.release()
    await pool.end()
  }
})
