import assert from "node:assert/strict"
import test from "node:test"
import { Pool, type PoolClient } from "pg"
import { disposablePostgresSkip, disposablePostgresUrl } from "./disposablePostgres"
import { createPostgresRetentionService, RETENTION_POLICIES } from "./postgresRetention"

// Audit D08: migration 074's partial index serves the notification-claim
// retention scan. Measured on a synthetic table far larger than production:
// the plan must switch from a whole-table scan to the index, and the purge must
// delete exactly the rows the unindexed predicate selects.

const requirePostgres = disposablePostgresSkip()
const TABLE = "blumi_notification_policy_events"
const INDEX = "blumi_notification_policy_events_retention_idx"
const RECENT_CLAIMS = 150_000
const PERMANENT_CLAIMS = 147_000
const EXPIRED_CLAIMS = 3_000
const BATCH = 2_000

const policy = RETENTION_POLICIES.find((entry) => entry.table === TABLE)!
// The statement the retention service runs inside its DELETE, unchanged.
const RETENTION_SCAN = `SELECT ${policy.key} FROM ${TABLE} WHERE ${policy.expired} LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`

interface PlanSummary { readonly nodes: string[]; readonly ms: number; readonly rowsFiltered: number }

async function explain(client: PoolClient): Promise<PlanSummary> {
  const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${RETENTION_SCAN}`)
  const root = (rows[0]?.["QUERY PLAN"] as Array<{ Plan: PlanNode; "Execution Time": number }>)[0]!
  const nodes: string[] = []
  let rowsFiltered = 0
  const visit = (node: PlanNode) => {
    nodes.push(`${node["Node Type"]}${node["Index Name"] ? `:${node["Index Name"]}` : ""}`)
    rowsFiltered += node["Rows Removed by Filter"] ?? 0
    for (const child of node.Plans ?? []) visit(child)
  }
  visit(root.Plan)
  return { nodes, ms: root["Execution Time"], rowsFiltered }
}

interface PlanNode {
  "Node Type": string
  "Index Name"?: string
  "Rows Removed by Filter"?: number
  Plans?: PlanNode[]
}

async function seed(pool: Pool): Promise<void> {
  // Recent message/like claims, permanent match/watch claims of any age, and a
  // small expired tail: the steady state of a ten-minute retention tick.
  await pool.query(`INSERT INTO ${TABLE} (user_id, notification_type, dedupe_key, created_at)
    SELECT 'u' || (n % 5000), CASE WHEN n % 2 = 0 THEN 'message' ELSE 'like' END, 'recent_' || n,
           now() - (n % 29) * INTERVAL '1 day' - INTERVAL '1 minute'
      FROM generate_series(1, ${RECENT_CLAIMS}) AS n`)
  await pool.query(`INSERT INTO ${TABLE} (user_id, notification_type, dedupe_key, created_at)
    SELECT 'u' || (n % 5000), CASE WHEN n % 2 = 0 THEN 'match' ELSE 'discovery_watch' END, 'kept_' || n,
           now() - (n % 400) * INTERVAL '1 day'
      FROM generate_series(1, ${PERMANENT_CLAIMS}) AS n`)
  await pool.query(`INSERT INTO ${TABLE} (user_id, notification_type, dedupe_key, created_at)
    SELECT 'u' || (n % 5000), CASE WHEN n % 2 = 0 THEN 'message' ELSE 'like' END, 'expired_' || n,
           now() - INTERVAL '31 days' - (n % 300) * INTERVAL '1 day'
      FROM generate_series(1, ${EXPIRED_CLAIMS}) AS n`)
  // A row exactly inside the window boundary stays; ANALYZE gives the planner real statistics.
  await pool.query(`INSERT INTO ${TABLE} (user_id, notification_type, dedupe_key, created_at)
    VALUES ('edge', 'message', 'inside_window', now() - INTERVAL '30 days' + INTERVAL '1 minute')`)
  await pool.query(`ANALYZE ${TABLE}`)
}

async function idDigest(client: PoolClient | Pool, where: string): Promise<{ count: number; digest: string }> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS count, md5(coalesce(string_agg(event_id::text, ',' ORDER BY event_id), '')) AS digest
       FROM ${TABLE} WHERE ${where}`
  )
  return { count: rows[0].count, digest: rows[0].digest }
}

test("migration 074's partial index serves the notification retention scan and deletes the same rows", requirePostgres, async () => {
  const pool = new Pool({ connectionString: disposablePostgresUrl(process.env.DATABASE_URL), max: 2 })
  const client = await pool.connect()
  try {
    const { rows: definition } = await client.query("SELECT indexdef FROM pg_indexes WHERE indexname = $1", [INDEX])
    assert.match(String(definition[0]?.indexdef), /\(created_at\) WHERE \(notification_type = ANY \(ARRAY\['message'::text, 'like'::text\]\)\)/)
    await client.query(`DELETE FROM ${TABLE}`)
    await seed(pool)

    // Before 074: the same scan with the index removed (rolled back afterwards).
    await client.query("BEGIN")
    await client.query(`DROP INDEX ${INDEX}`)
    const before = await explain(client)
    await client.query("ROLLBACK")
    // After 074.
    await client.query("BEGIN")
    const after = await explain(client)
    await client.query("ROLLBACK")
    console.log(`D08 EXPLAIN rows=${RECENT_CLAIMS + PERMANENT_CLAIMS + EXPIRED_CLAIMS + 1} ` +
      `before: ${before.nodes.join(">")} ${before.ms.toFixed(2)} ms, ${before.rowsFiltered} rows read and discarded; ` +
      `after: ${after.nodes.join(">")} ${after.ms.toFixed(2)} ms, ${after.rowsFiltered} rows read and discarded`)
    assert.ok(before.nodes.some((node) => node.startsWith("Seq Scan")), `before: ${before.nodes.join(">")}`)
    assert.ok(after.nodes.some((node) => node.endsWith(`:${INDEX}`)), `after: ${after.nodes.join(">")}`)
    assert.ok(!after.nodes.some((node) => node.startsWith("Seq Scan")), `after: ${after.nodes.join(">")}`)
    // Timings are printed as evidence only; the row counts are the stable proof.
    assert.ok(before.rowsFiltered >= RECENT_CLAIMS, "without the index every recent and permanent claim is read")
    assert.equal(after.rowsFiltered, 0, "the index reads only rows the purge deletes")

    // The rows the unindexed predicate selects are exactly the rows the purge deletes.
    await client.query("BEGIN")
    await client.query("SET LOCAL enable_indexscan = off")
    await client.query("SET LOCAL enable_bitmapscan = off")
    await client.query("SET LOCAL enable_indexonlyscan = off")
    const expired = await idDigest(client, policy.expired)
    const kept = await idDigest(client, `NOT (${policy.expired})`)
    await client.query("ROLLBACK")
    assert.equal(expired.count, EXPIRED_CLAIMS)

    const purged = await createPostgresRetentionService(pool, { batchSize: BATCH }).purgeExpired()
    assert.equal(purged[TABLE], EXPIRED_CLAIMS)
    assert.deepEqual(await idDigest(pool, "true"), kept, "every other row stays, byte for byte by id")
    assert.equal((await idDigest(pool, policy.expired)).count, 0)
    assert.equal((await idDigest(pool, "dedupe_key = 'inside_window'")).count, 1, "the window boundary is unchanged")
  } finally {
    client.release()
    await pool.end()
  }
})
