import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { writeRoomV3UniversalCorePlacementDepthEvidence } from "./generate-room-v3-universal-core-placement-depth-evidence"

const repositoryRoot = existsSync(resolve(process.cwd(), "docs/room-v3-qa"))
  ? process.cwd()
  : resolve(process.cwd(), "../..")
const staticRuntimeManifestPath = resolve(
  repositoryRoot,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_static_runtime_evidence_manifest.json"
)

test("writes deterministic placement JSON and a 45-panel contact sheet", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-universal-placement-depth-evidence-"))
  try {
    const firstJsonPath = join(directory, "first.json")
    const firstSheetPath = join(directory, "first.png")
    const secondJsonPath = join(directory, "second.json")
    const secondSheetPath = join(directory, "second.png")
    const first = await writeRoomV3UniversalCorePlacementDepthEvidence(
      firstJsonPath,
      firstSheetPath,
      staticRuntimeManifestPath
    )
    const second = await writeRoomV3UniversalCorePlacementDepthEvidence(
      secondJsonPath,
      secondSheetPath,
      staticRuntimeManifestPath
    )
    const firstJson = await readFile(firstJsonPath, "utf8")
    const secondJson = await readFile(secondJsonPath, "utf8")
    const firstSheet = await readFile(firstSheetPath)
    const secondSheet = await readFile(secondSheetPath)

    assert.equal(first.productCount, 45)
    assert.equal(first.status, "evidence_only")
    assert.equal(first.promotionEligible, false)
    assert.equal(first.metadataOnlyBlockedCount, 1)
    assert.deepEqual(
      { ...first, outputPath: "<path>", contactSheetPath: "<path>" },
      { ...second, outputPath: "<path>", contactSheetPath: "<path>" }
    )
    assert.equal(firstJson, secondJson)
    assert.deepEqual(firstSheet, secondSheet)
    assert.ok(firstSheet.byteLength > 100_000)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
