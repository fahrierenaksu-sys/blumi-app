import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { classifyDatabaseError } from "../operations/databaseErrorStatus"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { retryStatementConflictOnce } from "./databasePoolConfig"

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }

function openPool(): Pool {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("expected the statement to fail")
}

/**
 * Makes `statement` deadlock against a transaction that holds advisory lock 1
 * and then asks for lock 2, which the statement takes first. The statement
 * starts waiting first, so PostgreSQL's deadlock check runs in its backend and
 * aborts it (40P01); the holder then gets lock 2 and commits.
 */
async function deadlockAgainst(pool: Pool, keys: { first: number; second: number }, run: () => Promise<unknown>): Promise<unknown> {
  const holder = await pool.connect()
  try {
    await holder.query("BEGIN")
    await holder.query("SELECT pg_advisory_xact_lock($1)", [keys.first])
    const statement = run()
    // Give the statement time to take lock 2 and queue for lock 1.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await holder.query("SELECT pg_advisory_xact_lock($1)", [keys.second])
    await holder.query("COMMIT")
    return await statement
  } finally {
    holder.release()
  }
}

test("a real unique violation from node-postgres maps to 409 and logs only its SQLSTATE", requirePostgres, async () => {
  const pool = openPool()
  const table = `dberr_${randomUUID().replaceAll("-", "")}`
  try {
    await pool.query(`CREATE TABLE ${table} (id text PRIMARY KEY)`)
    await pool.query(`INSERT INTO ${table} VALUES ('+905551112233')`)
    const error = await rejection(pool.query(`INSERT INTO ${table} VALUES ('+905551112233')`))
    assert.ok(error instanceof Error)
    assert.equal(error.name, "error", "node-postgres names server errors 'error'")
    assert.deepEqual(classifyDatabaseError(error), { statusCode: 409, sqlState: "23505" })
    assert.equal(safeOperationalErrorKind(error), "DatabaseError")
  } finally {
    await pool.query(`DROP TABLE IF EXISTS ${table}`)
    await pool.end()
  }
})

test("a real deadlock maps to 503 with a retry hint when nothing retries it", requirePostgres, async () => {
  const pool = openPool()
  const first = Math.floor(Math.random() * 1e9)
  const second = first + 1
  try {
    const error = await deadlockAgainst(pool, { first, second }, () => rejection(
      pool.query("SELECT pg_advisory_xact_lock($2), pg_advisory_xact_lock($1)", [first, second])
    ))
    assert.deepEqual(classifyDatabaseError(error), { statusCode: 503, sqlState: "40P01", retryAfterSeconds: 1 })
  } finally {
    await pool.end()
  }
})

test("a single autocommit statement that deadlocks is retried once on the server and succeeds", requirePostgres, async () => {
  const pool = retryStatementConflictOnce(openPool())
  const sequence = `dberr_seq_${randomUUID().replaceAll("-", "")}`
  const first = Math.floor(Math.random() * 1e9)
  const second = first + 1
  try {
    await pool.query(`CREATE SEQUENCE ${sequence}`)
    // nextval is not rolled back, so it counts how often the statement ran.
    const result = await deadlockAgainst(pool, { first, second }, () => pool.query(
      `SELECT nextval('${sequence}') AS attempt, pg_advisory_xact_lock($2), pg_advisory_xact_lock($1)`,
      [first, second]
    )) as { rows: Array<{ attempt: string }> }
    assert.equal(result.rows[0]?.attempt, "2")
  } finally {
    await pool.query(`DROP SEQUENCE IF EXISTS ${sequence}`)
    await pool.end()
  }
})

test("a unique violation is not retried: only serialization failures and deadlocks are", requirePostgres, async () => {
  const pool = retryStatementConflictOnce(openPool())
  const table = `dberr_${randomUUID().replaceAll("-", "")}`
  const sequence = `${table}_seq`
  try {
    await pool.query(`CREATE SEQUENCE ${sequence}`)
    await pool.query(`CREATE TABLE ${table} (id text PRIMARY KEY, n bigint)`)
    await pool.query(`INSERT INTO ${table} VALUES ('a', 0)`)
    const error = await rejection(pool.query(`INSERT INTO ${table} VALUES ('a', nextval('${sequence}'))`))
    assert.deepEqual(classifyDatabaseError(error), { statusCode: 409, sqlState: "23505" })
    const { rows } = await pool.query(`SELECT last_value FROM ${sequence}`)
    assert.equal(rows[0]?.last_value, "1")
  } finally {
    await pool.query(`DROP TABLE IF EXISTS ${table}`)
    await pool.query(`DROP SEQUENCE IF EXISTS ${sequence}`)
    await pool.end()
  }
})
