#!/usr/bin/env node
// Removes repository copies of files that the Workbench archive receipt proves
// were copied and SHA-256 verified. It is the second half of the cleanup flow:
//   1. archive-from-manifest.mjs --record-in-repo  (owner's Mac, copies only)
//   2. remove-archived-from-manifest.mjs --apply    (stages `git rm` only for
//      verified entries whose repository bytes still match the receipt)
// Without --apply it only reports. It never touches unverified entries.
//
// Usage: node tools/workbench/remove-archived-from-manifest.mjs
//        [--receipt <file>] [--manifest <file>] [--repo-root <dir>] [--apply]

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { RECEIPT_SCHEMA, resolveRepoRecordPath } from "./archive-from-manifest.mjs"

const DEFAULT_MANIFEST = "docs/quality/cleanup-manifest-2026-09-29.json"
const REMOVABLE_STATUSES = new Set(["copied", "already-archived"])

export function parseArgs(argv) {
  const options = { apply: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") options.apply = true
    else if (arg === "--receipt") options.receipt = argv[++index]
    else if (arg === "--manifest") options.manifest = argv[++index]
    else if (arg === "--repo-root") options.repoRoot = argv[++index]
    else if (arg === "--help" || arg === "-h") options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

function assertSafeRelativePath(relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Unsafe path in receipt: ${relative}`)
  }
}

export async function planRemoval(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd())
  const manifestPath = path.resolve(repoRoot, options.manifest ?? DEFAULT_MANIFEST)
  const manifestBytes = existsSync(manifestPath) ? await readFile(manifestPath) : null
  // Each manifest has its own receipt: its declared archiveVerificationPath,
  // or the 2026-09-29 default. --receipt overrides it.
  const receiptPath = path.resolve(
    repoRoot,
    options.receipt ?? resolveRepoRecordPath(manifestBytes ? JSON.parse(manifestBytes.toString("utf8")) : {})
  )
  if (!existsSync(receiptPath)) {
    throw new Error(`No archive receipt at ${receiptPath}. Run archive-from-manifest.mjs --record-in-repo on the owner's machine first.`)
  }
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"))
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) throw new Error("Unsupported archive receipt schema")
  if (receipt.dryRun) throw new Error("The archive receipt is from a dry run; nothing was archived")
  if (receipt.complete !== true) throw new Error("The archive receipt is not complete; fix failed entries and archive again")
  if (!manifestBytes) throw new Error(`No cleanup manifest at ${manifestPath}`)
  const manifestSha256 = sha256(manifestBytes)
  if (receipt.manifestSha256 !== manifestSha256) {
    throw new Error("The archive receipt was produced from a different manifest version")
  }

  const remove = []
  const skipped = []
  for (const entry of receipt.entries ?? []) {
    assertSafeRelativePath(entry.path)
    if (entry.verified !== true || !REMOVABLE_STATUSES.has(entry.status)) {
      skipped.push({ path: entry.path, reason: `not verified (${entry.status})` })
      continue
    }
    const file = path.join(repoRoot, entry.path)
    if (!existsSync(file)) {
      skipped.push({ path: entry.path, reason: "already absent" })
      continue
    }
    if (sha256(await readFile(file)) !== entry.sha256) {
      skipped.push({ path: entry.path, reason: "repository copy changed since archiving" })
      continue
    }
    remove.push(entry.path)
  }
  return { repoRoot, remove, skipped }
}

export async function removeArchived(options = {}) {
  const plan = await planRemoval(options)
  if (options.apply && plan.remove.length > 0) {
    execFileSync("git", ["rm", "--quiet", "--", ...plan.remove], { cwd: plan.repoRoot, stdio: "inherit" })
  }
  return { ...plan, applied: Boolean(options.apply) }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log("Usage: node tools/workbench/remove-archived-from-manifest.mjs [--receipt <file>] [--manifest <file>] [--repo-root <dir>] [--apply]")
    console.log("Stages git rm only for receipt-verified files whose bytes still match. Reports without --apply.")
    return
  }
  const result = await removeArchived(options)
  console.log(`${result.applied ? "Removed (staged)" : "Would remove"}: ${result.remove.length}; skipped: ${result.skipped.length}`)
  for (const item of result.skipped) console.log(`skip ${item.path}: ${item.reason}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
