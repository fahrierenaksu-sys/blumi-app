import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

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
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  resolveRoomV3UniversalCoreQaInteractionCatalog,
  resolveRoomV2FurnitureCatalogForRuntime,
  createRoomV3UniversalCoreQaArtifactRegistry,
  resolveRoomV2DecorCommitModeForRuntime
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaCatalog") as typeof import("./roomV3UniversalCoreQaCatalog")
const {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")

test("Universal Core QA interaction catalog is isolated and unlocked only behind the explicit dev gate", () => {
  const disabled = resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: false,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })
  assert.equal(disabled.enabled, false)
  assert.deepEqual(disabled.catalog, [])
  assert.deepEqual(disabled.ownedItemIds, [])

  const enabled = resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.catalog.length, 45)
  assert.deepEqual(enabled.ownedItemIds, [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS])
  assert.ok(enabled.catalog.every((item) => (
    item.sourceStatus === "candidate" &&
    item.qaStatus === "blocked" &&
    item.locked === false &&
    item.ownedByDefault === true
  )))
  assert.ok(enabled.catalog.every((item) => !item.id.startsWith("room_v2_")))
})

test("Universal Core QA does not inherit the shell draft-preview flag", () => {
  const result = resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: undefined,
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })
  assert.equal(result.enabled, false)
  assert.deepEqual(result.catalog, [])
  assert.deepEqual(result.ownedItemIds, [])
})

test("Universal Core QA accepts the isolated native UI test profile with an explicit flag", () => {
  const result = resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })

  assert.equal(result.enabled, true)
  assert.equal(result.catalog.length, 45)
  assert.deepEqual(result.ownedItemIds, [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS])
})

test("Universal Core QA interaction catalog fails closed on a mutated trusted registry", () => {
  const registry = {
    ...createRoomV3UniversalCoreQaArtifactRegistry(),
    verifiedCandidateIds: createRoomV3UniversalCoreQaArtifactRegistry()
      .verifiedCandidateIds.slice(1)
  }
  const result = resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: registry
  })
  assert.equal(result.enabled, false)
  assert.deepEqual(result.catalog, [])
  assert.deepEqual(result.ownedItemIds, [])
})

test("Universal Core QA interaction catalog returns fresh item copies", () => {
  const input = {
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  }
  const first = resolveRoomV3UniversalCoreQaInteractionCatalog(input)
  const second = resolveRoomV3UniversalCoreQaInteractionCatalog(input)
  assert.notEqual(first.catalog[0], second.catalog[0])
  first.catalog[0]!.name = "mutated QA item"
  assert.notEqual(first.catalog[0]!.name, second.catalog[0]!.name)
})

test("runtime catalog keeps legacy furniture when the QA gate is disabled", () => {
  const legacyCatalog = [{
    id: "room_v2_legacy_probe",
    name: "Legacy probe"
  }] as never[]
  const result = resolveRoomV2FurnitureCatalogForRuntime({
    legacyCatalog,
    isDevelopmentRuntime: false,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
  })
  assert.equal(result.enabled, false)
  assert.deepEqual(result.catalog.map((item) => item.id), ["room_v2_legacy_probe"])
})

test("QA preview decor persists only through the isolated QA namespace contract", () => {
  assert.equal(
    resolveRoomV2DecorCommitModeForRuntime({
      qaCatalogEnabled: false
    }),
    "persist_to_provider"
  )
  assert.equal(
    resolveRoomV2DecorCommitModeForRuntime({
      qaCatalogEnabled: true
    }),
    "persist_to_qa_namespace"
  )
})
