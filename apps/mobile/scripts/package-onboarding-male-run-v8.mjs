import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const SOURCE_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v6-smooth-runtime"
)
const OUTPUT_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v8-fluid-runtime"
)
const FRAME_COUNT = 17
const TARGET_HEIGHT = 258
const TARGET_CENTER_X = 130
const TARGET_BOTTOM = 360

async function visibleBounds(filePath) {
  const { data, info } = await sharp(filePath)
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

  if (maxX < minX || maxY < minY) throw new Error(`No visible pixels in ${filePath}`)
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

async function packageFrame(frame) {
  const suffix = `f${String(frame).padStart(2, "0")}`
  const fileName = `blumi_intro_run_male_${suffix}.png`
  const sourcePath = path.join(SOURCE_ROOT, fileName)
  const outputPath = path.join(OUTPUT_ROOT, fileName)
  const bounds = await visibleBounds(sourcePath)
  const scale = TARGET_HEIGHT / bounds.height
  const targetWidth = Math.max(1, Math.round(bounds.width * scale))
  const left = Math.round(TARGET_CENTER_X - targetWidth / 2)
  const top = TARGET_BOTTOM - TARGET_HEIGHT + 1

  const character = await sharp(sourcePath)
    .extract({
      left: bounds.minX,
      top: bounds.minY,
      width: bounds.width,
      height: bounds.height
    })
    .resize(targetWidth, TARGET_HEIGHT, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: 256,
      height: 384,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: character, left, top }])
    .png()
    .toFile(outputPath)

  const sha256 = createHash("sha256")
    .update(await readFile(outputPath))
    .digest("hex")
  return {
    frame,
    file: fileName,
    sha256,
    source_bounds: bounds,
    scale,
    target: {
      width: targetWidth,
      height: TARGET_HEIGHT,
      centerX: TARGET_CENTER_X,
      bottom: TARGET_BOTTOM,
      left,
      top
    }
  }
}

await mkdir(OUTPUT_ROOT, { recursive: true })
const frames = []
for (let frame = 1; frame <= FRAME_COUNT; frame += 1) {
  frames.push(await packageFrame(frame))
}

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify({
    version: "v8-fluid",
    master: "female-v3-runtime",
    source: "onboarding-runners-v6-smooth-runtime",
    frame_count: FRAME_COUNT,
    frame_durations_ms: [
      27, 51, 26, 31, 50, 54, 45, 67, 42, 54, 43, 34, 41, 29, 30, 52, 44
    ],
    loop_duration_ms: 720,
    normalized_visible_height: TARGET_HEIGHT,
    normalized_center_x: TARGET_CENTER_X,
    normalized_bottom: TARGET_BOTTOM,
    alpha_transition: "hard-cut",
    frames
  }, null, 2)}\n`
)
