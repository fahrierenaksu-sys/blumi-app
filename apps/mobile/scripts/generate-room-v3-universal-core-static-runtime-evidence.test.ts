import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { writeRoomV3UniversalCoreStaticRuntimeEvidence } from "./generate-room-v3-universal-core-static-runtime-evidence"

test("writes a deterministic evidence-only 45-SKU board", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-universal-static-runtime-evidence-"))
  try {
    const firstPath = join(directory, "first.json")
    const secondPath = join(directory, "second.json")
    const repositoryRoot = existsSync(resolve(
      process.cwd(),
      "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"
    ))
      ? process.cwd()
      : resolve(process.cwd(), "../..")
    const registryPath = resolve(
      repositoryRoot,
      "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"
    )
    const first = await writeRoomV3UniversalCoreStaticRuntimeEvidence(firstPath, registryPath)
    const second = await writeRoomV3UniversalCoreStaticRuntimeEvidence(secondPath, registryPath)
    const firstJson = await readFile(firstPath, "utf8")
    const secondJson = await readFile(secondPath, "utf8")

    assert.equal(first.productCount, 45)
    assert.equal(first.status, "evidence_only")
    assert.equal(first.promotionEligible, false)
    assert.deepEqual(
      { ...second, outputPath: "<path>" },
      { ...first, outputPath: "<path>" }
    )
    assert.equal(firstJson, secondJson)

    const manifest = JSON.parse(firstJson)
    assert.equal(manifest.simulatorEvidenceIncluded, false)
    assert.equal(manifest.persistenceEvidenceIncluded, false)
    assert.equal(manifest.products.length, 45)
    assert.ok(manifest.products.every((product: { artifact: { directions: unknown[] } }) => product.artifact.directions.length >= 1))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
