import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

import {
  CANDIDATE_ROOT,
  REPOSITORY_ROOT,
  getCanonicalUniversalCoreIds
} from "./verify-room-v3-universal-core-assets.mjs"

export const UNIVERSAL_CORE_THUMBNAIL_SIZE = 180
export const UNIVERSAL_CORE_THUMBNAIL_MANIFEST_VERSION =
  "room-v3-universal-core-thumbnail-manifest-v1"

const FRONT_ONLY_FALLBACKS = ["runtime_v2", "runtime_v1", "pilot_v1"]

export async function generateUniversalCoreThumbnails({
  outputRoot = resolve(
    REPOSITORY_ROOT,
    "apps/mobile/src/features/roomV2/assets/catalog/universal-core"
  ),
  candidateRoot = CANDIDATE_ROOT,
  inventoryPath,
  thumbnailSize = UNIVERSAL_CORE_THUMBNAIL_SIZE
} = {}) {
  if (!Number.isInteger(thumbnailSize) || thumbnailSize < 64 || thumbnailSize > 512) {
    throw new Error("thumbnailSize must be an integer between 64 and 512")
  }

  const resolvedOutputRoot = resolve(outputRoot)
  await mkdir(resolvedOutputRoot, { recursive: true })
  const ids = await getCanonicalUniversalCoreIds(inventoryPath)
  const categoryByCandidateId = await getCanonicalCategoryByCandidateId(inventoryPath)
  const issueIds = []
  const products = []

  for (const id of ids) {
    const sourcePath = await findFrontAsset(resolve(candidateRoot, id), id)
    if (!sourcePath) {
      issueIds.push(`${id}:missing_front_runtime_asset`)
      continue
    }

    const outputPath = resolve(resolvedOutputRoot, `${id}.png`)
    const sourceBytes = await readFile(sourcePath)
    const sourceMetadata = await sharp(sourceBytes).metadata()
    if (!sourceMetadata.hasAlpha) issueIds.push(`${id}:source_missing_alpha`)

    await sharp(sourceBytes)
      .ensureAlpha()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .resize({
        width: thumbnailSize,
        height: thumbnailSize,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: "lanczos3"
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath)

    const thumbnailMetadata = await sharp(outputPath).metadata()
    if (
      thumbnailMetadata.width !== thumbnailSize ||
      thumbnailMetadata.height !== thumbnailSize ||
      thumbnailMetadata.hasAlpha !== true
    ) {
      issueIds.push(`${id}:invalid_thumbnail_output`)
    }

    const categoryId = categoryByCandidateId[id]
    if (!categoryId) issueIds.push(`${id}:missing_category_mapping`)
    products.push({
      id,
      thumbnailKey: `room_v3_thumbnail_universal_core_${categoryId ?? id}_a`,
      path: displayPath(outputPath),
      outputPath,
      sourcePath: displayPath(sourcePath),
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      width: thumbnailSize,
      height: thumbnailSize,
      hasAlpha: thumbnailMetadata.hasAlpha === true,
      status: "candidate_pending_runtime_promotion"
    })
  }

  const manifestPath = resolve(resolvedOutputRoot, "manifest.json")
  const manifest = {
    manifestVersion: UNIVERSAL_CORE_THUMBNAIL_MANIFEST_VERSION,
    productCount: ids.length,
    thumbnailCount: products.length,
    thumbnailSize,
    runtimeReady: false,
    promotionVerdict: "BLOCKED",
    issueIds,
    products: products.map(({ outputPath, ...product }) => product)
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  return {
    manifestPath,
    outputRoot: resolvedOutputRoot,
    productCount: ids.length,
    thumbnailCount: products.length,
    thumbnailSize,
    issueIds,
    products
  }
}

async function getCanonicalCategoryByCandidateId(inventoryPath) {
  const source = await readFile(
    inventoryPath ?? resolve(REPOSITORY_ROOT, "apps/mobile/src/features/roomV2/roomV3UniversalCoreInventory.ts"),
    "utf8"
  )
  const start = source.indexOf("ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID")
  const end = source.indexOf("}\n\nexport interface", start)
  if (start < 0 || end < 0) throw new Error("Universal Core category map is missing")

  return Object.fromEntries(
    [...source.slice(start, end).matchAll(/^\s+(universal_[a-z0-9_]+):\s+"([a-z0-9_]+)"/gm)]
      .map((match) => [match[1], match[2]])
  )
}

async function findFrontAsset(productRoot, id) {
  for (const version of FRONT_ONLY_FALLBACKS) {
    const path = resolve(productRoot, `${id}_front_${version}.png`)
    try {
      await readFile(path)
      return path
    } catch {
      // Keep searching the canonical runtime fallbacks.
    }
  }
  return undefined
}

function displayPath(path) {
  const relativePath = relative(REPOSITORY_ROOT, path)
  return relativePath && !relativePath.startsWith("..") ? relativePath : path
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outputRoot = process.argv[2]
  if (!outputRoot) {
    throw new Error("Usage: node scripts/generate-room-v3-universal-thumbnails.mjs <output-root>")
  }
  const report = await generateUniversalCoreThumbnails({ outputRoot })
  process.stdout.write(JSON.stringify({
    manifestPath: report.manifestPath,
    productCount: report.productCount,
    thumbnailCount: report.thumbnailCount,
    issueCount: report.issueIds.length
  }, null, 2) + "\n")
}
