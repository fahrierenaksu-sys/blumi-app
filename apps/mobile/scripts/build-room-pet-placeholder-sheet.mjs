// Builds the room pet PLACEHOLDER sprite sheet: a plain neutral silhouette, so
// the pet renderer can be wired and tested before the approved pet art exists.
// It is not an item, has no item ID, shop entry or receipt, and is replaced by
// the art lane's sheet once the owner approves the look.
//
//   node apps/mobile/scripts/build-room-pet-placeholder-sheet.mjs
//
// Writes the PNG and the matching manifest (cell layout, clips, fps, loop).
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PNG_PATH = resolve(mobileRoot, "assets/roomPet/placeholder/room_pet_placeholder_sheet.png")
const MANIFEST_PATH = resolve(mobileRoot, "src/features/roomPet/placeholder/roomPetPlaceholderSheet.ts")

const CELL = 96
/** Feet touch the floor here inside a cell (px from the top). */
const FOOT_Y = 88
const COLUMNS = 8
const BODY = [154, 160, 166, 255]
const OUTLINE = [92, 98, 104, 255]
const EYE = [40, 44, 48, 255]

// clip -> frame count per heading, fps, loop, and a per-frame vertical offset (px)
const CLIPS = {
  idle: { frames: 4, fps: 6, loop: true, bob: [0, 1, 2, 1], shape: "stand" },
  walk: { frames: 4, fps: 10, loop: true, bob: [0, 2, 0, 2], shape: "walk" },
  sit: { frames: 2, fps: 4, loop: true, bob: [0, 1], shape: "sit" },
  sleep: { frames: 2, fps: 2, loop: true, bob: [0, 1], shape: "sleep" },
  happy: { frames: 4, fps: 10, loop: false, bob: [0, -6, -10, -4], shape: "stand" }
}
const HEADINGS = [45, 135]

function crc32(bytes) {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ])
}

function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
}

// The silhouette faces right; the renderer mirrors it for the left headings.
function shapeAt(x, y, shape, heading, frame, bob) {
  const ground = FOOT_Y + bob
  const isFront = heading === 135
  if (shape === "sleep") {
    const body = inEllipse(x, y, 48, ground - 12, 30, 12)
    const head = inEllipse(x, y, 68, ground - 14, 12, 10)
    return body || head ? (inEllipse(x, y, 48, ground - 12, 27, 9) || inEllipse(x, y, 68, ground - 14, 9, 7) ? "body" : "outline") : null
  }
  const sitting = shape === "sit"
  const bodyCx = 44
  const bodyCy = sitting ? ground - 22 : ground - 20
  const bodyRx = sitting ? 18 : 24
  const bodyRy = sitting ? 20 : 14
  const headCx = sitting ? 54 : 64
  const headCy = sitting ? ground - 46 : ground - 38
  const step = shape === "walk" ? (frame % 2 === 0 ? 3 : -3) : 0
  const legs = !sitting && [30 + step, 56 - step].some((legX) => x >= legX && x <= legX + 6 && y >= ground - 10 && y <= ground)
  const ears = [headCx - 8, headCx + 6].some((earX) => x >= earX && x <= earX + 6 && y >= headCy - 18 + Math.abs(x - earX - 3) * 2 && y <= headCy - 6)
  const tail = inEllipse(x, y, isFront ? 20 : 18, bodyCy - 12, 5, 12)
  const inner = inEllipse(x, y, bodyCx, bodyCy, bodyRx - 2, bodyRy - 2) || inEllipse(x, y, headCx, headCy, 12, 11)
  const outer = inEllipse(x, y, bodyCx, bodyCy, bodyRx, bodyRy) || inEllipse(x, y, headCx, headCy, 14, 13) || legs || ears || tail
  if (!outer) return null
  if (isFront && [headCx - 4, headCx + 6].some((eyeX) => inEllipse(x, y, eyeX, headCy - 1, 2, 2.5))) return "eye"
  return inner ? "body" : "outline"
}

function buildSheet() {
  const cells = []
  const clips = {}
  for (const [name, clip] of Object.entries(CLIPS)) {
    clips[name] = { fps: clip.fps, loop: clip.loop, frames: {} }
    for (const heading of HEADINGS) {
      clips[name].frames[heading] = []
      for (let frame = 0; frame < clip.frames; frame += 1) {
        clips[name].frames[heading].push(cells.length)
        cells.push({ shape: clip.shape, heading, frame, bob: clip.bob[frame] })
      }
    }
  }
  const rows = Math.ceil(cells.length / COLUMNS)
  const width = COLUMNS * CELL
  const height = rows * CELL
  const rgba = Buffer.alloc(width * height * 4)
  cells.forEach((cell, index) => {
    const originX = (index % COLUMNS) * CELL
    const originY = Math.floor(index / COLUMNS) * CELL
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const part = shapeAt(x, y, cell.shape, cell.heading, cell.frame, cell.bob)
        if (!part) continue
        const color = part === "eye" ? EYE : part === "body" ? BODY : OUTLINE
        const offset = ((originY + y) * width + originX + x) * 4
        rgba[offset] = color[0]
        rgba[offset + 1] = color[1]
        rgba[offset + 2] = color[2]
        rgba[offset + 3] = color[3]
      }
    }
  })
  return { png: encodePng(width, height, rgba), manifest: { cellWidth: CELL, cellHeight: CELL, columns: COLUMNS, rows, footAnchorY: FOOT_Y / CELL, clips } }
}

const { png, manifest } = buildSheet()
mkdirSync(dirname(PNG_PATH), { recursive: true })
mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
writeFileSync(PNG_PATH, png)
writeFileSync(
  MANIFEST_PATH,
  `// Generated by apps/mobile/scripts/build-room-pet-placeholder-sheet.mjs. Do not edit by hand.
// PLACEHOLDER art: a neutral silhouette for wiring the room pet renderer. Not an
// item: no item ID, shop entry or receipt. The approved pet sheet replaces it.
import type { RoomPetSpriteSheetLayout } from "../roomPetSprite"

export const ROOM_PET_PLACEHOLDER_SHEET_LAYOUT: RoomPetSpriteSheetLayout = ${JSON.stringify(manifest, null, 2).replace(/"(\d+)":/g, "$1:")}
`
)
console.log(`room pet placeholder: ${png.length} bytes, ${manifest.columns}x${manifest.rows} cells`)
