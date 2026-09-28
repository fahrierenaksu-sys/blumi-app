import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, createReadStream, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

// Never reads DATABASE_URL. This gate restores only into its own temporary PG17 cluster.
const archive = process.argv[2]
if (!archive || !isAbsolute(archive) || !archive.endsWith(".dump") || !statSync(archive).isFile()) {
  throw new Error("Pass an existing absolute .dump archive path.")
}
const root = resolve(import.meta.dirname, "../..")
const pgBin = process.env.BLUMI_PG17_BIN ?? "/opt/homebrew/opt/postgresql@17/bin"
const directory = mkdtempSync(join(tmpdir(), "blumi-restore-gate-"))
chmodSync(directory, 0o700)
const data = join(directory, "data")
const port = "55489"
const url = `postgresql://blumi@localhost/postgres?host=${encodeURIComponent(directory)}&port=${port}`
const env = {
  ...process.env,
  DATABASE_URL: url,
  BLUMI_OTP_HMAC_SECRET: "restore-gate-only-do-not-use-outside-temporary-cluster"
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: "utf8", timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024, ...options
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr?.trim() ?? result.error?.message ?? result.status}`)
  }
  return result.stdout?.trim() ?? ""
}

let started = false
try {
  run(join(pgBin, "pg_restore"), ["--list", archive])
  run(join(pgBin, "initdb"), ["-D", data, "-U", "blumi", "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"])
  run(join(pgBin, "pg_ctl"), ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -h '' -p ${port}`, "-w", "start"])
  started = true
  run(join(pgBin, "psql"), ["--dbname", url, "--no-psqlrc", "--command", "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;"])
  // The archive owns public; remove only this newly-created cluster's empty default schema.
  run(join(pgBin, "psql"), ["--dbname", url, "--no-psqlrc", "--command", "DROP SCHEMA public CASCADE;"])
  run(join(pgBin, "pg_restore"), ["--dbname", url, "--no-owner", "--no-privileges", "--exit-on-error", archive])
  // --no-privileges is portable across Supabase and plain PG roles, but SQL
  // functions otherwise regain PostgreSQL's default PUBLIC EXECUTE grant.
  run(join(pgBin, "psql"), ["--dbname", url, "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--file", join(root, "apps/server/db/migrations/059_revoke_public_api_access.sql")])
  const count = run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import pg from 'pg';
    import migrationModule from './apps/server/src/db/migrate.ts';
    import auditModule from './apps/server/src/operations/databaseReleaseAudit.ts';
    const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
    try {
      const before = await pool.query('SELECT count(*)::int AS count FROM blumi_migrations');
      const {runMigrations} = migrationModule;
      const first = await runMigrations({databaseUrl:process.env.DATABASE_URL});
      const second = await runMigrations({databaseUrl:process.env.DATABASE_URL});
      if (second.applied.length) throw new Error('Migration rerun was not idempotent');
      const {auditDatabaseRelease} = auditModule;
      const audit = await auditDatabaseRelease(pool);
      const issueKeys = ['missingMigrations','changedMigrations','unexpectedMigrations',
        'orphanInventories','duplicateAvatarInventoryRows','duplicateRoomInventoryRows',
        'malformedAvatarInventoryRows','malformedRoomInventoryRows','invalidBalanceRows',
        'unknownOwnedAvatarIds','unknownOwnedRoomIds','unknownEquippedAvatarIds',
        'unownedEquippedAvatarIds','exposedTables','exposedSequences','exposedFunctions'];
      const findings = Object.fromEntries(issueKeys.filter(key => audit[key]).map(key => [key,audit[key]]));
      if (Object.keys(findings).length) {
        throw new Error('Restored database has release integrity findings: '+JSON.stringify(findings));
      }
      console.log(JSON.stringify({beforeMigrations:before.rows[0].count, applied:first.applied.length,
        rerunApplied:second.applied.length, accounts:audit.accounts, inventories:audit.inventories,
        remainingFindings:audit.unknownOwnedAvatarIds+audit.unknownOwnedRoomIds+audit.unownedEquippedAvatarIds}));
    } finally {await pool.end()}
  `])
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(archive)) hash.update(chunk)
  const digest = hash.digest("hex")
  console.log(JSON.stringify({archiveSha256: digest, archiveBytes: statSync(archive).size, restored: JSON.parse(count)}))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (started) {
    try { run(join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]) }
    catch { process.exitCode = 1 }
  }
  if (process.exitCode !== 1 && process.env.BLUMI_PG_KEEP_TEST_DATA !== "1") {
    rmSync(directory, { recursive: true })
  } else {
    console.log(`Restore gate files retained: ${directory}`)
  }
}
