import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"

// Tree-wide guards for two Supabase advisor findings, checked on the
// disposable gate database with every migration applied (071 fixed both).
// A future migration that adds a function or a foreign key fails here until
// it pins the search path or adds the covering index.

test("every server function pins its search_path (advisor function_search_path_mutable)", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await pool.query(
      `SELECT p.oid::regprocedure::text AS signature
         FROM pg_proc AS p
         JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
          -- The gate's own privilege probe, created outside the migrations.
          AND p.proname NOT LIKE 'blumi\\_gate\\_%'
          AND NOT EXISTS (SELECT 1 FROM pg_depend AS d WHERE d.objid = p.oid AND d.deptype = 'e')
          AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS setting
                           WHERE setting LIKE 'search_path=%')
        ORDER BY 1`
    )
    assert.deepEqual(result.rows.map((row) => String(row.signature)), [])
    const pinned = await pool.query(
      `SELECT count(*)::int AS count FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND 'search_path=public, pg_temp' = ANY(p.proconfig)`
    )
    assert.ok(Number(pinned.rows[0]?.count) >= 10, "the ten advisor functions are pinned")
  } finally {
    await pool.end()
  }
})

test("every foreign key has an index on its columns (advisor unindexed_foreign_keys)", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    // An index covers a foreign key when its leading columns are exactly the
    // key's columns, in any order (the advisor's rule).
    const result = await pool.query(
      `SELECT c.conrelid::regclass::text AS table_name, c.conname
         FROM pg_constraint AS c
         JOIN pg_namespace AS n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1 FROM pg_index AS i
             WHERE i.indrelid = c.conrelid
               AND (SELECT array_agg(k ORDER BY k)
                      FROM unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)]) AS k)
                 = (SELECT array_agg(k ORDER BY k) FROM unnest(c.conkey) AS k))
        ORDER BY 1, 2`
    )
    assert.deepEqual(result.rows.map((row) => `${row.table_name}.${row.conname}`), [])
  } finally {
    await pool.end()
  }
})
