import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const scriptPath = join(
  repositoryRoot,
  "apps/mobile/scripts/render-room-v3-phase7-furnished-layout-evidence.mjs"
)

test("furnished-layout evidence generator emits collision and seat debug coverage without self-promoting", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "blumi-phase7-furnished-"))
  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--output-dir", outputDir],
      { cwd: repositoryRoot, encoding: "utf8" }
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const manifestPath = join(outputDir, "phase7_furnished_layout_manifest.json")
    const boardPath = join(outputDir, "phase7_furnished_layout_collision_debug.png")
    const evidencePath = join(outputDir, "evidence.md")
    assert.ok(existsSync(manifestPath))
    assert.ok(existsSync(boardPath))
    assert.ok(existsSync(evidencePath))

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    assert.equal(manifest.status, "evidence_only_pending_simulator_and_independent_review")
    assert.equal(manifest.coverage.runtimeCandidateCount, 45)
    assert.deepEqual(
      manifest.scenarios.map((scenario) => scenario.id),
      ["seating_collision", "tabletop_support", "floor_collision"]
    )
    assert.ok(manifest.scenarios.every((scenario) => scenario.items.length > 0))
    assert.ok(manifest.scenarios[0].items.some((item) => item.seatDebug.length > 0))
    assert.ok(manifest.scenarios[1].items.some((item) => item.surfaceSupportDebug.length > 0))
    assert.ok(manifest.scenarios[2].items.some((item) => item.collisionDebug.blocksMovement))
    assert.match(readFileSync(evidencePath, "utf8"), /BLOCKED/)
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test("furnished-layout evidence generator fails closed for an untrusted artifact registry", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-phase7-untrusted-"))
  try {
    const artifactManifestPath = join(root, "untrusted.json")
    const outputDir = join(root, "output")
    writeFileSync(
      artifactManifestPath,
      JSON.stringify({ isTrusted: false, products: [] }),
      "utf8"
    )
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--output-dir",
        outputDir,
        "--artifact-manifest",
        artifactManifestPath
      ],
      { cwd: repositoryRoot, encoding: "utf8" }
    )

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /artifact registry is not trusted/i)
    assert.equal(existsSync(outputDir), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
