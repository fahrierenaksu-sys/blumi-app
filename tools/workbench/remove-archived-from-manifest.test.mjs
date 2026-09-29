import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { RECEIPT_SCHEMA, REPO_RECORD_PATH } from "./archive-from-manifest.mjs"
import { planRemoval, removeArchived } from "./remove-archived-from-manifest.mjs"

const sha = (text) => createHash("sha256").update(text).digest("hex")
const MANIFEST = "docs/quality/cleanup-manifest-2026-09-29.json"

function fixture(receiptOverrides = {}, entryOverrides = {}) {
  const repo = mkdtempSync(path.join(tmpdir(), "blumi-remove-archived-"))
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" })
  git("init", "-q")
  git("config", "user.email", "test@example.test")
  git("config", "user.name", "test")
  const files = { "art/one.png": "one", "art/two.py": "two", "art/changed.png": "original", "keep.ts": "keep" }
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
    writeFileSync(path.join(repo, rel), body)
  }
  mkdirSync(path.join(repo, "docs/quality"), { recursive: true })
  writeFileSync(path.join(repo, MANIFEST), JSON.stringify({ entries: [] }))
  const entry = (rel, body, status = "copied", verified = true) => ({
    path: rel, bytes: body.length, sha256: sha(body), verified, status, ...(entryOverrides[rel] ?? {})
  })
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    dryRun: false,
    complete: true,
    manifestSha256: sha(readFileSync(path.join(repo, MANIFEST))),
    entries: [
      entry("art/one.png", "one"),
      entry("art/two.py", "two", "already-archived"),
      entry("art/changed.png", "original"),
      entry("art/unverified.png", "x", "copy-hash-mismatch", false)
    ],
    ...receiptOverrides
  }
  writeFileSync(path.join(repo, REPO_RECORD_PATH), JSON.stringify(receipt))
  git("add", "-A")
  git("commit", "-q", "-m", "fixture")
  writeFileSync(path.join(repo, "art/changed.png"), "edited after archiving")
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) }
}

test("reports without deleting unless --apply is given", async () => {
  const { repo, cleanup } = fixture()
  try {
    const result = await removeArchived({ repoRoot: repo })
    assert.deepEqual(result.remove, ["art/one.png", "art/two.py"])
    assert.equal(result.applied, false)
    assert.ok(existsSync(path.join(repo, "art/one.png")))
  } finally { cleanup() }
})

test("--apply stages removal only of verified files whose bytes still match", async () => {
  const { repo, cleanup } = fixture()
  try {
    const result = await removeArchived({ repoRoot: repo, apply: true })
    assert.equal(existsSync(path.join(repo, "art/one.png")), false)
    assert.equal(existsSync(path.join(repo, "art/two.py")), false)
    assert.ok(existsSync(path.join(repo, "art/changed.png")))
    assert.ok(existsSync(path.join(repo, "keep.ts")))
    const staged = execFileSync("git", ["diff", "--cached", "--name-status"], { cwd: repo, encoding: "utf8" })
    assert.match(staged, /^D\tart\/one\.png$/m)
    assert.match(staged, /^D\tart\/two\.py$/m)
    assert.deepEqual(result.skipped.map((item) => item.reason).sort(), [
      "not verified (copy-hash-mismatch)",
      "repository copy changed since archiving"
    ])
  } finally { cleanup() }
})

for (const [name, overrides, pattern] of [
  ["dry-run receipts", { dryRun: true }, /dry run/],
  ["incomplete receipts", { complete: false }, /not complete/],
  ["receipts for another manifest", { manifestSha256: "0".repeat(64) }, /different manifest/],
  ["unknown receipt schemas", { schemaVersion: "other" }, /schema/]
]) {
  test(`refuses ${name}`, async () => {
    const { repo, cleanup } = fixture(overrides)
    try {
      await assert.rejects(planRemoval({ repoRoot: repo }), pattern)
      assert.ok(existsSync(path.join(repo, "art/one.png")))
    } finally { cleanup() }
  })
}

test("rejects receipt paths that escape the repository", async () => {
  const { repo, cleanup } = fixture({}, { "art/one.png": { path: "../outside.png" } })
  try {
    await assert.rejects(planRemoval({ repoRoot: repo }), /Unsafe path/)
  } finally { cleanup() }
})

test("fails clearly when no receipt has been recorded", async () => {
  const repo = mkdtempSync(path.join(tmpdir(), "blumi-remove-archived-empty-"))
  try {
    await assert.rejects(planRemoval({ repoRoot: repo }), /No archive receipt/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
