import { spawnSync } from "node:child_process"
import { mkdtempSync, chmodSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { randomBytes } from "node:crypto"

// Never accept DATABASE_URL: this gate can mutate only the cluster it creates.
const root = resolve(import.meta.dirname, "../..")
const directory = mkdtempSync(join(tmpdir(), "blumi-pg-gate-"))
chmodSync(directory, 0o700)
const data = join(directory, "data")
const port = "55487"
const databaseUrl = `postgresql://blumi@localhost/postgres?host=${encodeURIComponent(directory)}&port=${port}`
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  BLUMI_OTP_HMAC_SECRET: randomBytes(32).toString("hex"),
  BLUMI_TEST_REQUIRE_POSTGRES: "1"
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, env: environment, encoding: "utf8", timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024, ...options
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? result.error?.code})`)
  }
  return result.stdout ?? ""
}

let started = false
try {
  run("initdb", ["-D", data, "-U", "blumi", "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"])
  run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -h '' -p ${port}`, "-w", "start"])
  started = true
  const tests = process.argv.slice(2)
  const selected = tests.length ? tests : readdirSync(join(root, "apps/server/src"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => /process\.env\.DATABASE_URL/.test(readFileSync(path, "utf8")))
    .sort()
  if (selected.length === 0) throw new Error("No PostgreSQL integration tests registered")
  for (const file of selected) {
    const path = resolve(root, file)
    if (!path.startsWith(`${root}/apps/server/`) || !path.endsWith(".test.ts") || !existsSync(path)) {
      throw new Error("PostgreSQL gate accepts existing server .test.ts files only")
    }
  }
  for (const [index, file] of selected.entries()) {
    // Each file gets a fresh database; fixtures cannot contaminate another suite.
    const name = `blumi_gate_${index}`
    run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import pg from 'pg';
      const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
      try {await pool.query('CREATE DATABASE ${name}')} finally {await pool.end()}
    `])
    const caseUrl = new URL(databaseUrl)
    caseUrl.pathname = `/${name}`
    const caseEnvironment = { ...environment, DATABASE_URL: caseUrl.toString() }
    run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import {runMigrations} from './apps/server/src/db/migrate.ts';
      const first=await runMigrations({databaseUrl:process.env.DATABASE_URL});
      assert.ok(first.applied.length>0);
      const second=await runMigrations({databaseUrl:process.env.DATABASE_URL});
      assert.equal(second.applied.length,0);
      assert.equal(second.skipped.length,first.applied.length);
      console.log('Migration from-empty and rerun passed:', first.applied.length);
    `], { env: caseEnvironment })
    const output = run(process.execPath, ["--import", "tsx", "--test", file], { env: caseEnvironment })
    if (!/^# tests [1-9]\d*$/m.test(output) || !/^# skipped 0$/m.test(output)) {
      throw new Error("PostgreSQL gate must execute tests without skips")
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "PostgreSQL gate failed")
  process.exitCode = 1
} finally {
  if (started) {
    try {
      run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"])
      // Only this invocation's newly-created cluster, after confirmed shutdown.
      if (process.env.BLUMI_PG_KEEP_TEST_DATA !== "1") rmSync(data, { recursive: true })
    }
    catch { process.exitCode = 1 }
  }
  console.log(`Isolated test logs retained: ${directory}`)
}
