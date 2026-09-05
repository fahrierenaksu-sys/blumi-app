import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && /\.(png|webp)$/.test(request)) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCoreQaRuntimeEvidenceManifest,
  resolveRoomV3UniversalCoreQaRuntimeScene
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaRuntimeEvidence") as typeof import("./roomV3UniversalCoreQaRuntimeEvidence")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_V2_FURNITURE_CATALOG } = require("./roomV2.mock") as typeof import("./roomV2.mock")
const {
  createRoomV3UniversalCoreQaArtifactRegistry,
  resolveRoomV2FurnitureCatalogForRuntime
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaCatalog") as typeof import("./roomV3UniversalCoreQaCatalog")

function createQaCatalog() {
  return resolveRoomV2FurnitureCatalogForRuntime({
    legacyCatalog: ROOM_V2_FURNITURE_CATALOG,
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })
}

test("current My Room runtime resolver and evidence manifest cover all 45 SKUs through the production validator", () => {
  const qaCatalog = createQaCatalog()
  assert.equal(qaCatalog.enabled, true)
  const manifest = createRoomV3UniversalCoreQaRuntimeEvidenceManifest(qaCatalog.catalog)

  assert.equal(manifest.status, "evidence_only")
  assert.equal(manifest.promotionEligible, false)
  assert.equal(manifest.products.length, 45)
  assert.equal(manifest.simulatorEvidenceIncluded, false)
  assert.equal(manifest.persistenceEvidenceIncluded, false)
  assert.equal(manifest.summary.productCount, 45)
  assert.equal(manifest.summary.placementValidCount, 45)
  assert.equal(manifest.summary.placementBlockedCount, 0)
  assert.ok(manifest.gaps.includes("simulator_evidence_not_collected"))
  assert.ok(manifest.gaps.includes("persistence_evidence_not_collected"))

  const cushion = manifest.products.find((row) => row.candidateId === "universal_cushion_set_a")
  assert.ok(cushion)
  assert.equal(cushion.status, "metadata_only_valid")
  assert.equal(cushion.placement.rotations[0]?.issueIds.length, 0)
  assert.equal(cushion.simulator.status, "not_collected")
  assert.equal(cushion.persistence.status, "not_collected")

  const loveseat = manifest.products.find((row) => row.candidateId === "universal_cloud_loveseat_a")
  assert.ok(loveseat)
  assert.equal(loveseat.seating.status, "metadata_only")
  assert.equal(loveseat.seating.liveResult, null)
  assert.equal(loveseat.placement.rotations.length, 4)
})

test("current My Room runtime resolver keeps the corrected floor-cushion candidate valid", () => {
  const qaCatalog = createQaCatalog()
  const cushion = qaCatalog.catalog.find((item) => item.id === "universal_cushion_set_a")
  assert.ok(cushion)

  const result = resolveRoomV3UniversalCoreQaRuntimeScene({
    item: cushion,
    rotation: "front",
    qaFurnitureCatalog: qaCatalog.catalog
  })

  assert.equal(result.isValid, true)
  assert.equal(result.issueIds.length, 0)
  assert.equal(result.validationSource, "validateRoomV2FurniturePlacement")
})
