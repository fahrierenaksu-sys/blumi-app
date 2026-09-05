import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const SOURCE = path.resolve(
  "src/features/session/assets/onboarding-runners-v11-remodeled-source/blumi_intro_run_male_v11_sheet.png"
)
const OUTPUT_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v11-remodeled-runtime"
)
const COLS = 3
const ROWS = 2
const CANVAS_WIDTH = 256
const CANVAS_HEIGHT = 384
const TARGET_VISIBLE_HEIGHT = 258
const TARGET_CENTER_X = 130
const TARGET_BOTTOM = 360

function isConnectedBackground(r, g, b) {
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  return minimum >= 215 && maximum - minimum <= 14
}

function removeConnectedCheckerboard(data, width, height) {
  const visited = new Uint8Array(width * height)
  const queue = []
  const enqueue = (x, y) => {
    const index = y * width + x
    if (visited[index]) return
    const pixel = index * 4
    if (!isConnectedBackground(data[pixel], data[pixel + 1], data[pixel + 2])) return
    visited[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) enqueue(x - 1, y)
    if (x + 1 < width) enqueue(x + 1, y)
    if (y > 0) enqueue(x, y - 1)
    if (y + 1 < height) enqueue(x, y + 1)
  }

  for (const index of queue) data[index * 4 + 3] = 0
  return data
}

async function visibleBounds(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("No visible character pixels")
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

const { data: sourceData, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
removeConnectedCheckerboard(sourceData, info.width, info.height)
const transparentSheet = await sharp(sourceData, { raw: info }).png().toBuffer()
await mkdir(OUTPUT_ROOT, { recursive: true })

const xEdges = Array.from({ length: COLS + 1 }, (_, index) =>
  Math.round((info.width * index) / COLS)
)
const yEdges = Array.from({ length: ROWS + 1 }, (_, index) =>
  Math.round((info.height * index) / ROWS)
)
const frames = []

for (let frame = 0; frame < COLS * ROWS; frame += 1) {
  const col = frame % COLS
  const row = Math.floor(frame / COLS)
  const cell = await sharp(transparentSheet)
    .extract({
      left: xEdges[col],
      top: yEdges[row],
      width: xEdges[col + 1] - xEdges[col],
      height: yEdges[row + 1] - yEdges[row]
    })
    .png()
    .toBuffer()
  const bounds = await visibleBounds(cell)
  const targetWidth = Math.round(bounds.width * (TARGET_VISIBLE_HEIGHT / bounds.height))
  const character = await sharp(cell)
    .extract({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height })
    .resize(targetWidth, TARGET_VISIBLE_HEIGHT, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
  const file = `blumi_intro_run_male_f${String(frame + 1).padStart(2, "0")}.png`
  const output = path.join(OUTPUT_ROOT, file)
  await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: character,
      left: Math.round(TARGET_CENTER_X - targetWidth / 2),
      top: TARGET_BOTTOM - TARGET_VISIBLE_HEIGHT + 1
    }])
    .png()
    .toFile(output)
  frames.push({
    frame: frame + 1,
    file,
    sha256: createHash("sha256").update(await readFile(output)).digest("hex")
  })
}

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify({
    version: "v11-remodeled",
    identity_reference: "male-v3-candidate-f01",
    motion_reference: "female-v3-runtime-six-pose-cycle",
    frame_count: 6,
    runtime_ticks: 12,
    frame_duration_ms: 60,
    loop_duration_ms: 720,
    normalized_visible_height: TARGET_VISIBLE_HEIGHT,
    normalized_center_x: TARGET_CENTER_X,
    normalized_bottom: TARGET_BOTTOM,
    frames
  }, null, 2)}\n`
)
