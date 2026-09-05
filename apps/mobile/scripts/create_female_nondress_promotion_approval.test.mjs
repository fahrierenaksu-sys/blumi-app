import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const creator = resolve("apps/mobile/scripts/create_female_nondress_promotion_approval.mjs")
const evidenceRoot = resolve("docs/avatar-motion-pipeline/female-nondress-promotion-evidence/2026-07-15")
const candidateManifest = resolve("docs/avatar-motion-pipeline/female-combined-promotion-gate/candidate-source-manifest.json")

test("approval creator is opt-in and binds the exact 18-item candidate evidence set", () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "female-nondress-approval-"))
  const output = join(outputRoot, "approval.json")
  try {
    const blocked = spawnSync(process.execPath, [creator, "--output", output, "--evidence-root", evidenceRoot], {
      encoding: "utf8"
    })
    assert.notEqual(blocked.status, 0)
    assert.match(`${blocked.stdout}\n${blocked.stderr}`, /confirm-independent-review/)

    const generated = spawnSync(process.execPath, [
      creator,
      "--output", output,
      "--evidence-root", evidenceRoot,
      "--candidate-manifest", candidateManifest,
      "--producer", "female-wardrobe-producer-pipeline",
      "--independent-reviewer", "codex-root-independent-review",
      "--reviewed-at", "2026-07-15T12:00:00.000Z",
      "--confirm-independent-review"
    ], { encoding: "utf8" })
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`)
    const approval = JSON.parse(readFileSync(output, "utf8"))
    assert.equal(approval.schemaVersion, 2)
    assert.equal(approval.verdict, "PASS")
    assert.equal(approval.producer, "female-wardrobe-producer-pipeline")
    assert.equal(approval.independentReviewer, "codex-root-independent-review")
    assert.equal(Object.keys(approval.items).length, 18)
    assert.equal(approval.items["bottom:denim_skort_shorts"].evidence.length, 3)
    assert.equal(Object.keys(approval.items["bottom:striped_crochet_shorts"].sources).length, 6)
    assert.equal(approval.items["bottom:coral_embellished_laceup_pants"].evidence.length, 3)
    assert.equal(Object.keys(approval.items["bottom:coral_embellished_laceup_pants"].sources).length, 6)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
