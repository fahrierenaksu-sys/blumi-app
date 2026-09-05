import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const REGISTRY_RELATIVE_PATH =
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"

function findRepositoryRoot(startDirectory: string): string {
  let currentDirectory = path.resolve(startDirectory)
  while (true) {
    if (
      existsSync(path.resolve(
        currentDirectory,
        "apps/mobile/src/features/roomV2/roomV3UniversalCoreStaticRuntimeEvidence.ts"
      )) &&
      existsSync(path.resolve(currentDirectory, REGISTRY_RELATIVE_PATH))
    ) {
      return currentDirectory
    }

    const parentDirectory = path.dirname(currentDirectory)
    if (parentDirectory === currentDirectory) {
      throw new Error("blumiv2_repository_root_not_found")
    }
    currentDirectory = parentDirectory
  }
}

const repositoryRoot = findRepositoryRoot(process.cwd())

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
    return path.resolve(
      repositoryRoot,
      "apps/mobile/src/features/roomV2",
      request.slice(2)
    )
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCoreStaticRuntimeEvidenceManifest
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreStaticRuntimeEvidence") as typeof import("./roomV3UniversalCoreStaticRuntimeEvidence")
const {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  ROOM_V3_FURNITURE_CATEGORIES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3ProductionPlan") as typeof import("./roomV3ProductionPlan")

const registry = JSON.parse(
  readFileSync(
    path.resolve(repositoryRoot, REGISTRY_RELATIVE_PATH),
    "utf8"
  )
)

test("builds deterministic 45-SKU static runtime evidence without live proof", () => {
  const first = createRoomV3UniversalCoreStaticRuntimeEvidenceManifest(registry)
  const second = createRoomV3UniversalCoreStaticRuntimeEvidenceManifest(registry)

  assert.deepEqual(first, second)
  assert.equal(first.products.length, 45)
  assert.deepEqual(
    first.products.map((product) => product.candidateId),
    [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS]
  )
  assert.equal(first.status, "evidence_only")
  assert.equal(first.promotionEligible, false)
  assert.equal(first.simulatorEvidenceIncluded, false)
  assert.equal(first.persistenceEvidenceIncluded, false)
  assert.equal(first.independentReviewIncluded, false)
  assert.equal(first.summary.productCount, 45)
})

test("reports trusted artifact hashes, planned surfaces, rotation coverage and collision metadata", () => {
  const manifest = createRoomV3UniversalCoreStaticRuntimeEvidenceManifest(registry)
  const productsById = new Map<string, { id: string; assets: { direction: string; sha256: string }[] }>(
    registry.products.map((product: { id: string; assets: { direction: string; sha256: string }[] }) => [product.id, product])
  )
  const categoriesById = new Map(ROOM_V3_FURNITURE_CATEGORIES.map((category) => [category.id, category]))

  for (const row of manifest.products) {
    const artifactProduct = productsById.get(row.candidateId)!
    const category = categoriesById.get(row.categoryId)!
    assert.equal(row.artifact.verifierVersion, registry.verifierVersion)
    assert.equal(row.artifact.registryPath.endsWith("universal_core_artifact_registry.json"), true)
    assert.deepEqual(
      row.artifact.directions.map((asset) => [asset.direction, asset.sha256]),
      artifactProduct.assets.map((asset: { direction: string; sha256: string }) => [asset.direction, asset.sha256])
    )
    assert.equal(row.placementSurface, category.placementSurface)
    assert.equal(row.interactionType, category.interactionType)
    assert.equal(row.placementRule, category.placementRule)
    assert.equal(row.collisionFootprint.source,
      row.collisionFootprint.status === "reported" ? "runtime_factory_static_metadata" : "none")
    assert.equal(row.evidence.simulatorEvidenceId, null)
    assert.equal(row.evidence.persistenceEvidenceId, null)
    assert.equal(row.evidence.independentReviewId, null)
  }

  assert.equal(
    manifest.summary.directionalRotationCount,
    manifest.products.filter((row) => row.rotationCoverage.status === "complete").length
  )
  assert.equal(
    manifest.summary.frontOnlyRotationCount,
    manifest.products.filter((row) => row.rotationCoverage.status === "front_only_expected").length
  )
  assert.equal(
    manifest.summary.collisionFootprintReportedCount,
    manifest.products.filter((row) => row.collisionFootprint.status === "reported").length
  )
  assert.equal(
    manifest.summary.collisionFootprintMissingCount,
    manifest.products.filter((row) => row.collisionFootprint.status === "missing_runtime_metadata").length
  )
  assert.equal(manifest.summary.plannedSeatRouteCount, 9)
  assert.equal(
    manifest.summary.plannedSeatRouteMetadataCount,
    manifest.products.filter((row) => row.seatRoute !== null).length
  )
  assert.equal(manifest.summary.runtimeSeatRouteNotPlannedCount, 0)
  const softCushion = manifest.products.find(
    (row) => row.candidateId === "universal_soft_floor_cushion_a"
  )!
  assert.equal(softCushion.seatRoute, null)
  assert.equal(softCushion.runtimeSeatRoute, null)
  assert.equal(
    manifest.gaps.some((gap) => gap.startsWith("collision_footprint_missing:")),
    false
  )
  assert.equal(
    manifest.gaps.includes("runtime_seat_route_not_planned:universal_soft_floor_cushion_a"),
    false
  )
})

test("fails closed for an untrusted or incomplete artifact registry", () => {
  assert.throws(
    () => createRoomV3UniversalCoreStaticRuntimeEvidenceManifest({ ...registry, isTrusted: false }),
    /artifact_registry_not_trusted/
  )
  assert.throws(
    () => createRoomV3UniversalCoreStaticRuntimeEvidenceManifest({ ...registry, productCount: 44 }),
    /artifact_registry_incomplete/
  )
  assert.throws(
    () => createRoomV3UniversalCoreStaticRuntimeEvidenceManifest({ ...registry, verifierVersion: "untrusted-verifier" }),
    /artifact_registry_has_issues/
  )
})
