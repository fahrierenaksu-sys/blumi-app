import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Mixed-version rehearsal for migration 068 (session reuse detection and
// Firebase uid binding). Never accepts DATABASE_URL: it mutates only the
// disposable cluster it creates. Usage (PostgreSQL server tools on PATH):
//
//   node scripts/security/migration-068-rehearsal.mjs [old-server-ref] [--old-suite]
//
// old-server-ref defaults to the commit the target's API is deployed from
// (main at 2a55475, migrations through 067). --old-suite additionally runs the
// OLD ref's own PostgreSQL integration tests against a 001-068 database.
const root = resolve(import.meta.dirname, "../..")
const args = process.argv.slice(2)
const oldRef = args.find((arg) => !arg.startsWith("--")) ?? "2a55475"
const runOldSuite = args.includes("--old-suite")
const directory = mkdtempSync(join(tmpdir(), "blumi-pg-gate-068-rehearsal-"))
chmodSync(directory, 0o700)
const data = join(directory, "data")
const scratch = join(directory, "scratch")
const oldRoot = join(directory, "old")
const port = "55491"
const baseUrl = `postgresql://blumi@localhost/postgres?host=${encodeURIComponent(directory)}&port=${port}`
const environment = { ...process.env }
delete environment.DATABASE_URL
delete environment.PGOPTIONS

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    cwd: root, env: environment, encoding: "utf8", timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024, ...options
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? result.error?.code})`)
  }
  return result.stdout ?? ""
}
function databaseUrl(name) {
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return url.toString()
}
function sql(statement) {
  run(process.execPath, ["--input-type=module", "-e", `
    import pg from 'pg';
    const pool=new pg.Pool({connectionString:${JSON.stringify(baseUrl)}});
    try {await pool.query(${JSON.stringify(statement)})} finally {await pool.end()}
  `])
}

let started = false
try {
  // Archive only the old server source and migrations; dependencies resolve
  // through this checkout's installed node_modules.
  mkdirSync(oldRoot)
  mkdirSync(scratch)
  const archive = spawnSync("git", ["archive", "--format=tar", oldRef, "apps/server/src", "apps/server/db", "apps/server/package.json", "apps/server/tsconfig.json", "tsconfig.base.json"], {
    cwd: root, maxBuffer: 256 * 1024 * 1024
  })
  if (archive.status !== 0) throw new Error(`git archive ${oldRef} failed: ${archive.stderr}`)
  run("tar", ["-x", "-C", oldRoot], { input: archive.stdout, encoding: undefined })
  symlinkSync(join(root, "node_modules"), join(oldRoot, "node_modules"))
  const oldCommit = run("git", ["rev-parse", "--short", `${oldRef}^{commit}`]).trim()

  run("initdb", ["-D", data, "-U", "blumi", "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"])
  run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -h '' -p ${port}`, "-w", "start"])
  started = true
  // Supabase API roles, reproduced only inside this disposable cluster.
  sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN")
  sql("CREATE DATABASE rehearsal_068")

  console.log(`# old binary ${oldRef} (${oldCommit}); new binary: this checkout`)
  run(process.execPath, ["--import", "tsx", join(root, "scripts/security/migration-068-rehearsal.worker.mjs")], {
    env: {
      ...environment,
      REHEARSAL_ROOT: root,
      REHEARSAL_OLD_ROOT: oldRoot,
      REHEARSAL_SCRATCH: scratch,
      REHEARSAL_DATABASE_URL: databaseUrl("rehearsal_068")
    }
  })

  if (runOldSuite) {
    // The OLD binary's own PostgreSQL suites against the NEW 001-068 schema.
    // A file that fails on 068 is re-run on a 001-067 control database built
    // by the old migrator: only a failure the control does not reproduce is
    // attributed to 068.
    const files = readdirSync(join(oldRoot, "apps/server/src"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((path) => /process\.env\.DATABASE_URL/.test(readFileSync(path, "utf8")))
      .sort()
    let databaseIndex = 0
    const runOldFile = (file, migratorRoot) => {
      const name = `blumi_gate_${databaseIndex++}`
      sql(`CREATE DATABASE ${name}`)
      const url = databaseUrl(name)
      run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import migrationModule from ${JSON.stringify(join(migratorRoot, "apps/server/src/db/migrate.ts"))};
        const result = await migrationModule.runMigrations({databaseUrl:${JSON.stringify(url)}});
        const has068 = result.applied.includes('068_session_reuse_detection_and_firebase_uid.sql');
        if (has068 !== ${JSON.stringify(migratorRoot === root)}) throw new Error('unexpected 068 state');
      `])
      const result = spawnSync(process.execPath, ["--import", "tsx", "--test", file], {
        cwd: oldRoot, encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024,
        env: { ...environment, DATABASE_URL: url, BLUMI_TEST_REQUIRE_POSTGRES: "1", BLUMI_OTP_HMAC_SECRET: "rehearsal-only" }
      })
      sql(`DROP DATABASE ${name}`)
      const output = result.stdout ?? ""
      return {
        passed: result.status === 0,
        tests: Number(/^# tests (\d+)$/m.exec(output)?.[1] ?? 0),
        skipped: Number(/^# skipped (\d+)$/m.exec(output)?.[1] ?? 0),
        failures: [...output.matchAll(/^not ok \d+ - (.*)$/gm)].map((match) => match[1])
      }
    }
    // The old readiness test deletes the ledger row with the highest id and
    // expects readiness to fail. On a 068 database that row is 068, which the
    // old manifest does not require, so the old binary correctly stays ready:
    // the very compatibility property 068 relies on (worker step c2).
    const expectedOn068 = {
      "apps/server/src/operations/postgresSchemaReadiness.test.ts": [
        "real PostgreSQL readiness rejects incomplete migrations and missing runtime schema"
      ]
    }
    const results = []
    for (const file of files) {
      const relative = file.slice(oldRoot.length + 1)
      let on068 = runOldFile(file, root)
      if (!on068.tests || on068.skipped) throw new Error(`old suite ${relative} ran ${on068.tests} tests with ${on068.skipped} skipped`)
      const firstFailures = on068.failures
      // One retry separates timing flakes from reproducible failures.
      if (!on068.passed) on068 = runOldFile(file, root)
      if (on068.passed) {
        results.push({ file: relative, tests: on068.tests, on068: firstFailures.length ? "pass on retry (flaky)" : "pass", ...(firstFailures.length ? { flaky: firstFailures } : {}) })
        continue
      }
      const expected = expectedOn068[relative] ?? []
      const control = runOldFile(file, oldRoot)
      const unexplained = on068.failures.filter((failure) => !expected.includes(failure) && !control.failures.includes(failure))
      results.push({ file: relative, tests: on068.tests, on068: "fail", failures: on068.failures, expected, controlOn067Failures: control.failures })
      if (unexplained.length) {
        throw new Error(`old suite ${relative} fails on 068 but not on the 067 control: ${JSON.stringify(unexplained)}`)
      }
    }
    console.log(`OLD_SUITE_ON_068 ${JSON.stringify({ oldRef, oldCommit, files: results.length, tests: results.reduce((sum, row) => sum + row.tests, 0), results })}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "068 rehearsal failed")
  process.exitCode = 1
} finally {
  if (started) {
    try { run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]) }
    catch { process.exitCode = 1 }
  }
  if (process.exitCode !== 1 && process.env.BLUMI_PG_KEEP_TEST_DATA !== "1") {
    rmSync(directory, { recursive: true, force: true })
  } else if (existsSync(directory)) {
    console.log(`Rehearsal files retained: ${directory}`)
  }
}
