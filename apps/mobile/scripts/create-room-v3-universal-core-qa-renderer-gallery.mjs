import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import sharp from "sharp"

const [manifestPathArg, outputPathArg] = process.argv.slice(2)
if (!manifestPathArg || !outputPathArg) {
  throw new Error("Usage: node create-room-v3-universal-core-qa-renderer-gallery.mjs <manifest.json> <output.png>")
}

const manifestPath = path.resolve(manifestPathArg)
const outputPath = path.resolve(outputPathArg)
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const repositoryRoot = findRepositoryRoot(manifestPath)
await validateManifest(manifest, manifestPath, repositoryRoot)

const columns = 5
const cellWidth = 192
const cellHeight = 410
const gap = 12
const rows = Math.ceil(manifest.rows.length / columns)
const canvasWidth = columns * cellWidth + (columns + 1) * gap
const canvasHeight = rows * cellHeight + (rows + 1) * gap
const composites = []

for (const [index, row] of manifest.rows.entries()) {
  const x = gap + (index % columns) * (cellWidth + gap)
  const y = gap + Math.floor(index / columns) * (cellHeight + gap)
  const image = await sharp(path.resolve(repositoryRoot, row.path))
    .resize(cellWidth, cellHeight, { fit: "cover" })
    .png()
    .toBuffer()
  const label = Buffer.from(`<svg width="${cellWidth}" height="36" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#140e16" fill-opacity="0.88"/><text x="10" y="15" fill="#ffe9f4" font-size="11" font-family="-apple-system,Arial,sans-serif">${index + 1}. ${escapeXml(row.candidateId)}</text><text x="10" y="29" fill="#ffb6d5" font-size="9" font-family="-apple-system,Arial,sans-serif">RoomRenderer2D · front</text></svg>`)
  composites.push({ input: image, left: x, top: y })
  composites.push({ input: label, left: x, top: y + cellHeight - 36 })
}

await sharp({
  create: {
    width: canvasWidth,
    height: canvasHeight,
    channels: 4,
    background: "#140e16"
  }
})
  .composite(composites)
  .png()
  .toFile(outputPath)

console.log(JSON.stringify({ outputPath, count: manifest.rows.length, width: canvasWidth, height: canvasHeight }))

async function validateManifest(manifest, sourcePath, repositoryRoot) {
  if (manifest.status !== "renderer_gallery_only" || manifest.captureCount !== 45) {
    throw new Error("Expected a complete 45-row renderer_gallery_only manifest")
  }
  if (manifest.promotionEligible !== false) {
    throw new Error("Renderer gallery evidence must remain promotion-ineligible")
  }
  if (manifest.lockedShellId !== "room_v2_shell_blumi_world_v1") {
    throw new Error("Renderer gallery must use the locked Room V2 shell")
  }
  if (manifest.viewport?.orientation !== "portrait" || manifest.viewport?.logicalWidth !== 390 || manifest.viewport?.logicalHeight !== 844) {
    throw new Error("Renderer gallery must target the iPhone 17 portrait viewport")
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== 45) {
    throw new Error("Renderer gallery must contain exactly 45 rows")
  }

  const source = await requireCanonicalCandidateIds(repositoryRoot)
  const seen = new Set()
  const seenHashes = new Map()
  for (const [index, row] of manifest.rows.entries()) {
    if (!row || typeof row !== "object") throw new Error(`Invalid renderer row at index ${index}`)
    if (source[index] !== row.candidateId) {
      throw new Error(`Renderer row ${index + 1} must be canonical candidate ${source[index]}`)
    }
    if (seen.has(row.candidateId)) throw new Error(`Duplicate renderer candidate ${row.candidateId}`)
    seen.add(row.candidateId)
    if (row.renderer !== "RoomRenderer2D" || row.rotation !== "front" || row.status !== "renderer_gallery_only") {
      throw new Error(`Renderer row ${row.candidateId} has invalid renderer metadata`)
    }
    if (typeof row.path !== "string" || path.isAbsolute(row.path) || row.path.includes("..")) {
      throw new Error(`Renderer row ${row.candidateId} must use a repo-relative path`)
    }
    const resolvedPath = path.resolve(repositoryRoot, row.path)
    if (!resolvedPath.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`Renderer row ${row.candidateId} escapes the repository root`)
    }
    const bytes = await readFile(resolvedPath)
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`Renderer row ${row.candidateId} must reference a PNG file`)
    }
    const hash = createHash("sha256").update(bytes).digest("hex")
    const duplicateCandidateId = seenHashes.get(hash)
    if (duplicateCandidateId) {
      throw new Error(`Duplicate renderer image hash for ${row.candidateId}; already used by ${duplicateCandidateId}`)
    }
    seenHashes.set(hash, row.candidateId)
  }
}

function requireCanonicalCandidateIds(repositoryRoot) {
  const candidateSourcePath = path.resolve(repositoryRoot, "apps/mobile/src/features/roomV2/roomV3UniversalCoreCandidateIds.ts")
  return readFile(candidateSourcePath, "utf8").then((source) => {
    const ids = [...source.matchAll(/"(universal_[a-z0-9_]+)"/g)].map((match) => match[1])
    if (ids.length !== 45) throw new Error(`Canonical candidate source must contain 45 IDs; found ${ids.length}`)
    return ids
  })
}

function findRepositoryRoot(sourcePath) {
  let current = path.dirname(sourcePath)
  while (current !== path.dirname(current)) {
    if (current.endsWith(`${path.sep}blumiv2`) && path.basename(current) === "blumiv2") return current
    current = path.dirname(current)
  }
  throw new Error(`Unable to locate repository root for ${sourcePath}`)
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  }[character]))
}
