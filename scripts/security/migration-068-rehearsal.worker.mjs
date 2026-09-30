// Runs inside migration-068-rehearsal.mjs only (node --import tsx). It never
// reads DATABASE_URL: REHEARSAL_DATABASE_URL points at a database of the
// disposable cluster that the parent script created a moment ago.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import pg from "pg"

const root = process.env.REHEARSAL_ROOT
const oldRoot = process.env.REHEARSAL_OLD_ROOT
const databaseUrl = process.env.REHEARSAL_DATABASE_URL
const scratch = process.env.REHEARSAL_SCRATCH
assert.ok(root && oldRoot && databaseUrl && scratch, "rehearsal worker started without its parent")
assert.match(new URL(databaseUrl).searchParams.get("host") ?? "", /blumi-pg-gate-068-rehearsal-/, "worker accepts only the disposable cluster socket")

const MIGRATION_068 = "068_session_reuse_detection_and_firebase_uid.sql"
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date()
const at = (ms) => new Date(NOW.getTime() + ms)
const TERMS = { version: "rehearsal-terms", locale: "en" }
const evidence = []
const record = (step, detail = {}) => {
  evidence.push({ step, ...detail })
  console.log(`ok - ${step}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ""}`)
}
const load = async (path) => {
  const module = await import(path)
  return module.default ?? module
}

// Old binary: the previous release's server source, archived from Git by the parent.
const oldMigrate = await load(join(oldRoot, "apps/server/src/db/migrate.ts"))
const oldRepositoryModule = await load(join(oldRoot, "apps/server/src/db/postgresAuthRepository.ts"))
const oldServiceModule = await load(join(oldRoot, "apps/server/src/auth/authService.ts"))
const oldReadinessModule = await load(join(oldRoot, "apps/server/src/operations/schemaReadiness.ts"))
// New binary: this checkout.
const newMigrate = await load(join(root, "apps/server/src/db/migrate.ts"))
const newRepositoryModule = await load(join(root, "apps/server/src/db/postgresAuthRepository.ts"))
const newServiceModule = await load(join(root, "apps/server/src/auth/authService.ts"))
const newReadinessModule = await load(join(root, "apps/server/src/operations/schemaReadiness.ts"))
const newStore = await load(join(root, "apps/server/src/auth/authStore.ts"))
const { createServer } = await load(join(root, "apps/server/src/server.ts"))

const oldMigrations = readdirSync(join(oldRoot, "apps/server/db/migrations")).filter((file) => file.endsWith(".sql")).sort()
assert.equal(oldMigrations.at(-1), "067_realtime_connection_leases.sql", "old binary must ship migrations through 067")
assert.ok(!oldMigrations.includes(MIGRATION_068))

const pool = new pg.Pool({ connectionString: databaseUrl })
const oldRepository = oldRepositoryModule.createPostgresAuthRepository(pool)
const oldService = oldServiceModule.createAuthService({ repository: oldRepository })
const newRepository = newRepositoryModule.createPostgresAuthRepository(pool)
const newService = newServiceModule.createAuthService({ repository: newRepository })
const revocations = []
newService.subscribeRealtimeAccessRevocations((revocation) => revocations.push(revocation))
const oldReadiness = oldReadinessModule.createSchemaReadinessCheck(pool)
const newReadiness = newReadinessModule.createSchemaReadinessCheck(pool)
const hash = (token) => newStore.hashSessionToken(token)
let phoneCounter = 0
const phone = () => `+1555010${String(phoneCounter++).padStart(4, "0")}`

async function readyStatus(check) {
  const app = createServer({ checkReadiness: check, logger: false })
  try {
    const response = await app.inject({ method: "GET", url: "/ready" })
    return response.statusCode
  } finally {
    await app.close()
  }
}
const passes = async (check) => { await check(); return true }
const columns = async () => (await pool.query(`
  SELECT table_name || '.' || column_name AS name FROM information_schema.columns
   WHERE table_schema = 'public'
     AND ((table_name = 'blumi_sessions' AND column_name IN ('family_expires_at','rotated_at','replaced_by_token_hash'))
       OR (table_name = 'blumi_accounts' AND column_name = 'firebase_uid'))
   ORDER BY 1`)).rows.map((row) => row.name)
const ledger = async () => (await pool.query("SELECT id, checksum FROM blumi_migrations ORDER BY id")).rows
const session = async (token) => (await pool.query(
  "SELECT * FROM blumi_sessions WHERE session_token_hash = $1", [hash(token)])).rows[0] ?? null
const uidOf = async (accountId) => (await pool.query(
  "SELECT firebase_uid FROM blumi_accounts WHERE account_id = $1", [accountId])).rows[0]?.firebase_uid ?? null

try {
  // ---------------------------------------------------------------- (a) 067
  const oldDirectory = mkdtempSync(join(scratch, "old-migrations-"))
  cpSync(join(oldRoot, "apps/server/db/migrations"), oldDirectory, { recursive: true })
  const fromEmpty = await oldMigrate.runMigrations({ databaseUrl, migrationsDirectory: oldDirectory })
  assert.equal(fromEmpty.applied.length, 67)
  assert.equal(fromEmpty.applied.at(-1), "067_realtime_connection_leases.sql")
  record("a1 old migrator applied 001-067 from empty", { applied: fromEmpty.applied.length })

  // Representative pre-068 data written by the OLD binary's own code paths.
  const live = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, at(-10 * DAY))
  const expired = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, at(-40 * DAY))
  const familyStart = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, at(-5 * DAY))
  const familyMid = await oldService.refreshSession(familyStart.sessionToken, at(-4 * DAY))
  const familyHead = await oldService.refreshSession(familyMid.sessionToken, at(-3 * DAY))
  const doomed = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, at(-2 * DAY))
  const unbound = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, at(-1 * DAY))
  assert.ok(familyMid && familyHead)
  const seeded = (await pool.query(`SELECT
      (SELECT count(*)::int FROM blumi_accounts) AS accounts,
      (SELECT count(*)::int FROM blumi_sessions) AS sessions,
      (SELECT count(*)::int FROM blumi_sessions WHERE expires_at > now()) AS live_sessions`)).rows[0]
  assert.deepEqual(seeded, { accounts: 5, sessions: 7, live_sessions: 4 })
  record("a2 old binary seeded accounts, live/expired sessions and a twice-rotated family", seeded)

  // ---------------------------------------------------------------- (c) new binary on 067
  await assert.rejects(newReadiness(), /migrations are incomplete/)
  assert.equal(await readyStatus(newReadiness), 503)
  assert.equal(await passes(oldReadiness), true)
  assert.equal(await readyStatus(oldReadiness), 200)
  record("c1 067-only database: new binary /ready 503, old binary /ready 200")

  // ---------------------------------------------------------------- backup point
  // Same conventions as DATABASE_RELEASE_RUNBOOK: custom-format public-schema
  // archive, restored with --no-owner --no-privileges into a NEW database,
  // 059 replayed for ACLs, then the upgrade rehearsed on the restored copy.
  const archive = join(scratch, "pre-068-public.dump")
  const pgRun = (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000 })
    if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message}`)
    return result.stdout
  }
  pgRun("pg_dump", ["--dbname", databaseUrl, "--format=custom", "--schema=public", "--no-owner", "--file", archive])
  const listing = pgRun("pg_restore", ["--list", archive])
  assert.match(listing, /TABLE DATA public blumi_sessions/)
  assert.match(listing, /TABLE DATA public blumi_accounts/)
  const archiveSha256 = createHash("sha256").update(readFileSync(archive)).digest("hex")
  const restoreUrl = new URL(databaseUrl)
  restoreUrl.pathname = "/rehearsal_restore"
  await pool.query("CREATE DATABASE rehearsal_restore")
  pgRun("psql", ["--dbname", restoreUrl.toString(), "--no-psqlrc", "--quiet", "--command", "DROP SCHEMA public CASCADE;"])
  pgRun("pg_restore", ["--dbname", restoreUrl.toString(), "--no-owner", "--no-privileges", "--exit-on-error", archive])
  pgRun("psql", ["--dbname", restoreUrl.toString(), "--no-psqlrc", "--quiet", "--set", "ON_ERROR_STOP=1",
    "--file", join(root, "apps/server/db/migrations/059_revoke_public_api_access.sql")])
  const restorePool = new pg.Pool({ connectionString: restoreUrl.toString() })
  try {
    const counts = async (target) => (await target.query(`SELECT
        (SELECT count(*)::int FROM blumi_accounts) AS accounts,
        (SELECT count(*)::int FROM blumi_sessions) AS sessions,
        (SELECT count(*)::int FROM blumi_migrations) AS migrations`)).rows[0]
    const source = await counts(pool)
    const restored = await counts(restorePool)
    assert.deepEqual(restored, source)
    const restoredUpgrade = await newMigrate.runMigrations({ databaseUrl: restoreUrl.toString() })
    assert.deepEqual(restoredUpgrade.applied, [MIGRATION_068])
    assert.equal(await readyStatus(newReadinessModule.createSchemaReadinessCheck(restorePool)), 200)
    record("backup: pre-068 public-schema archive restored into a new database with identical counts; 068 upgrade + /ready 200 on the copy", {
      archiveBytes: statSync(archive).size, archiveSha256, restored
    })
  } finally {
    await restorePool.end()
    await pool.query("DROP DATABASE rehearsal_restore")
    rmSync(archive)
  }

  // ---------------------------------------------------------------- lock timeout stop condition
  const blocker = await pool.connect()
  try {
    await blocker.query("BEGIN")
    await blocker.query("SELECT 1 FROM blumi_sessions LIMIT 1")
    const previous = process.env.PGOPTIONS
    process.env.PGOPTIONS = "-c lock_timeout=1500"
    const startedAt = Date.now()
    try {
      await assert.rejects(newMigrate.runMigrations({ databaseUrl }), /lock timeout/)
    } finally {
      if (previous === undefined) delete process.env.PGOPTIONS
      else process.env.PGOPTIONS = previous
    }
    const waitedMs = Date.now() - startedAt
    assert.deepEqual(await columns(), [])
    assert.equal((await ledger()).length, 67)
    record("lock: open reader + PGOPTIONS lock_timeout aborts 068 cleanly (no columns, 67 ledger rows)", { waitedMs })
  } finally {
    await blocker.query("ROLLBACK")
    blocker.release()
  }

  // ---------------------------------------------------------------- lock modes held by 068
  const probe = await pool.connect()
  let lockModes
  try {
    await probe.query("BEGIN")
    await probe.query(readFileSync(join(root, "apps/server/db/migrations", MIGRATION_068), "utf8"))
    lockModes = (await probe.query(`SELECT relation::regclass::text AS relation, mode FROM pg_locks
        WHERE pid = pg_backend_pid() AND locktype = 'relation'
          AND relation::regclass::text IN ('blumi_sessions', 'blumi_accounts')
        ORDER BY 1, 2`)).rows.map((row) => `${row.relation}:${row.mode}`)
  } finally {
    await probe.query("ROLLBACK")
    probe.release()
  }
  assert.ok(lockModes.includes("blumi_sessions:AccessExclusiveLock"))
  assert.ok(lockModes.includes("blumi_accounts:AccessExclusiveLock"))
  assert.deepEqual(await columns(), [])
  record("lock: 068 holds these relation locks until COMMIT", { lockModes })

  // ---------------------------------------------------------------- (a) apply 068 + rerun
  const before = await ledger()
  process.env.PGOPTIONS = "-c lock_timeout=5000"
  const upgradeStartedAt = Date.now()
  const upgrade = await newMigrate.runMigrations({ databaseUrl })
  const upgradeMs = Date.now() - upgradeStartedAt
  delete process.env.PGOPTIONS
  assert.deepEqual(upgrade.applied, [MIGRATION_068])
  assert.equal(upgrade.skipped.length, 67)
  const afterUpgrade = await ledger()
  assert.deepEqual(afterUpgrade.slice(0, 67), before, "existing checksums unchanged")
  const rerun = await newMigrate.runMigrations({ databaseUrl })
  assert.deepEqual(rerun.applied, [])
  assert.equal(rerun.skipped.length, 68)
  assert.deepEqual(await ledger(), afterUpgrade, "rerun leaves the ledger byte-identical")
  assert.deepEqual((await columns()).sort(), [
    "blumi_accounts.firebase_uid",
    "blumi_sessions.family_expires_at",
    "blumi_sessions.replaced_by_token_hash",
    "blumi_sessions.rotated_at"
  ])
  const nullability = (await pool.query(`SELECT table_name || '.' || column_name AS name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name IN ('blumi_sessions','blumi_accounts')
       AND column_name IN ('family_expires_at','rotated_at','replaced_by_token_hash','firebase_uid')`)).rows
  assert.ok(nullability.every((row) => row.is_nullable === "YES" && row.column_default === null))
  const index = (await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'blumi_accounts_firebase_uid_key'")).rows[0]
  assert.match(index.indexdef, /CREATE UNIQUE INDEX .* WHERE \(firebase_uid IS NOT NULL\)/)
  const legacyMarkers = (await pool.query(`SELECT
      (SELECT count(*)::int FROM blumi_sessions WHERE family_expires_at IS NOT NULL OR rotated_at IS NOT NULL OR replaced_by_token_hash IS NOT NULL) AS session_markers,
      (SELECT count(*)::int FROM blumi_accounts WHERE firebase_uid IS NOT NULL) AS bound_accounts`)).rows[0]
  assert.deepEqual(legacyMarkers, { session_markers: 0, bound_accounts: 0 })
  record("a3 new migrator applied only 068; rerun no-op; 67 prior checksums unchanged; columns nullable without defaults", {
    checksum068: afterUpgrade.at(-1).checksum.trim(), legacyMarkers, upgradeMs
  })

  // ---------------------------------------------------------------- (c) new binary on 068
  assert.equal(await readyStatus(newReadiness), 200)
  assert.equal(await readyStatus(oldReadiness), 200)
  record("c2 068 database: new binary /ready 200 and old binary /ready 200")

  // ---------------------------------------------------------------- (b) old binary on 068
  assert.ok(await oldService.getSession(live.sessionToken, NOW), "old binary resolves a pre-068 live session")
  const oldNewAccount = await oldService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS }, NOW)
  const oldRefreshed = await oldService.refreshSession(oldNewAccount.sessionToken, at(1_000))
  assert.ok(oldRefreshed)
  const oldRow = await session(oldRefreshed.sessionToken)
  assert.equal(oldRow.family_expires_at, null)
  assert.equal(oldRow.rotated_at, null)
  const oldResignIn = await oldService.signInWithVerifiedPhone(oldNewAccount.account.phoneNumber, { requireExistingAccount: true }, at(2_000))
  assert.equal(oldResignIn.account.accountId, oldNewAccount.account.accountId)
  assert.equal(await oldRepository.deleteAccountData(doomed.account), true)
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_accounts WHERE account_id = $1", [doomed.account.accountId])).rows[0].count, 0)
  record("b1 old binary on 068: session read, sign-up, sign-in, refresh and account deletion succeed; its rows leave the new columns NULL")

  // ---------------------------------------------------------------- effect on pre-068 sessions (new binary)
  assert.equal(await newService.refreshSession(expired.sessionToken, NOW), null)
  assert.equal(await newService.refreshSession(familyStart.sessionToken, NOW), null, "pre-068 tombstone is rejected, not treated as reuse")
  assert.equal(await newService.refreshSession(familyMid.sessionToken, NOW), null)
  assert.deepEqual(revocations, [], "no family revocation for pre-068 tombstones")
  assert.ok(await newService.getSession(familyHead.sessionToken, NOW), "the legacy family head stays signed in")

  const liveRefresh = await newService.refreshSession(live.sessionToken, NOW)
  assert.ok(liveRefresh, "the live pre-068 session refreshes on the new binary")
  assert.equal(liveRefresh.session.sessionId, live.session.sessionId)
  const anchored = await session(liveRefresh.sessionToken)
  assert.equal(anchored.family_expires_at.toISOString(), at(newStore.SESSION_FAMILY_MAX_LIFETIME_MS).toISOString(),
    "legacy family anchored at first post-068 rotation + 90 days")
  const liveTombstone = await session(live.sessionToken)
  assert.equal(liveTombstone.rotated_at.toISOString(), NOW.toISOString())
  assert.equal(liveTombstone.replaced_by_token_hash, hash(liveRefresh.sessionToken))
  record("effect: expired/pre-068-rotated tokens rejected without revocation; live legacy session rotates and anchors family at +90d", {
    familyExpiresAt: anchored.family_expires_at.toISOString()
  })

  const graceRetry = await newService.refreshSession(live.sessionToken, at(10_000))
  assert.ok(graceRetry, "lost-response retry inside 30s grace is honoured")
  assert.equal(await newService.refreshSession(live.sessionToken, at(10_000 + newStore.SESSION_REFRESH_REUSE_GRACE_MS + 1_000)), null)
  assert.deepEqual(revocations, [{ kind: "user", userId: live.session.userId }])
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_sessions WHERE session_id = $1", [live.session.sessionId])).rows[0].count, 0)
  record("effect: reuse detection active only after the first post-068 rotation (grace retry ok, later reuse deletes family + revokes)")

  // Firebase uid binding for legacy accounts.
  const bound = await newService.signInWithVerifiedPhone(unbound.account.phoneNumber, { requireExistingAccount: true, firebaseUid: "rehearsal-uid-unbound" }, NOW)
  assert.equal(bound.account.accountId, unbound.account.accountId)
  assert.equal(await uidOf(unbound.account.accountId), "rehearsal-uid-unbound")
  await assert.rejects(
    newService.signInWithVerifiedPhone(unbound.account.phoneNumber, { requireExistingAccount: true, firebaseUid: "rehearsal-uid-other" }, NOW),
    (error) => error.code === "ACCOUNT_RECOVERY_REQUIRED" && error.statusCode === 409
  )
  assert.equal(await uidOf(unbound.account.accountId), "rehearsal-uid-unbound")
  assert.equal(await uidOf(familyHead.account.accountId), null)
  record("effect: legacy account binds uid on next verified sign-in; a different uid gets 409 ACCOUNT_RECOVERY_REQUIRED; other accounts stay NULL")

  // ---------------------------------------------------------------- (b) mixed version: new then old then new
  const mixed = await newService.signInWithVerifiedPhone(phone(), { acceptedTerms: TERMS, firebaseUid: "rehearsal-uid-mixed" }, NOW)
  const mixedFamilyEnd = (await session(mixed.sessionToken)).family_expires_at.toISOString()
  assert.ok(await oldService.getSession(mixed.sessionToken, NOW), "old binary reads a new-binary session")
  const oldAfterNew = await oldService.refreshSession(mixed.sessionToken, at(1_000))
  assert.ok(oldAfterNew, "old binary refreshes a new-binary session")
  assert.equal((await session(oldAfterNew.sessionToken)).family_expires_at, null, "old binary drops the family cap on its successor")
  assert.equal(await oldService.refreshSession(mixed.sessionToken, at(2_000)), null)
  const oldSignInKeepsUid = await oldService.signInWithVerifiedPhone(mixed.account.phoneNumber, { requireExistingAccount: true }, at(3_000))
  assert.equal(oldSignInKeepsUid.account.accountId, mixed.account.accountId)
  assert.equal(await uidOf(mixed.account.accountId), "rehearsal-uid-mixed", "old binary neither clears nor changes the binding")
  const reAnchored = await newService.refreshSession(oldAfterNew.sessionToken, at(4_000))
  assert.ok(reAnchored)
  const reAnchoredEnd = (await session(reAnchored.sessionToken)).family_expires_at.toISOString()
  assert.notEqual(reAnchoredEnd, mixedFamilyEnd)
  record("b2 mixed new->old->new: sessions interoperate; old refresh resets the family cap (re-anchored by the next new rotation); old sign-in keeps uid", {
    originalFamilyEnd: mixedFamilyEnd, reAnchoredFamilyEnd: reAnchoredEnd
  })

  // ---------------------------------------------------------------- rollback SQL rehearsal
  const rollbackSql = `
    BEGIN;
    SET LOCAL lock_timeout = '5s';
    DROP INDEX IF EXISTS blumi_accounts_firebase_uid_key;
    ALTER TABLE blumi_accounts DROP COLUMN IF EXISTS firebase_uid;
    ALTER TABLE blumi_sessions
      DROP COLUMN IF EXISTS replaced_by_token_hash,
      DROP COLUMN IF EXISTS rotated_at,
      DROP COLUMN IF EXISTS family_expires_at;
    DELETE FROM blumi_migrations WHERE id = '${MIGRATION_068}';
    COMMIT;`
  const boundBeforeRollback = (await pool.query("SELECT count(*)::int AS count FROM blumi_accounts WHERE firebase_uid IS NOT NULL")).rows[0].count
  await pool.query(rollbackSql)
  assert.deepEqual(await columns(), [])
  assert.equal(await readyStatus(newReadiness), 503)
  assert.equal(await readyStatus(oldReadiness), 200)
  assert.ok(await oldService.getSession(reAnchored.sessionToken, at(5_000)), "sessions survive schema rollback")
  const reapplied = await newMigrate.runMigrations({ databaseUrl })
  assert.deepEqual(reapplied.applied, [MIGRATION_068])
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_accounts WHERE firebase_uid IS NOT NULL")).rows[0].count, 0)
  assert.equal(await readyStatus(newReadiness), 200)
  record("rollback: schema down-SQL restores 067 shape (new /ready 503, old 200); re-apply works; uid bindings lost", {
    uidBindingsLost: boundBeforeRollback
  })

  console.log(`REHEARSAL_EVIDENCE ${JSON.stringify(evidence)}`)
  rmSync(oldDirectory, { recursive: true })
} finally {
  await pool.end()
}
