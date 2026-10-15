import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"
import {
  disposablePostgresSkip,
  disposablePostgresUrl,
  sanitizeTestDatabaseEnvironment
} from "./disposablePostgres"

// `npm test` runs this file compiled from dist/, which holds no .ts sources.
// Scan the workspace's src/ wherever the test runs from, never its own folder.
const SOURCE_ROOT = join(findWorkspaceRoot(__dirname), "src")
// 2026-10-15: 444 TypeScript files and 64 tests that open the gate database.
// A scan below these floors found the wrong folder and proves nothing.
const MIN_SCANNED_FILES = 400
const MIN_DATABASE_TEST_FILES = 60
const GATE_URL = "postgresql://blumi@localhost/blumi_gate_3?host=%2Ftmp%2Fblumi-pg-gate-abc&port=55487"
// A closed port: nothing listens, so any attempt to connect would be visible.
const SHELL_URL = "postgres://user@127.0.0.1:1/not_disposable"

function withEnvironment(values: Record<string, string | undefined>, run: () => void): void {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  const apply = (next: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  apply(values)
  try {
    run()
  } finally {
    apply(previous)
  }
}

function findWorkspaceRoot(start: string): string {
  for (let directory = start; directory !== dirname(directory); directory = dirname(directory)) {
    if (existsSync(join(directory, "package.json"))) return directory
  }
  throw new Error("no package.json above the disposablePostgres test")
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(path)
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : []
  })
}

type SourceFile = { path: string; text: string }

/** Production code that legitimately reads DATABASE_URL or opens a pool, with the reason. */
const PRODUCTION_DATABASE_OPENERS = new Map([
  ["config.ts", "reads the server's configured DATABASE_URL"],
  ["db/databasePoolConfig.ts", "builds the server's one production pool from config"],
  ["db/migrate.ts", "the migrate CLI connects to the URL its operator passes"],
  ["operations/betaResetCli.ts", "operator CLI with its own confirmation and target checks"],
  ["db/disposablePostgres.ts", "the guard itself"]
])

// Reading DATABASE_URL or constructing a pg connection, whatever the file is called.
const DATABASE_ACCESS = /process\.env(?:\.DATABASE_URL\b|\[\s*["']DATABASE_URL["']\s*\])|\bnew\s+(?:pg\.)?(?:Pool|Client)\s*\(/
const OPENS_CONNECTION = /\bnew\s+(?:pg\.)?(?:Pool|Client)\s*\(/
const GUARD_CALL = /\b(?:assertDisposablePostgresDatabase|disposablePostgresUrl)\(/
const RELATIVE_IMPORT = /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g

/**
 * Every non-production file that touches the database must run the guard
 * itself, or (without opening a connection of its own) hand DATABASE_URL to
 * shared test support that runs it, such as the repository contract.
 */
function findUnguardedDatabaseAccess(root: string, files: SourceFile[]): string[] {
  const isProduction = (path: string) => PRODUCTION_DATABASE_OPENERS.has(relative(root, path))
  const guardedSupport = new Set(files
    .filter(({ path, text }) => !path.endsWith(".test.ts") && !isProduction(path) && GUARD_CALL.test(text))
    .map(({ path }) => path))
  const importsGuardedSupport = ({ path, text }: SourceFile) => [...text.matchAll(RELATIVE_IMPORT)]
    .some(([, specifier]) => guardedSupport.has(`${resolve(dirname(path), specifier)}.ts`))
  return files
    .filter(({ path, text }) => !isProduction(path) && DATABASE_ACCESS.test(text) && !GUARD_CALL.test(text))
    .filter((file) => OPENS_CONNECTION.test(file.text) || !importsGuardedSupport(file))
    .map(({ path }) => relative(root, path))
}

test("every test file or helper that opens a database from DATABASE_URL goes through the disposable-database guard", () => {
  const files = listTypeScriptFiles(SOURCE_ROOT).map((path) => ({ path, text: readFileSync(path, "utf8") }))
  assert.ok(files.length >= MIN_SCANNED_FILES, `scanned only ${files.length} files under ${SOURCE_ROOT}`)
  const databaseTests = files.filter(({ path, text }) => path.endsWith(".test.ts") && DATABASE_ACCESS.test(text))
  assert.ok(databaseTests.length >= MIN_DATABASE_TEST_FILES, `found only ${databaseTests.length} database tests`)
  for (const name of PRODUCTION_DATABASE_OPENERS.keys()) {
    assert.ok(existsSync(join(SOURCE_ROOT, name)), `stale production exception: ${name}`)
  }
  assert.deepEqual(findUnguardedDatabaseAccess(SOURCE_ROOT, files), [],
    "these files touch a database from DATABASE_URL without the disposable-database guard")
})

test("the guard catches database access that a file name or a wrapper would hide", () => {
  const root = "/server/src"
  const file = (path: string, text: string) => ({ path: join(root, path), text })
  const files = [
    file("db/repositoryContract.ts", "new Pool({ connectionString: disposablePostgresUrl(input.databaseUrl) })"),
    file("db/thing.contract.test.ts", 'import { run } from "./repositoryContract"\nrun({ databaseUrl: process.env.DATABASE_URL })'),
    file("db/pgTestSupport.ts", "export const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL })"),
    file("db/wrapperUser.test.ts", 'import { createPool } from "./pgTestSupport"\nconst pool = createPool()\nconst url = process.env.DATABASE_URL'),
    file("db/migrations.test.ts", 'await runMigrations({ databaseUrl: process.env["DATABASE_URL"] })'),
    file("db/otherVariable.test.ts", "const client = new pg.Client({ connectionString: process.env.OTHER_URL })"),
    file("db/sneaky.test.ts", 'import { run } from "./repositoryContract"\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL })'),
    file("db/guarded.test.ts", "const pool = new Pool({ connectionString: disposablePostgresUrl(process.env.DATABASE_URL) })"),
    file("config.ts", "const url = process.env.DATABASE_URL")
  ]
  assert.deepEqual(findUnguardedDatabaseAccess(root, files).sort(), [
    "db/migrations.test.ts",
    "db/otherVariable.test.ts",
    "db/pgTestSupport.ts",
    "db/sneaky.test.ts",
    "db/wrapperUser.test.ts"
  ])
})

test("a database that the isolated gate did not create is refused before any connection", () => {
  withEnvironment({ BLUMI_TEST_REQUIRE_POSTGRES: "1", DATABASE_URL: SHELL_URL }, () => {
    assert.throws(() => disposablePostgresUrl(SHELL_URL), /local Unix socket/)
    assert.equal(disposablePostgresSkip().skip, false)
  })
  withEnvironment({ BLUMI_TEST_REQUIRE_POSTGRES: "1" }, () => {
    assert.equal(disposablePostgresUrl(GATE_URL), GATE_URL)
  })
})

test("a plain run skips every database test even when DATABASE_URL is exported", () => {
  withEnvironment({ BLUMI_TEST_REQUIRE_POSTGRES: undefined, DATABASE_URL: SHELL_URL }, () => {
    assert.equal(disposablePostgresSkip().skip, true)
    assert.throws(() => disposablePostgresUrl(SHELL_URL), /disposable PostgreSQL gate/)
  })
})

test("the test runner environment drops DATABASE_URL unless the isolated gate set it", () => {
  assert.equal(sanitizeTestDatabaseEnvironment({ DATABASE_URL: SHELL_URL, PATH: "/bin" }).DATABASE_URL, undefined)
  assert.equal(
    sanitizeTestDatabaseEnvironment({ DATABASE_URL: SHELL_URL, BLUMI_TEST_REQUIRE_POSTGRES: "1" }).DATABASE_URL,
    undefined,
    "the gate flag alone must not let a foreign URL through"
  )
  assert.equal(sanitizeTestDatabaseEnvironment({ DATABASE_URL: "not a url", BLUMI_TEST_REQUIRE_POSTGRES: "1" }).DATABASE_URL, undefined)
  const gateEnvironment = sanitizeTestDatabaseEnvironment({
    DATABASE_URL: GATE_URL, BLUMI_TEST_REQUIRE_POSTGRES: "1", PATH: "/bin"
  })
  assert.equal(gateEnvironment.DATABASE_URL, GATE_URL)
  assert.equal(gateEnvironment.PATH, "/bin")
})
