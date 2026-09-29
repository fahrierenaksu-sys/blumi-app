import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  DEFAULT_DESTINATION,
  REPO_RECORD_PATH,
  archiveFromManifest,
  parseArgs
} from "./archive-from-manifest.mjs"

const script = path.resolve(import.meta.dirname, "archive-from-manifest.mjs")
const sha = (text) => createHash("sha256").update(text).digest("hex")

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "blumi-archive-test-"))
  const repo = path.join(root, "repo")
  const dest = path.join(root, "workbench", "archive")
  const files = {
    "apps/a/one.png": "one",
    "apps/a/nested/two.py": "print('two')",
    "apps/keep.ts": "export const keep = 1"
  }
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
    writeFileSync(path.join(repo, rel), body)
  }
  const manifest = {
    entries: [
      { path: "apps/a/one.png", bytes: 3, sha256: sha("one"), decision: "ARCHIVE" },
      { path: "apps/a/nested/two.py", bytes: 12, sha256: sha("print('two')"), decision: "ARCHIVE" },
      { path: "apps/keep.ts", bytes: 21, sha256: sha("export const keep = 1"), decision: "KEEP" }
    ]
  }
  mkdirSync(path.join(repo, "docs/quality"), { recursive: true })
  writeFileSync(path.join(repo, "docs/quality/manifest.json"), JSON.stringify(manifest))
  return { root, repo, dest, files, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test("defaults point at the 2026-09-30 Workbench archive and flags override them", () => {
  assert.equal(DEFAULT_DESTINATION, "/Users/evrenevren/BlumiArtWorkbench/2026-09-30/repo-cleanup-archive/")
  const options = parseArgs(["--dest", "/tmp/x", "--manifest", "m.json", "--record-in-repo"])
  assert.equal(options.dest, "/tmp/x")
  assert.equal(options.manifest, "m.json")
  assert.equal(options.recordInRepo, true)
  assert.throws(() => parseArgs(["--delete"]), /Unknown argument/)
})

test("copies only ARCHIVE entries, verifies hashes, records receipts and never deletes sources", async () => {
  const f = fixture()
  try {
    const { receipt } = await archiveFromManifest({ repoRoot: f.repo, manifest: "docs/quality/manifest.json", dest: f.dest, recordInRepo: true })
    assert.equal(receipt.complete, true)
    assert.equal(receipt.totals.archiveEntries, 2)
    assert.deepEqual(receipt.entries.map((e) => [e.path, e.status, e.verified]), [
      ["apps/a/one.png", "copied", true],
      ["apps/a/nested/two.py", "copied", true]
    ])
    assert.equal(readFileSync(path.join(f.dest, "apps/a/nested/two.py"), "utf8"), "print('two')")
    assert.equal(existsSync(path.join(f.dest, "apps/keep.ts")), false)
    for (const rel of Object.keys(f.files)) assert.ok(existsSync(path.join(f.repo, rel)), `${rel} must remain in the repo`)
    const destReceipt = JSON.parse(readFileSync(path.join(f.dest, "archive-verification.json"), "utf8"))
    const repoReceipt = JSON.parse(readFileSync(path.join(f.repo, REPO_RECORD_PATH), "utf8"))
    assert.equal(destReceipt.manifestSha256, repoReceipt.manifestSha256)
    assert.equal(repoReceipt.entries.every((e) => e.verified && /^[0-9a-f]{64}$/.test(e.sha256)), true)

    // Re-running is idempotent: identical copies are verified, not rewritten.
    const again = await archiveFromManifest({ repoRoot: f.repo, manifest: "docs/quality/manifest.json", dest: f.dest })
    assert.deepEqual(again.receipt.entries.map((e) => e.status), ["already-archived", "already-archived"])
  } finally {
    f.cleanup()
  }
})

test("refuses to overwrite a differing destination file and reports source drift", async () => {
  const f = fixture()
  try {
    mkdirSync(path.join(f.dest, "apps/a"), { recursive: true })
    writeFileSync(path.join(f.dest, "apps/a/one.png"), "different")
    writeFileSync(path.join(f.repo, "apps/a/nested/two.py"), "changed after manifest")
    const { receipt } = await archiveFromManifest({ repoRoot: f.repo, manifest: "docs/quality/manifest.json", dest: f.dest })
    assert.equal(receipt.complete, false)
    assert.deepEqual(receipt.entries.map((e) => e.status), ["refused-destination-differs", "source-hash-mismatch"])
    assert.equal(readFileSync(path.join(f.dest, "apps/a/one.png"), "utf8"), "different")
    assert.equal(existsSync(path.join(f.repo, REPO_RECORD_PATH)), false)
  } finally {
    f.cleanup()
  }
})

test("rejects path traversal and the CLI exits non-zero on incomplete archives", () => {
  const f = fixture()
  try {
    writeFileSync(path.join(f.repo, "docs/quality/manifest.json"), JSON.stringify({ entries: [{ path: "../escape.txt", bytes: 1, sha256: sha("x"), decision: "ARCHIVE" }] }))
    let exitCode = 0
    try {
      execFileSync(process.execPath, [script, "--repo-root", f.repo, "--manifest", "docs/quality/manifest.json", "--dest", f.dest], { encoding: "utf8" })
    } catch (error) {
      exitCode = error.status
    }
    assert.equal(exitCode, 1)
    const receipt = JSON.parse(readFileSync(path.join(f.dest, "archive-verification.json"), "utf8"))
    assert.equal(receipt.entries[0].status, "error")
    assert.match(receipt.entries[0].error, /Unsafe manifest path/)
  } finally {
    f.cleanup()
  }
})

test("the tool source contains no delete or move operations", () => {
  const source = readFileSync(script, "utf8")
  assert.doesNotMatch(source, /\b(unlink|rmSync|rmdir|rename|\brm\()/)
})
