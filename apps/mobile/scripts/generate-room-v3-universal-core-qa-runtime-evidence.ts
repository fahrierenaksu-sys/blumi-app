import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

declare const require: NodeRequire

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

const runtimeModule = require("../src/features/roomV2/roomV3UniversalCoreQaRuntimeEvidence") as typeof import("../src/features/roomV2/roomV3UniversalCoreQaRuntimeEvidence")
const { ROOM_V2_FURNITURE_CATALOG } = require("../src/features/roomV2/roomV2.mock") as typeof import("../src/features/roomV2/roomV2.mock")
const {
  createRoomV3UniversalCoreQaArtifactRegistry,
  resolveRoomV2FurnitureCatalogForRuntime
} = require("../src/features/roomV2/roomV3UniversalCoreQaCatalog") as typeof import("../src/features/roomV2/roomV3UniversalCoreQaCatalog")

const qaCatalog = resolveRoomV2FurnitureCatalogForRuntime({
  legacyCatalog: ROOM_V2_FURNITURE_CATALOG,
  isDevelopmentRuntime: true,
  buildProfile: "development",
  rawPreviewFlag: "1",
  artifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry()
})
if (!qaCatalog.enabled) throw new Error("qa_catalog_not_enabled")

const manifest = runtimeModule.createRoomV3UniversalCoreQaRuntimeEvidenceManifest(
  qaCatalog.catalog
)
const outputPath = resolve(
  import.meta.dirname,
  "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_qa_runtime_evidence.json"
)
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(`Wrote QA runtime evidence for ${manifest.products.length} products to ${outputPath}`)
