import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const DEFAULT_ARTIFACT_REGISTRY_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"
)
const DEFAULT_OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_static_runtime_evidence_manifest.json"
)

// The runtime factory imports PNGs as modules. This is the same deterministic
// loader used by its focused tests; it does not alter any runtime source file.
require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
    return resolve(REPOSITORY_ROOT, "apps/mobile/src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCoreStaticRuntimeEvidenceManifest
} = require("../src/features/roomV2/roomV3UniversalCoreStaticRuntimeEvidence") as typeof import("../src/features/roomV2/roomV3UniversalCoreStaticRuntimeEvidence")

export async function writeRoomV3UniversalCoreStaticRuntimeEvidence(
  outputPath = DEFAULT_OUTPUT_PATH,
  artifactRegistryPath = DEFAULT_ARTIFACT_REGISTRY_PATH
) {
  const registry = JSON.parse(
    await readFile(resolve(artifactRegistryPath), "utf8")
  )
  const manifest = createRoomV3UniversalCoreStaticRuntimeEvidenceManifest(registry)
  const resolvedOutputPath = resolve(outputPath)
  await writeFile(resolvedOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return {
    outputPath: resolvedOutputPath,
    productCount: manifest.products.length,
    status: manifest.status,
    promotionEligible: manifest.promotionEligible
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUTPUT_PATH
  const artifactRegistryPath = process.argv[3]
    ? resolve(process.argv[3])
    : DEFAULT_ARTIFACT_REGISTRY_PATH
  void writeRoomV3UniversalCoreStaticRuntimeEvidence(outputPath, artifactRegistryPath)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
