import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  getCanonicalUniversalCoreIds,
  REPOSITORY_ROOT
} from "./verify-room-v3-universal-core-assets.mjs"

export const DEFAULT_OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_per_sku_evidence_manifest.json"
)

const SEATING_CATEGORY_IDS = new Set([
  "dining_chair",
  "desk_chair",
  "lounge_armchair",
  "accent_chair",
  "loveseat",
  "long_sofa",
  "bench",
  "ottoman_pouf",
  "double_bed"
])

export async function writeUniversalCoreEvidenceManifest(
  outputPath = DEFAULT_OUTPUT_PATH
) {
  const ids = await getCanonicalUniversalCoreIds()
  const categoryByCandidateId = await getCategoryByCandidateId()
  const rows = ids.map((candidateId) => {
    const categoryId = categoryByCandidateId[candidateId] ?? "unknown"
    const requiredEvidenceIds = [
      "scaleSceneEvidenceId",
      "perspectiveEvidenceId",
      "depthLaneEvidenceId",
      "collisionEvidenceId",
      "persistenceEvidenceId",
      "simulatorEvidenceId",
      "independentReviewId",
      "simulatorScreenshotPathByRotation"
    ]
    if (SEATING_CATEGORY_IDS.has(categoryId)) requiredEvidenceIds.push("seatingEvidenceId")
    return {
      candidateId,
      categoryId,
      requiredEvidenceIds,
      evidence: Object.fromEntries(requiredEvidenceIds.map((key) => [key, null])),
      status: "missing"
    }
  })

  const manifest = {
    schemaVersion: 2,
    manifestVersion: "room-v3-universal-core-evidence-manifest-v3",
    status: "blocked_missing_runtime_evidence",
    promotionEligible: false,
    perspectiveProfile: "my-room-locked-2.5d-v1",
    artifactRegistry: "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json",
    buildIdentity: null,
    simulator: {
      device: null,
      viewport: null,
      orientation: "portrait",
      screenshotRoot: null
    },
    rowCount: rows.length,
    rows
  }
  const resolvedOutputPath = resolve(outputPath)
  await writeFile(resolvedOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return { outputPath: resolvedOutputPath, rowCount: rows.length, manifest }
}

async function getCategoryByCandidateId() {
  const inventoryPath = resolve(
    REPOSITORY_ROOT,
    "apps/mobile/src/features/roomV2/roomV3UniversalCoreInventory.ts"
  )
  const source = await readFile(inventoryPath, "utf8")
  const start = source.indexOf("ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID")
  const end = source.indexOf("}\n\nexport interface", start)
  if (start < 0 || end < 0) throw new Error("Universal Core category map is missing")
  return Object.fromEntries(
    [...source.slice(start, end).matchAll(/^\s+(universal_[a-z0-9_]+):\s+"([a-z0-9_]+)"/gm)]
      .map((match) => [match[1], match[2]])
  )
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const report = await writeUniversalCoreEvidenceManifest(process.argv[2] ?? DEFAULT_OUTPUT_PATH)
  process.stdout.write(JSON.stringify({ outputPath: report.outputPath, rowCount: report.rowCount }, null, 2) + "\n")
}
