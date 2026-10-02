#!/usr/bin/env node
// Packs room avatar motion frames into sprite atlases so the iOS bundle stays
// under EAS Update's 1,000-asset limit (docs/quality/OTA_ASSET_BUDGET_2026-10-02.md).
//
// Input: the original 256x384 frame PNGs in assets/room/motion (they stay in
// the repo as the source of truth) and the motion asset modules that name them.
// A frame is packed when an asset module uses it and no published-item receipt
// binds its path; receipt-bound frames stay individual files so their hashes
// and resolvers never change.
//
// Output (deterministic for the same inputs):
//   src/features/avatarV2/assets/room/motion-atlas/*.png
//   src/features/avatarV2/room/roomAvatarMotionAtlas.json      (frame rects)
//   src/features/avatarV2/room/roomAvatarMotionAtlasSources.ts (static requires)
//
// Usage: node scripts/build-room-motion-atlases.mjs [--rewrite-requires]
//   --rewrite-requires  also replaces require(".../motion/<frame>.png") of
//                       packed frames in the asset modules with
//                       roomAvatarMotionAtlasFrame("<frame>").
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(mobileRoot, "../..")
const motionDirectory = join(mobileRoot, "src/features/avatarV2/assets/room/motion")
const atlasDirectory = join(mobileRoot, "src/features/avatarV2/assets/room/motion-atlas")
const manifestPath = join(mobileRoot, "src/features/avatarV2/room/roomAvatarMotionAtlas.json")
const sourcesPath = join(mobileRoot, "src/features/avatarV2/room/roomAvatarMotionAtlasSources.ts")
const releaseCatalogPath = join(repositoryRoot, "packages/domain/src/release/blumiR1ReleaseCatalog.json")

export const ROOM_MOTION_ASSET_MODULES = [
  "src/features/avatarV2/femaleSweetCapsuleRoomMotionAssets.ts",
  "src/features/avatarV2/room/avatarRoomMotionAssets.ts",
  "src/features/avatarV2/room/avatarRoomMaleCapsuleAssets.ts",
  "src/features/avatarV2/room/avatarRoomMalePremiumCapsuleAssets.ts"
]

const CANVAS_WIDTH = 256
const CANVAS_HEIGHT = 384
/** Transparent margin kept around each frame's opaque bounds (inside its crop). */
const PADDING = 4
/** Extra transparent space between crops in an atlas. */
const GUTTER = 2
/** Largest atlas side; keeps one decoded atlas at most 4 MB. */
const MAX_SIDE = 1024

const REQUIRE_PATTERN = /require\("(?:\.\.?\/)+(?:\.\.\/)*assets\/room\/motion\/([a-z0-9_]+)\.png"\)/g
const ATLAS_CALL_PATTERN = /roomAvatarMotionAtlasFrame\("([a-z0-9_]+)"\)/g

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function receiptBoundMotionFrames() {
  const catalog = JSON.parse(readFileSync(releaseCatalogPath, "utf8"))
  const prefix = relative(repositoryRoot, motionDirectory) + "/"
  const bound = new Set()
  for (const item of catalog.publishedItems) {
    for (const asset of item.receipt.assets) {
      if (asset.path.startsWith(prefix)) bound.add(asset.path.slice(prefix.length).replace(/\.png$/, ""))
    }
  }
  return bound
}

/** Frames the asset modules use, split into packed and individual files. */
export function planRoomMotionAtlasFrames() {
  const bound = receiptBoundMotionFrames()
  const used = new Set()
  for (const modulePath of ROOM_MOTION_ASSET_MODULES) {
    const source = readFileSync(join(mobileRoot, modulePath), "utf8")
    for (const match of source.matchAll(REQUIRE_PATTERN)) used.add(match[1])
    for (const match of source.matchAll(ATLAS_CALL_PATTERN)) used.add(match[1])
  }
  const packed = [...used].filter((name) => !bound.has(name)).sort()
  const individual = [...used].filter((name) => bound.has(name)).sort()
  return { packed, individual }
}

function familyOf(name) {
  const match = /^room_avatar_([a-z]+)_(?:.*?_)?(female|male)_/.exec(name)
  if (!match) throw new Error(`cannot tell the layer type and body of ${name}`)
  return `${match[2]}_${match[1]}`
}

async function readFrame(name) {
  const bytes = readFileSync(join(motionDirectory, `${name}.png`))
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== CANVAS_WIDTH || info.height !== CANVAS_HEIGHT || info.channels !== 4) {
    throw new Error(`${name} is ${info.width}x${info.height}x${info.channels}, expected ${CANVAS_WIDTH}x${CANVAS_HEIGHT}x4`)
  }
  let left = CANVAS_WIDTH
  let top = CANVAS_HEIGHT
  let right = -1
  let bottom = -1
  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      const offset = (y * CANVAS_WIDTH + x) * 4
      if (data[offset + 3] === 0) {
        // The crop drops these pixels, so they must be fully transparent.
        if (data[offset] || data[offset + 1] || data[offset + 2]) {
          throw new Error(`${name} has colour in a transparent pixel at ${x},${y}; it cannot be trimmed losslessly`)
        }
        continue
      }
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) {
    left = 0
    top = 0
    right = 0
    bottom = 0
  }
  const x = Math.max(0, left - PADDING)
  const y = Math.max(0, top - PADDING)
  const width = Math.min(CANVAS_WIDTH, right + 1 + PADDING) - x
  const height = Math.min(CANVAS_HEIGHT, bottom + 1 + PADDING) - y
  return { name, pixels: data, contentHash: sha256(data), x, y, width, height }
}

/** Shelf packing, tallest first; deterministic for the same frames. */
function pack(rects) {
  const ordered = [...rects].sort((a, b) =>
    b.height - a.height || b.width - a.width || a.key.localeCompare(b.key))
  const sheets = []
  let sheet
  let shelf
  for (const rect of ordered) {
    const width = rect.width + GUTTER
    const height = rect.height + GUTTER
    if (!sheet || !shelf) {
      sheet = { placements: [], shelves: [] }
      sheets.push(sheet)
    }
    if (shelf && shelf.cursor + width > MAX_SIDE) shelf = undefined
    if (!shelf) {
      const shelfTop = sheet.shelves.reduce((sum, item) => sum + item.height, 0)
      if (shelfTop + height > MAX_SIDE) {
        sheet = { placements: [], shelves: [] }
        sheets.push(sheet)
        shelf = { top: 0, height, cursor: 0 }
      } else {
        shelf = { top: shelfTop, height, cursor: 0 }
      }
      sheet.shelves.push(shelf)
    }
    sheet.placements.push({ rect, atlasX: shelf.cursor, atlasY: shelf.top })
    shelf.cursor += width
  }
  return sheets.map((item) => {
    const usedWidth = Math.max(...item.placements.map((placement) => placement.atlasX + placement.rect.width))
    const usedHeight = Math.max(...item.placements.map((placement) => placement.atlasY + placement.rect.height))
    return {
      placements: item.placements,
      width: Math.ceil(usedWidth / 4) * 4,
      height: Math.ceil(usedHeight / 4) * 4
    }
  })
}

async function build({ rewriteRequires }) {
  const { packed } = planRoomMotionAtlasFrames()
  const frames = []
  for (const name of packed) frames.push(await readFrame(name))

  const families = new Map()
  for (const frame of frames) {
    const family = familyOf(frame.name)
    const list = families.get(family) ?? []
    list.push(frame)
    families.set(family, list)
  }

  rmSync(atlasDirectory, { recursive: true, force: true })
  mkdirSync(atlasDirectory, { recursive: true })
  const atlases = []
  const manifestFrames = {}
  for (const family of [...families.keys()].sort()) {
    // Identical images share one crop.
    const unique = new Map()
    for (const frame of families.get(family)) {
      const key = `${frame.contentHash}:${frame.x},${frame.y},${frame.width},${frame.height}`
      if (!unique.has(key)) unique.set(key, { key, frame, width: frame.width, height: frame.height })
    }
    const sheets = pack([...unique.values()])
    for (const [sheetIndex, sheet] of sheets.entries()) {
      const file = `room_motion_atlas_${family}_${String(sheetIndex + 1).padStart(2, "0")}.png`
      const canvas = Buffer.alloc(sheet.width * sheet.height * 4)
      const placementByKey = new Map()
      for (const placement of sheet.placements) {
        const { frame } = placement.rect
        for (let row = 0; row < frame.height; row += 1) {
          const from = ((frame.y + row) * CANVAS_WIDTH + frame.x) * 4
          frame.pixels.copy(
            canvas,
            ((placement.atlasY + row) * sheet.width + placement.atlasX) * 4,
            from,
            from + frame.width * 4
          )
        }
        placementByKey.set(placement.rect.key, placement)
      }
      const bytes = await sharp(canvas, { raw: { width: sheet.width, height: sheet.height, channels: 4 } })
        .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
        .toBuffer()
      writeFileSync(join(atlasDirectory, file), bytes)
      const atlasIndex = atlases.length
      atlases.push({ file, width: sheet.width, height: sheet.height })
      for (const frame of families.get(family)) {
        const placement = placementByKey.get(`${frame.contentHash}:${frame.x},${frame.y},${frame.width},${frame.height}`)
        if (!placement) continue
        manifestFrames[frame.name] = {
          atlas: atlasIndex,
          atlasX: placement.atlasX,
          atlasY: placement.atlasY,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height
        }
      }
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedBy: "apps/mobile/scripts/build-room-motion-atlases.mjs",
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    sourceDirectory: relative(mobileRoot, motionDirectory),
    atlasDirectory: relative(mobileRoot, atlasDirectory),
    atlases,
    frames: Object.fromEntries(Object.keys(manifestFrames).sort().map((name) => [name, manifestFrames[name]]))
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")

  const requireLines = atlases
    .map((atlas) => `  require("../assets/room/motion-atlas/${atlas.file}")`)
    .join(",\n")
  writeFileSync(
    sourcesPath,
    "// Generated by scripts/build-room-motion-atlases.mjs. Do not edit.\n" +
      "// Index i is the image of atlases[i] in roomAvatarMotionAtlas.json.\n" +
      "import type { ImageSourcePropType } from \"react-native\"\n\n" +
      "export const ROOM_AVATAR_MOTION_ATLAS_SOURCES: readonly ImageSourcePropType[] = [\n" +
      requireLines +
      "\n]\n"
  )

  if (rewriteRequires) {
    const packedNames = new Set(packed)
    for (const modulePath of ROOM_MOTION_ASSET_MODULES) {
      const file = join(mobileRoot, modulePath)
      const source = readFileSync(file, "utf8")
      const next = source.replace(REQUIRE_PATTERN, (call, name) =>
        packedNames.has(name) ? `roomAvatarMotionAtlasFrame("${name}")` : call)
      if (next !== source) writeFileSync(file, next)
    }
  }

  const decodedBytes = atlases.reduce((sum, atlas) => sum + atlas.width * atlas.height * 4, 0)
  console.log(
    `${Object.keys(manifestFrames).length} frames -> ${atlases.length} atlases ` +
      `(largest ${Math.max(...atlases.map((atlas) => atlas.width))}x${Math.max(...atlases.map((atlas) => atlas.height))}, ` +
      `${(decodedBytes / 1024 / 1024).toFixed(1)} MB decoded in total)`
  )
  for (const atlas of atlases) console.log(`  ${atlas.file} ${atlas.width}x${atlas.height}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build({ rewriteRequires: process.argv.includes("--rewrite-requires") })
}
