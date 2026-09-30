#!/usr/bin/env node
// Copies every ARCHIVE entry of a cleanup manifest into the Blumi Art Workbench,
// verifies each copy by SHA-256 and writes an archive-verification.json receipt.
//
// This tool NEVER deletes, moves or rewrites repository files. It refuses to
// overwrite an existing destination file whose content differs from the source.
//
// Usage (run on the owner's Mac from the repository root):
//   node tools/workbench/archive-from-manifest.mjs [--manifest <file>] [--dest <dir>]
//        [--repo-root <dir>] [--record-in-repo] [--dry-run]
//
// A manifest may declare `archiveDestinationDefault` (used when --dest is not
// given) and `archiveVerificationPath` (the repository receipt written by
// --record-in-repo), so a later manifest never overwrites an earlier receipt.

import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const DEFAULT_DESTINATION = "/Users/evrenevren/BlumiArtWorkbench/2026-09-30/repo-cleanup-archive/"
export const DEFAULT_MANIFEST = "docs/quality/cleanup-manifest-2026-09-29.json"
export const REPO_RECORD_PATH = "docs/quality/archive-verification-2026-09-29.json"
export const RECEIPT_NAME = "archive-verification.json"
export const RECEIPT_SCHEMA = "blumi-workbench-archive-verification-v1"

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export function parseArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST, dest: undefined, repoRoot: DEFAULT_REPO_ROOT, recordInRepo: false, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`)
      return next
    }
    if (arg === "--manifest") options.manifest = value()
    else if (arg === "--dest") options.dest = value()
    else if (arg === "--repo-root") options.repoRoot = path.resolve(value())
    else if (arg === "--record-in-repo") options.recordInRepo = true
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex")
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

function assertSafeRelativePath(relative) {
  if (typeof relative !== "string" || !relative) throw new Error("Manifest entry has no path")
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`Unsafe manifest path: ${relative}`)
  }
}

// The repository receipt path for a manifest: its declared
// `archiveVerificationPath`, or the 2026-09-29 default.
export function resolveRepoRecordPath(manifest) {
  const declared = manifest?.archiveVerificationPath
  if (declared === undefined) return REPO_RECORD_PATH
  assertSafeRelativePath(declared)
  return declared
}

export async function archiveFromManifest(options) {
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT)
  const manifestPath = path.resolve(repoRoot, options.manifest ?? DEFAULT_MANIFEST)
  const manifestBytes = await readFile(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8"))
  if (!Array.isArray(manifest.entries)) throw new Error("Manifest must contain an entries array")
  const destination = path.resolve(options.dest ?? manifest.archiveDestinationDefault ?? DEFAULT_DESTINATION)
  const repoRecordPath = resolveRepoRecordPath(manifest)

  const archiveEntries = manifest.entries.filter((entry) => entry.decision === "ARCHIVE")
  const results = []
  for (const entry of archiveEntries) {
    const result = { path: entry.path, bytes: entry.bytes, sha256: entry.sha256, verified: false, status: "pending" }
    results.push(result)
    try {
      assertSafeRelativePath(entry.path)
      if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")) throw new Error("Manifest entry has no valid sha256")
      const source = path.join(repoRoot, entry.path)
      const target = path.join(destination, entry.path)
      if (!(await exists(source))) {
        result.status = "source-missing"
        continue
      }
      const sourceHash = await sha256File(source)
      if (sourceHash !== entry.sha256) {
        result.status = "source-hash-mismatch"
        result.actualSourceSha256 = sourceHash
        continue
      }
      if (await exists(target)) {
        const targetHash = await sha256File(target)
        if (targetHash !== entry.sha256) {
          result.status = "refused-destination-differs"
          result.destinationSha256 = targetHash
          continue
        }
        result.status = "already-archived"
        result.verified = true
        continue
      }
      if (options.dryRun) {
        result.status = "would-copy"
        continue
      }
      await mkdir(path.dirname(target), { recursive: true })
      // COPYFILE_EXCL: never overwrite a file that appeared after the existence check.
      await copyFile(source, target, fsConstants.COPYFILE_EXCL)
      const copiedHash = await sha256File(target)
      result.verified = copiedHash === entry.sha256
      result.status = result.verified ? "copied" : "copy-hash-mismatch"
      if (!result.verified) result.destinationSha256 = copiedHash
    } catch (error) {
      result.status = "error"
      result.error = error instanceof Error ? error.message : String(error)
    }
  }

  const verifiedCount = results.filter((r) => r.verified).length
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(options.dryRun),
    manifest: path.relative(repoRoot, manifestPath).split(path.sep).join("/"),
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    destination,
    totals: {
      archiveEntries: results.length,
      verified: verifiedCount,
      failed: results.length - verifiedCount,
      bytes: results.reduce((sum, r) => sum + (r.bytes ?? 0), 0)
    },
    complete: !options.dryRun && results.length > 0 && verifiedCount === results.length,
    entries: results
  }
  const json = `${JSON.stringify(receipt, null, 2)}\n`
  const written = []
  if (!options.dryRun) {
    await mkdir(destination, { recursive: true })
    const receiptPath = path.join(destination, RECEIPT_NAME)
    await writeFile(receiptPath, json)
    written.push(receiptPath)
    if (options.recordInRepo) {
      const repoRecord = path.join(repoRoot, repoRecordPath)
      await mkdir(path.dirname(repoRecord), { recursive: true })
      await writeFile(repoRecord, json)
      written.push(repoRecord)
    }
  }
  return { receipt, written }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log("Usage: node tools/workbench/archive-from-manifest.mjs [--manifest <file>] [--dest <dir>] [--repo-root <dir>] [--record-in-repo] [--dry-run]")
    console.log(`Default destination: the manifest's archiveDestinationDefault, else ${DEFAULT_DESTINATION}`)
    console.log("Copies ARCHIVE entries and verifies SHA-256. Never deletes anything.")
    return
  }
  const { receipt, written } = await archiveFromManifest(options)
  const byStatus = {}
  for (const entry of receipt.entries) byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1
  console.log(`Archive entries: ${receipt.totals.archiveEntries}; verified: ${receipt.totals.verified}; failed: ${receipt.totals.failed}`)
  console.log(`Statuses: ${JSON.stringify(byStatus)}`)
  for (const file of written) console.log(`Wrote ${file}`)
  if (!receipt.dryRun && !receipt.complete) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main()
}
