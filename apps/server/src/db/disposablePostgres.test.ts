import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import test from "node:test"
import {
  disposablePostgresSkip,
  disposablePostgresUrl,
  sanitizeTestDatabaseEnvironment
} from "./disposablePostgres"

const SOURCE_ROOT = resolve(__dirname, "..")
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

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(path)
    return entry.name.endsWith(".ts") ? [path] : []
  })
}

test("every test file or helper that opens a database from DATABASE_URL goes through the disposable-database guard", () => {
  // Test files and test helpers (harnesses, repository contracts). Production code
  // such as config.ts and the migrate CLI legitimately reads DATABASE_URL.
  const isTestSupport = (path: string) =>
    /\.test\.ts$/.test(path) || /(Harness|Contract|Fixture)\.ts$/i.test(path)
  const opensPool = /\b(?:Pool|Client)\(/
  const guarded = /\b(?:assertDisposablePostgresDatabase|disposablePostgresUrl)\(/
  const offenders = listTypeScriptFiles(SOURCE_ROOT)
    .filter((path) => !path.endsWith("disposablePostgres.test.ts") && !path.endsWith("disposablePostgres.ts"))
    .filter(isTestSupport)
    .filter((path) => {
      const text = readFileSync(path, "utf8")
      return text.includes("DATABASE_URL") && opensPool.test(text) && !guarded.test(text)
    })
    .map((path) => relative(SOURCE_ROOT, path))
  assert.deepEqual(offenders, [], "these files open a database from DATABASE_URL without the disposable-database guard")
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
