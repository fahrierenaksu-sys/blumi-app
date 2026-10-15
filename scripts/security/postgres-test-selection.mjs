import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

// Which server tests the isolated PostgreSQL gate runs. Selection must not
// depend on one spelling (a refactor once removed the literal the gate looked
// for and two suites silently left the gate), so any of these markers counts.
const GUARD_CALL = /\b(?:disposablePostgres(?:Skip|Url)|assertDisposablePostgresDatabase)\(/
const DATABASE_URL_READ = /process\.env(?:\.DATABASE_URL\b|\[\s*["']DATABASE_URL["']\s*\])/
const POSTGRES_TEST_NAME = /\.postgres\.test\.ts$/
// Anything that hints at a database. A test with such a hint must be selected
// or be listed below with the reason it never opens a database.
const DATABASE_HINT = /disposablePostgres|BLUMI_TEST_REQUIRE_POSTGRES|DATABASE_URL/

/** Test files that mention the database but never open one. */
export const NON_DATABASE_TESTS = new Map([
  ["config.test.ts", "passes DATABASE_URL as a config value to the parser; never connects"]
])

/**
 * The gate must never select fewer suites than this. Lowering it needs the
 * same review as deleting a PostgreSQL test (2026-10-15: 64 suites).
 */
export const MIN_POSTGRES_TEST_FILES = 64

function listTypeScriptFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

/** Returns the absolute paths of every server test that needs PostgreSQL. */
export function selectPostgresTestFiles(serverSourceRoot) {
  const files = listTypeScriptFiles(serverSourceRoot).map((path) => ({ path, text: readFileSync(path, "utf8") }))
  if (files.length === 0) throw new Error("PostgreSQL test selection scanned no server source files")
  return files
    .filter(({ path }) => path.endsWith(".test.ts"))
    .filter(({ path, text }) => GUARD_CALL.test(text) || DATABASE_URL_READ.test(text)
      || POSTGRES_TEST_NAME.test(path))
    .map(({ path }) => path)
}

/**
 * Fails when the selection lost a suite: fewer than the floor, or a test that
 * hints at a database but is neither selected nor an explained exception.
 */
export function assertPostgresSelectionComplete(serverSourceRoot, selected, minimum = MIN_POSTGRES_TEST_FILES) {
  const chosen = new Set(selected)
  const missing = listTypeScriptFiles(serverSourceRoot)
    .filter((path) => path.endsWith(".test.ts") && !chosen.has(path))
    .filter((path) => !NON_DATABASE_TESTS.has(relative(serverSourceRoot, path)))
    .filter((path) => DATABASE_HINT.test(readFileSync(path, "utf8")))
    .map((path) => relative(serverSourceRoot, path))
  if (missing.length > 0) {
    throw new Error(`PostgreSQL gate does not select these database tests: ${missing.join(", ")}`)
  }
  if (selected.length < minimum) {
    throw new Error(`PostgreSQL gate selected ${selected.length} test files, expected at least ${minimum}`)
  }
}
