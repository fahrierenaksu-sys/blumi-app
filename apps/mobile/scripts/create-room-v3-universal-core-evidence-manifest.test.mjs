import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { writeUniversalCoreEvidenceManifest } from "./create-room-v3-universal-core-evidence-manifest.mjs"

test("creates a blocked but complete 45-row Universal Core evidence ledger", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "blumi-universal-evidence-ledger-"))
  try {
    const outputPath = join(outputDirectory, "manifest.json")
    const report = await writeUniversalCoreEvidenceManifest(outputPath)
    const manifest = JSON.parse(await readFile(outputPath, "utf8"))

    assert.equal(report.rowCount, 45)
    assert.equal(manifest.status, "blocked_missing_runtime_evidence")
    assert.equal(manifest.promotionEligible, false)
    assert.equal(manifest.rows.length, 45)
    assert.equal(new Set(manifest.rows.map((row) => row.candidateId)).size, 45)
    assert.ok(manifest.rows.every((row) => row.status === "missing"))
    assert.ok(manifest.rows.every((row) => row.requiredEvidenceIds.includes("persistenceEvidenceId")))
    assert.ok(manifest.rows.every((row) => row.requiredEvidenceIds.includes("perspectiveEvidenceId")))
    assert.ok(manifest.rows.every((row) => row.requiredEvidenceIds.includes("simulatorScreenshotPathByRotation")))
    assert.equal(manifest.perspectiveProfile, "my-room-locked-2.5d-v1")
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})
