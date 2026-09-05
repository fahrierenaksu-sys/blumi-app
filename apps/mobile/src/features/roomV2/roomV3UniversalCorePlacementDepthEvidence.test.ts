import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repositoryRoot = existsSync(path.resolve(process.cwd(), "docs/room-v3-qa"))
  ? process.cwd()
  : path.resolve(process.cwd(), "../..")

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && (request.endsWith(".png") || request.endsWith(".webp"))) {
    return path.resolve(repositoryRoot, "apps/mobile/src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCorePlacementDepthEvidenceManifest
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCorePlacementDepthEvidence") as typeof import("./roomV3UniversalCorePlacementDepthEvidence")

const staticRuntimeManifest = JSON.parse(
  readFileSync(
    path.resolve(
      repositoryRoot,
      "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_static_runtime_evidence_manifest.json"
    ),
    "utf8"
  )
)

test("builds deterministic placement and depth-lane evidence for all 45 SKUs", () => {
  const first = createRoomV3UniversalCorePlacementDepthEvidenceManifest(staticRuntimeManifest)
  const second = createRoomV3UniversalCorePlacementDepthEvidenceManifest(staticRuntimeManifest)

  assert.deepEqual(first, second)
  assert.equal(first.status, "evidence_only")
  assert.equal(first.promotionEligible, false)
  assert.equal(first.simulatorEvidenceIncluded, false)
  assert.equal(first.persistenceEvidenceIncluded, false)
  assert.equal(first.independentReviewIncluded, false)
  assert.equal(first.lockedShell.id, "room_v2_shell_blumi_world_v1")
  assert.equal(first.products.length, 45)
  assert.equal(new Set(first.products.map((row) => row.candidateId)).size, 45)
  assert.ok(first.products.every((row) => row.runtimeAssetPath.endsWith(".png")))
  assert.ok(first.products.every((row) =>
    row.evidence.simulatorEvidenceId === null &&
    row.evidence.persistenceEvidenceId === null &&
    row.evidence.independentReviewId === null
  ))
})

test("keeps floor, wall, ceiling, and tabletop placement semantics explicit", () => {
  const manifest = createRoomV3UniversalCorePlacementDepthEvidenceManifest(staticRuntimeManifest)

  assert.deepEqual(
    {
      floor: manifest.summary.floorLaneCount,
      wall: manifest.summary.wallRegionCount,
      ceiling: manifest.summary.ceilingRegionCount,
      tabletop: manifest.summary.tabletopSupportCount
    },
    { floor: 33, wall: 4, ceiling: 1, tabletop: 7 }
  )
  assert.ok(manifest.products.filter((row) => row.placementSurface === "tabletop").every((row) => row.support))
  assert.ok(manifest.products.filter((row) => row.placementSurface !== "tabletop").every((row) => !row.support))
  assert.ok(manifest.products.every((row) => row.validation.crossSkuCollisionChecked === false))
  assert.ok(manifest.products.every((row) => row.validation.simulatorVerified === false))
  assert.ok(manifest.gaps.includes("simulator_evidence_not_collected"))
  assert.ok(manifest.gaps.includes("persistence_evidence_not_collected"))
  assert.ok(manifest.gaps.includes("independent_review_not_collected"))
})

test("fails closed when the static runtime board is incomplete", () => {
  assert.throws(
    () => createRoomV3UniversalCorePlacementDepthEvidenceManifest({
      ...staticRuntimeManifest,
      products: staticRuntimeManifest.products.slice(1)
    }),
    /static_runtime_manifest_incomplete/
  )
})
