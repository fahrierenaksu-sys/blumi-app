import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = resolve(
  mobileRoot,
  "src/features/session/assets/register-world-hero-v1-source/blumi_register_world_hero_v1_raw.png"
)
const outputPath = resolve(
  mobileRoot,
  "src/features/session/assets/register-world-hero-v1-runtime/blumi_register_world_hero_v1.png"
)

function isConnectedWhite(red, green, blue, lowerEdge = false) {
  const minimum = Math.min(red, green, blue)
  const maximum = Math.max(red, green, blue)
  return lowerEdge
    ? minimum >= 210 && maximum - minimum <= 20
    : minimum >= 220 && maximum - minimum <= 12
}

function findBackground(data, width, height) {
  const background = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let queueStart = 0
  let queueEnd = 0

  const enqueue = (index) => {
    if (background[index]) return
    const offset = index * 3
    const y = Math.floor(index / width)
    if (!isConnectedWhite(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      y >= height * 0.86
    )) {
      return
    }
    background[index] = 1
    queue[queueEnd] = index
    queueEnd += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart]
    queueStart += 1
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) enqueue(index - 1)
    if (x + 1 < width) enqueue(index + 1)
    if (y > 0) enqueue(index - width)
    if (y + 1 < height) enqueue(index + width)
  }

  return background
}

function decontaminateBoundary(rgba, background, width, height) {
  const source = Buffer.from(rgba)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (background[index]) continue

      let touchesBackground = false
      for (let dy = -2; dy <= 2 && !touchesBackground; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const sampleX = x + dx
          const sampleY = y + dy
          if (
            sampleX < 0 || sampleX >= width ||
            sampleY < 0 || sampleY >= height
          ) continue
          if (background[sampleY * width + sampleX]) {
            touchesBackground = true
            break
          }
        }
      }
      if (!touchesBackground) continue

      let bestIndex = index
      let bestScore = Number.NEGATIVE_INFINITY
      for (let dy = -6; dy <= 6; dy += 1) {
        for (let dx = -6; dx <= 6; dx += 1) {
          const sampleX = x + dx
          const sampleY = y + dy
          if (
            sampleX < 0 || sampleX >= width ||
            sampleY < 0 || sampleY >= height
          ) continue
          const sampleIndex = sampleY * width + sampleX
          if (background[sampleIndex]) continue
          const offset = sampleIndex * 4
          const red = source[offset]
          const green = source[offset + 1]
          const blue = source[offset + 2]
          const luminance = (red + green + blue) / 3
          const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
          const score = (255 - luminance) * 1.8 + chroma * 2.2 -
            (Math.abs(dx) + Math.abs(dy)) * 5
          if (score > bestScore) {
            bestScore = score
            bestIndex = sampleIndex
          }
        }
      }

      const targetOffset = index * 4
      const sampleOffset = bestIndex * 4
      rgba[targetOffset] = source[sampleOffset]
      rgba[targetOffset + 1] = source[sampleOffset + 1]
      rgba[targetOffset + 2] = source[sampleOffset + 2]
    }
  }
}

async function main() {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const background = findBackground(data, info.width, info.height)
  const rgba = Buffer.alloc(info.width * info.height * 4)

  for (let index = 0; index < background.length; index += 1) {
    const sourceOffset = index * 3
    const targetOffset = index * 4
    rgba[targetOffset] = data[sourceOffset]
    rgba[targetOffset + 1] = data[sourceOffset + 1]
    rgba[targetOffset + 2] = data[sourceOffset + 2]
    rgba[targetOffset + 3] = background[index] ? 0 : 255
  }
  decontaminateBoundary(rgba, background, info.width, info.height)

  const runtime = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .resize(1024, 632, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
      premultiplied: true
    })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, runtime)
}

await main()
