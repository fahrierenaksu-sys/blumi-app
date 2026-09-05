import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const producer = resolve("apps/mobile/scripts/generate_female_nondress_promotion_evidence.mjs")
const candidateManifest = resolve(
  "docs/avatar-motion-pipeline/female-combined-promotion-gate/candidate-source-manifest.json"
)

test("promotion evidence produces one current static, close-up, and 4W+1S proof set per allowlisted item", () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "female-nondress-promotion-evidence-"))
  try {
    const generated = spawnSync(process.execPath, [producer, "--output-root", outputRoot, "--candidate-manifest", candidateManifest], {
      encoding: "utf8"
    })
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`)

    const manifest = JSON.parse(readFileSync(join(outputRoot, "manifest.json"), "utf8"))
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.frameDurationMs, 120)
    assert.equal(manifest.itemCount, 18)
    assert.equal(manifest.assetCount, 108)
    assert.equal(Object.keys(manifest.items).length, 18)
    assert.equal(manifest.items["bottom:coral_embellished_laceup_pants"].sourceMode, "candidate")
    assert.equal(existsSync(join(outputRoot, manifest.overview.file)), true)
    assert.match(manifest.overview.sha256, /^[a-f0-9]{64}$/)
    const evidenceHashes = new Set()

    for (const item of Object.values(manifest.items)) {
      assert.equal(Object.keys(item.sourceStates).length, 6)
      for (const evidence of Object.values(item.evidence)) {
        assert.equal(existsSync(join(outputRoot, evidence.file)), true, `${item.itemKey}: ${evidence.file}`)
        assert.match(evidence.sha256, /^[a-f0-9]{64}$/)
        assert.equal(evidenceHashes.has(evidence.sha256), false, `${item.itemKey}: duplicate evidence hash`)
        evidenceHashes.add(evidence.sha256)
      }
    }

    const checked = spawnSync(process.execPath, [producer, "--check", "--output-root", outputRoot, "--candidate-manifest", candidateManifest], {
      encoding: "utf8"
    })
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
