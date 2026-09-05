#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIRECTORY = resolve(fileURLToPath(new URL(".", import.meta.url)))
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..")
const SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"
)
const OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/roomV3UniversalCoreArtifactRegistry.ts"
)

export async function generateUniversalCoreArtifactRegistry(
  sourcePath = SOURCE_PATH,
  outputPath = OUTPUT_PATH
) {
  const report = JSON.parse(await readFile(resolve(sourcePath), "utf8"))
  if (
    report?.isTrusted !== true ||
    report.productCount !== 45 ||
    !Array.isArray(report.products) ||
    report.products.length !== 45 ||
    report.issueIds?.length
  ) {
    throw new Error("artifact_registry_not_trusted")
  }

  const hashes = Object.fromEntries(
    report.products.map((product) => [
      product.id,
      Object.fromEntries(product.assets.map((asset) => [asset.direction, asset.sha256]))
    ])
  )
  const sourceDigest = report.products
    .flatMap((product) => product.assets.map((asset) => `${product.id}:${asset.direction}:${asset.sha256}`))
    .join("|")

  const source = `// Generated from ${sourcePath.replaceAll("\\", "/")}; do not edit by hand.\n` +
    `export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID = "room-v3-universal-core-artifact-manifest-2026-07-18" as const\n` +
    `export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION = ${JSON.stringify(report.verifierVersion)} as const\n` +
    `export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_SOURCE_DIGEST = ${JSON.stringify(sourceDigest)} as const\n` +
    `export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID = ${JSON.stringify(hashes, null, 2)} as const\n`

  await writeFile(resolve(outputPath), source, "utf8")
  return { outputPath: resolve(outputPath), productCount: report.products.length }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await generateUniversalCoreArtifactRegistry(
    process.argv[2] ?? SOURCE_PATH,
    process.argv[3] ?? OUTPUT_PATH
  )
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
