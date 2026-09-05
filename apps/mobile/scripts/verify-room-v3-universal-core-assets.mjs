import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..")
export const CANDIDATE_ROOT = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/assets/runtime/candidates"
)
export const INVENTORY_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/roomV3UniversalCoreInventory.ts"
)

const DIRECTIONS = ["front", "back", "left", "right"]

// Only non-floor placement surfaces may ship as a single front view. Every
// floor item remains four-directional per the Room V3 production contract.
// Keep this list explicit so a missing side view cannot be mistaken for a
// harmless static decoration.
const FRONT_ONLY_CANDIDATE_IDS = new Set([
  "universal_table_lamp_a",
  "universal_wall_clock_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_arch_wall_mirror_a",
  "universal_wall_artwork_a",
  "universal_ceiling_light_a",
  "universal_curtain_set_a",
  "universal_decorative_object_set_a",
  "universal_cushion_set_a"
])

export async function getCanonicalUniversalCoreIds(
  inventoryPath = INVENTORY_PATH
) {
  const source = await readFile(inventoryPath, "utf8")
  const start = source.indexOf("ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID")
  const end = source.indexOf("}\n\nexport interface", start)
  if (start < 0 || end < 0) throw new Error("Universal Core category map is missing")

  const ids = [...source.slice(start, end).matchAll(/^\s+(universal_[a-z0-9_]+):/gm)]
    .map((match) => match[1])
    .filter((id) => id !== "universal_soft_media_console_a")

  if (ids.length !== 45) {
    throw new Error(`Expected 45 canonical Universal Core IDs, found ${ids.length}`)
  }
  return ids
}

export async function verifyUniversalCoreAssets({
  candidateRoot = CANDIDATE_ROOT,
  inventoryPath = INVENTORY_PATH
} = {}) {
  const ids = await getCanonicalUniversalCoreIds(inventoryPath)
  const products = []
  const issueIds = []

  for (const id of ids) {
    const product = await inspectProduct(id, candidateRoot)
    products.push(product)
    for (const issueId of product.issueIds) issueIds.push(`${id}:${issueId}`)
  }

  return {
    verifierVersion: "room-v3-universal-core-artifact-verifier-v1",
    verifiedAt: new Date().toISOString(),
    productCount: products.length,
    isTrusted: issueIds.length === 0,
    issueIds,
    products
  }
}

export async function writeUniversalCoreArtifactRegistry(
  outputPath,
  options = {}
) {
  const report = await verifyUniversalCoreAssets(options)
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

async function inspectProduct(id, candidateRoot) {
  const productRoot = resolve(candidateRoot, id)
  const filesByDirection = {}
  const issueIds = []

  for (const direction of DIRECTIONS) {
    const candidates = [
      resolve(productRoot, `${id}_${direction}_runtime_v2_normalized_v3.png`),
      resolve(productRoot, `${id}_${direction}_pilot_v1_normalized_v3.png`),
      resolve(productRoot, `${id}_${direction}_runtime_v2.png`),
      resolve(productRoot, `${id}_${direction}_runtime_v1.png`)
    ]
    const existing = await firstExisting(candidates)
    if (existing) filesByDirection[direction] = existing
  }

  const requiredDirections = FRONT_ONLY_CANDIDATE_IDS.has(id)
    ? ["front"]
    : DIRECTIONS
  for (const direction of requiredDirections) {
    if (!filesByDirection[direction]) issueIds.push(`missing_${direction}_asset`)
  }

  const assets = []
  for (const direction of requiredDirections) {
    const path = filesByDirection[direction]
    if (!path) continue
    const audit = await inspectAsset(path)
    assets.push({ direction, ...audit })
    issueIds.push(...audit.issueIds.map((issueId) => `${direction}_${issueId}`))
  }

  return {
    id,
    requiredDirections,
    assetCount: assets.length,
    issueIds,
    assets
  }
}

async function inspectAsset(path) {
  const [{ data, info }, file] = await Promise.all([
    sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    readFile(path)
  ])
  const alphaBounds = findAlphaBounds(data, info.width, info.height, info.channels)
  const cornerAlpha = [
    alphaAt(data, info, 0, 0),
    alphaAt(data, info, info.width - 1, 0),
    alphaAt(data, info, 0, info.height - 1),
    alphaAt(data, info, info.width - 1, info.height - 1)
  ]
  const transparentPixelCount = countPixels(data, info, (alpha) => alpha === 0)
  const partialAlphaPixelCount = countPixels(
    data,
    info,
    (alpha) => alpha > 0 && alpha < 255
  )
  const issueIds = []
  if (!alphaBounds) issueIds.push("missing_alpha_bounds")
  if (cornerAlpha.some((alpha) => alpha !== 0)) issueIds.push("opaque_corner")
  if (transparentPixelCount === 0) issueIds.push("no_transparent_pixels")
  if (info.width < 16 || info.height < 16) issueIds.push("invalid_dimensions")

  return {
    path: path.slice(REPOSITORY_ROOT.length + 1),
    sha256: createHash("sha256").update(file).digest("hex"),
    canvasSize: { width: info.width, height: info.height },
    alphaBounds,
    cornerAlpha,
    transparentPixelCount,
    partialAlphaPixelCount,
    issueIds
  }
}

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await readFile(path)
      return path
    } catch {
      // Try the next canonical versioned runtime file.
    }
  }
  return undefined
}

function alphaAt(data, info, x, y) {
  return data[(y * info.width + x) * info.channels + 3]
}

function countPixels(data, info, predicate) {
  let count = 0
  for (let index = 3; index < data.length; index += info.channels) {
    if (predicate(data[index])) count += 1
  }
  return count
}

function findAlphaBounds(data, width, height, channels) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3]
      if (alpha === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX >= minX && maxY >= minY
    ? { minX, minY, maxXInclusive: maxX, maxYInclusive: maxY }
    : undefined
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outputPath = process.argv[2]
  if (!outputPath) {
    throw new Error("Usage: node scripts/verify-room-v3-universal-core-assets.mjs <output-json>")
  }
  const report = await writeUniversalCoreArtifactRegistry(resolve(outputPath))
  process.stdout.write(JSON.stringify({
    outputPath,
    productCount: report.productCount,
    isTrusted: report.isTrusted,
    issueCount: report.issueIds.length
  }, null, 2) + "\n")
}
