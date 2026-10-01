import { randomUUID } from "node:crypto"
import type { QueryResultRow } from "pg"
import type { DiscoveryFilters } from "@blumi/contracts"
import type { DiscoverySnapshotMeta, DiscoverySnapshotRepository } from "../matches/discoverySnapshot"
import { DISCOVERY_ACTIVE_SNAPSHOT_LIMIT, DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT, DiscoveryRefreshLimitError } from "../matches/discoverySnapshot"
import { discoveryProfilesSql } from "./discoveryProfilesSql"
import { mapAccountProfileSafely, normalizeFilters } from "./postgresMatchRepository"

interface Executor { query(sql: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[]; rowCount?: number | null }> }
const PURGE_CANDIDATE_BATCH = 5000
const PURGE_SNAPSHOT_BATCH = 500
const PURGE_MAX_BATCHES = 40
function deletedCount(result: { rowCount?: number | null }): number { return result.rowCount ?? 0 }
interface SnapshotPool extends Executor { connect(): Promise<Executor & {release():void}> }
function params(userId: string, filters: DiscoveryFilters): unknown[] {
  const f = normalizeFilters(filters)
  return [userId, f.ageMin, f.ageMax, f.genders, f.vibes]
}
function eligibleSql(projection: "profile" | "candidate" = "profile", candidateSource?: "page_candidates"): string {
  const columns = projection === "candidate" ? "ranked.user_id, ranked.rank_score" : "ranked.*"
  return `SELECT ${columns} FROM (${discoveryProfilesSql(candidateSource)}) ranked
    JOIN blumi_accounts account ON account.user_id = ranked.user_id
    WHERE account.moderation_status NOT IN ('suspended', 'banned')
      AND NOT EXISTS (SELECT 1 FROM blumi_safety_blocks b WHERE
        (b.actor_user_id = $1 AND b.blocked_user_id = ranked.user_id) OR
        (b.blocked_user_id = $1 AND b.actor_user_id = ranked.user_id))`
}
function map(row: QueryResultRow): DiscoverySnapshotMeta {
  return { snapshotId: String(row.snapshot_id), userId: String(row.user_id), filterHash: String(row.filter_hash),
    expiresAt: new Date(row.expires_at).toISOString(), count: Number(row.candidate_count) }
}
export function createPostgresDiscoverySnapshots(pool: SnapshotPool): DiscoverySnapshotRepository {
  return {
    async create(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        // Separate statements after the account lock see commits by preceding
        // refreshes. A single CTE's pre-lock snapshot cannot enforce this bound.
        const owner = await client.query("SELECT user_id FROM blumi_accounts WHERE user_id=$1 FOR UPDATE",[input.userId])
        if (!owner.rows.length) throw new Error("Discovery account unavailable")
        const budget = await client.query(`SELECT COUNT(*) AS count,
          CEIL(EXTRACT(EPOCH FROM MIN(expires_at)-NOW())) AS retry_after
          FROM blumi_discovery_snapshots WHERE user_id=$1 AND expires_at>NOW()`,[input.userId])
        if (Number(budget.rows[0]!.count) >= DISCOVERY_ACTIVE_SNAPSHOT_LIMIT) {
          throw new DiscoveryRefreshLimitError(Math.max(1,Number(budget.rows[0]!.retry_after)))
        }
        await client.query(`DELETE FROM blumi_discovery_snapshots WHERE user_id=$1 AND expires_at<=NOW()`,[input.userId])
        const result = await client.query(`WITH candidates AS MATERIALIZED (${eligibleSql("candidate")}
          ORDER BY ranked.rank_score DESC, ranked.user_id ASC LIMIT ${DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT}),
        meta AS (INSERT INTO blumi_discovery_snapshots
          (snapshot_id,user_id,filter_hash,created_at,expires_at,candidate_count)
          SELECT $6::uuid,$1,$7,$8::timestamptz,$8::timestamptz + INTERVAL '30 minutes',COUNT(*) FROM candidates RETURNING *),
        inserted AS (INSERT INTO blumi_discovery_snapshot_candidates(snapshot_id,position,user_id)
          SELECT meta.snapshot_id,(ROW_NUMBER() OVER (ORDER BY candidates.rank_score DESC,candidates.user_id ASC)-1)::integer,candidates.user_id
            FROM candidates CROSS JOIN meta)
        SELECT meta.* FROM meta`,
        [...params(input.userId,input.filters),randomUUID(),input.filterHash,input.now.toISOString()])
        await client.query("COMMIT")
        return map(result.rows[0]!)
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally { client.release() }
    },
    async get(id,userId,filterHash) {
      const result = await pool.query(`SELECT * FROM blumi_discovery_snapshots
        WHERE snapshot_id=$1 AND user_id=$2 AND filter_hash=$3`, [id,userId,filterHash])
      return result.rows[0] ? map(result.rows[0]) : null
    },
    async read(input) {
      // Current eligibility is re-checked for this page's candidates only.
      // Ranking the whole pool per page row cost O(page x accounts): about 3 s
      // per page with 20k accounts (discoverySnapshotReadCost.postgres.test.ts).
      const result = await pool.query(`WITH page_candidates AS MATERIALIZED (
        SELECT c.position,c.user_id FROM blumi_discovery_snapshot_candidates c
        JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id
        WHERE c.snapshot_id=$6 AND c.position >= $7 AND s.expires_at > NOW()
          AND s.user_id=$1 AND s.filter_hash=$9
        ORDER BY c.position LIMIT $8),
        current_eligible AS MATERIALIZED (${eligibleSql("profile", "page_candidates")})
        SELECT page_candidates.position,current_eligible.* FROM page_candidates
        LEFT JOIN current_eligible ON current_eligible.user_id=page_candidates.user_id ORDER BY page_candidates.position`,
        [...params(input.meta.userId,input.filters),input.meta.snapshotId,input.position,input.limit,input.meta.filterHash])
      return result.rows.map(row => ({position:Number(row.position),profile:row.user_id ? mapAccountProfileSafely(row)[0] ?? null : null}))
    },
    async purgeExpired() {
      // Bound each statement, not the tick: a snapshot can hold up to
      // DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT rows and one 5000-row batch per
      // minute fell behind creation. Separate autocommit batches release locks;
      // the batch cap keeps one tick from monopolising a pool connection.
      for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
        const candidates = await pool.query(`DELETE FROM blumi_discovery_snapshot_candidates WHERE (snapshot_id,position) IN (
          SELECT c.snapshot_id,c.position FROM blumi_discovery_snapshots s
          JOIN blumi_discovery_snapshot_candidates c ON c.snapshot_id=s.snapshot_id
          WHERE s.expires_at <= NOW() ORDER BY s.expires_at,c.snapshot_id,c.position
          LIMIT ${PURGE_CANDIDATE_BATCH} FOR UPDATE OF c SKIP LOCKED)`)
        const snapshots = await pool.query(`DELETE FROM blumi_discovery_snapshots WHERE snapshot_id IN (
          SELECT snapshot_id FROM blumi_discovery_snapshots WHERE expires_at <= NOW()
          AND NOT EXISTS (SELECT 1 FROM blumi_discovery_snapshot_candidates c
            WHERE c.snapshot_id=blumi_discovery_snapshots.snapshot_id)
          ORDER BY expires_at LIMIT ${PURGE_SNAPSHOT_BATCH} FOR UPDATE SKIP LOCKED)`)
        if (deletedCount(candidates) < PURGE_CANDIDATE_BATCH && deletedCount(snapshots) < PURGE_SNAPSHOT_BATCH) return
      }
    }
  }
}
