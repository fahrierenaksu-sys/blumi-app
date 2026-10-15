import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import test from "node:test"
import {
  assertPostgresSelectionComplete,
  MIN_POSTGRES_TEST_FILES,
  selectPostgresTestFiles
} from "./postgres-test-selection.mjs"

const SERVER_SOURCE_ROOT = resolve(import.meta.dirname, "../../apps/server/src")

function withSourceTree(files, run) {
  const root = mkdtempSync(join(tmpdir(), "blumi-pg-selection-"))
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const names = (root, paths) => paths.map((path) => relative(root, path)).sort()

test("the gate selects the PostgreSQL suites that once fell out of it", () => {
  const selected = names(SERVER_SOURCE_ROOT, selectPostgresTestFiles(SERVER_SOURCE_ROOT))
  assert.ok(selected.includes("auth/sessionCache.test.ts"))
  assert.ok(selected.includes("e2e/chatSendRoundTrips.postgres.test.ts"))
  assert.ok(selected.length >= MIN_POSTGRES_TEST_FILES, `selected ${selected.length}`)
  assertPostgresSelectionComplete(SERVER_SOURCE_ROOT, selectPostgresTestFiles(SERVER_SOURCE_ROOT))
})

test("a suite is selected by the disposable helper, the DATABASE_URL read or the .postgres name", () => {
  withSourceTree({
    "a/skipOnly.test.ts": "test('x', disposablePostgresSkip(), () => {})",
    "a/rawRead.test.ts": "const url = process.env.DATABASE_URL",
    "a/named.postgres.test.ts": "test('x', () => {})",
    "a/memoryOnly.test.ts": "test('x', () => {})",
    "a/helper.ts": "export const url = () => disposablePostgresUrl(process.env.DATABASE_URL)"
  }, (root) => {
    assert.deepEqual(names(root, selectPostgresTestFiles(root)),
      ["a/named.postgres.test.ts", "a/rawRead.test.ts", "a/skipOnly.test.ts"])
  })
})

test("the self-check fails for a database test that no marker selects", () => {
  withSourceTree({
    "a/guarded.test.ts": "test('x', disposablePostgresSkip(), () => {})",
    "a/aliased.test.ts": "import { disposablePostgresSkip as needsPg } from '../db/disposablePostgres'\ntest('x', needsPg(), () => {})"
  }, (root) => {
    assert.throws(() => assertPostgresSelectionComplete(root, selectPostgresTestFiles(root), 1),
      /does not select these database tests: a\/aliased\.test\.ts/)
  })
})

test("the self-check fails when fewer suites than the floor are selected", () => {
  withSourceTree({ "a/one.test.ts": "test('x', disposablePostgresSkip(), () => {})" }, (root) => {
    assert.throws(() => assertPostgresSelectionComplete(root, selectPostgresTestFiles(root), 2),
      /selected 1 test files, expected at least 2/)
  })
})

test("an empty source tree is an error, not an empty selection", () => {
  withSourceTree({}, (root) => {
    assert.throws(() => selectPostgresTestFiles(root), /scanned no server source files/)
  })
})
