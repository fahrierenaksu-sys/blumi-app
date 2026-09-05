import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const INPUT_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v8-fluid-runtime"
)
const OUTPUT_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v9-natural-runtime"
)

const inputManifest = JSON.parse(
  await readFile(path.join(INPUT_ROOT, "manifest.json"), "utf8")
)

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
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

await mkdir(OUTPUT_ROOT, { recursive: true })
const frames = []

for (const inputFrame of inputManifest.frames) {
  const inputPath = path.join(INPUT_ROOT, inputFrame.file)
  const outputPath = path.join(OUTPUT_ROOT, inputFrame.file)
  const normalizedBounds = await visibleBounds(inputPath)
  const naturalBounds = inputFrame.source_bounds
  const character = await sharp(inputPath)
    .extract({
      left: normalizedBounds.minX,
      top: normalizedBounds.minY,
      width: normalizedBounds.width,
      height: normalizedBounds.height
    })
    .resize(naturalBounds.width, naturalBounds.height, {
      kernel: sharp.kernel.lanczos3
    })
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
    .composite([{ input: character, left: naturalBounds.minX, top: naturalBounds.minY }])
    .png()
    .toFile(outputPath)

  frames.push({
    frame: inputFrame.frame,
    file: inputFrame.file,
    sha256: createHash("sha256").update(await readFile(outputPath)).digest("hex"),
    natural_bounds: naturalBounds
  })
}

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify({
    version: "v9-natural",
    recovered_from: "onboarding-runners-v8-fluid-runtime",
    geometry_source: "v8 manifest source_bounds recorded from v6-smooth-runtime",
    frame_count: frames.length,
    frame_durations_ms: Array.from({ length: frames.length }, () => 72),
    loop_duration_ms: frames.length * 72,
    natural_bottoms: frames.map((frame) => frame.natural_bounds.maxY),
    frames
  }, null, 2)}\n`
)
