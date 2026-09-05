import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import sharp from "sharp"

export const BOARD_COLUMNS = 9
export const BOARD_ROWS = 6
export const REQUIRED_RIG_STATES = Object.freeze([
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
])

const EXPECTED_ITEM_COUNT = BOARD_COLUMNS * BOARD_ROWS
const CANDIDATE_PREFIX =
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates/"
const CELL_WIDTH = 300
const CELL_HEIGHT = 440
const IMAGE_WIDTH = 256
const IMAGE_HEIGHT = 384
const HEADER_HEIGHT = 56
const BOARD_WIDTH = BOARD_COLUMNS * CELL_WIDTH
const BOARD_HEIGHT = BOARD_ROWS * CELL_HEIGHT

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const candidateOnlyPath = (value) =>
  typeof value === "string" &&
  !isAbsolute(value) &&
  value.startsWith(CANDIDATE_PREFIX) &&
  !value.split("/").includes("..")

const resolveInsideRepository = (repositoryRoot, candidatePath) => {
  const absoluteRoot = resolve(repositoryRoot)
  const absoluteCandidate = resolve(absoluteRoot, candidatePath)
  const relation = relative(absoluteRoot, absoluteCandidate)
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`candidate escapes repository: ${candidatePath}`)
  }
  return absoluteCandidate
}

export const validateMaleWardrobeBoardManifest = (manifest, repositoryRoot) => {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.items)) {
    throw new Error("asset manifest must contain an items array")
  }
  if (manifest.items.length !== EXPECTED_ITEM_COUNT) {
    throw new Error(`board requires exactly ${EXPECTED_ITEM_COUNT} items`)
  }

  const slugs = manifest.items.map((item) => item?.slug)
  if (new Set(slugs).size !== EXPECTED_ITEM_COUNT || slugs.some((slug) => !slug)) {
    throw new Error(`board requires ${EXPECTED_ITEM_COUNT} unique slugs`)
  }

  const assetIds = manifest.items.map((item) => item?.assetId)
  if (new Set(assetIds).size !== EXPECTED_ITEM_COUNT || assetIds.some((id) => !id)) {
    throw new Error(`board requires ${EXPECTED_ITEM_COUNT} unique assetIds`)
  }

  const allCandidatePaths = []
  for (const item of manifest.items) {
    if (!item.category || !item.family) {
      throw new Error(`${item.slug} requires category and family labels`)
    }
    if (!candidateOnlyPath(item.candidateRoot)) {
      throw new Error(`${item.slug} candidateRoot must be a candidate-only path`)
    }
    if (!isPlainObject(item.candidatePaths)) {
      throw new Error(`${item.slug} requires candidatePaths for static and 4W+1S`)
    }
    if (item.independentReview?.status !== "PASS") {
      throw new Error(`${item.slug} requires independentReview PASS`)
    }
    if (!isPlainObject(item.rigStates)) {
      throw new Error(`${item.slug} requires rigStates PASS evidence`)
    }

    for (const state of REQUIRED_RIG_STATES) {
      const candidatePath = item.candidatePaths[state]
      if (!candidateOnlyPath(candidatePath)) {
        throw new Error(`${item.slug} ${state} must use a candidate-only path`)
      }
      if (!candidatePath.startsWith(`${item.candidateRoot}/`)) {
        throw new Error(`${item.slug} ${state} must stay inside candidateRoot`)
      }
      if (item.rigStates[state]?.status !== "PASS") {
        throw new Error(`${item.slug} requires ${state} PASS`)
      }

      const absoluteCandidate = resolveInsideRepository(repositoryRoot, candidatePath)
      if (!existsSync(absoluteCandidate)) {
        throw new Error(`${item.slug} missing candidate for ${state}: ${candidatePath}`)
      }
      allCandidatePaths.push(candidatePath)
    }
  }

  if (new Set(allCandidatePaths).size !== allCandidatePaths.length) {
    throw new Error("every item and rig state requires a unique candidate path")
  }

  return Object.freeze({
    rows: BOARD_ROWS,
    columns: BOARD_COLUMNS,
    itemCount: EXPECTED_ITEM_COUNT,
    inventoryOrder: Object.freeze([...slugs]),
  })
}

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const labelSvg = (item, ordinal) => Buffer.from(`
  <svg width="${CELL_WIDTH}" height="${HEADER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff8fb"/>
    <text x="12" y="19" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#2f2530">${ordinal}. ${escapeXml(item.slug)}</text>
    <text x="12" y="40" font-family="Arial, sans-serif" font-size="11" fill="#685d68">${escapeXml(item.category)} · ${escapeXml(item.family)}</text>
  </svg>
`)

const renderCell = async (item, ordinal, repositoryRoot) => {
  const staticPath = resolveInsideRepository(repositoryRoot, item.candidatePaths.static)
  const image = await sharp(staticPath)
    .ensureAlpha()
    .resize({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT, fit: "contain" })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      channels: 4,
      background: { r: 255, g: 248, b: 251, alpha: 1 },
    },
  })
    .composite([
      { input: labelSvg(item, ordinal), left: 0, top: 0 },
      { input: image, left: (CELL_WIDTH - IMAGE_WIDTH) / 2, top: HEADER_HEIGHT },
    ])
    .png()
    .toBuffer()
}

export const renderMaleWardrobeRedesignBoard = async ({
  manifestPath,
  outputPath,
  repositoryRoot,
}) => {
  if (!manifestPath || !outputPath || !repositoryRoot) {
    throw new Error("manifestPath, outputPath, and repositoryRoot are required")
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const validation = validateMaleWardrobeBoardManifest(manifest, repositoryRoot)
  const cells = await Promise.all(
    manifest.items.map((item, index) => renderCell(item, index + 1, repositoryRoot)),
  )
  const composites = cells.map((input, index) => ({
    input,
    left: (index % BOARD_COLUMNS) * CELL_WIDTH,
    top: Math.floor(index / BOARD_COLUMNS) * CELL_HEIGHT,
  }))

  mkdirSync(dirname(outputPath), { recursive: true })
  const temporaryOutput = `${outputPath}.tmp-${process.pid}.png`
  await sharp({
    create: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      channels: 4,
      background: { r: 255, g: 248, b: 251, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(temporaryOutput)
  renameSync(temporaryOutput, outputPath)

  return Object.freeze({
    ...validation,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    outputPath,
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (invokedPath === import.meta.url) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
  const manifestPath = resolve(
    repositoryRoot,
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/asset-manifest.json",
  )
  const outputPath = resolve(
    repositoryRoot,
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/male-wardrobe-54-master-board.png",
  )
  const result = await renderMaleWardrobeRedesignBoard({
    manifestPath,
    outputPath,
    repositoryRoot,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
