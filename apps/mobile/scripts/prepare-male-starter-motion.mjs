import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { PNG } from "pngjs"

const [kindArgument, stripArgument, outputDirectoryArgument, poseArgument = "walking"] = process.argv.slice(2)

if (!kindArgument || !stripArgument || !outputDirectoryArgument) {
  throw new Error(
    "usage: prepare-male-starter-motion.mjs <top|pants|shoes> <source.png> <output-directory> [walking|sitting|return]"
  )
}

const configurations = {
  top: {
    asset: "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    outputPrefix: "room_avatar_top_male_powder_blue_crew_tee_v1",
    targetBounds: [[88, 216, 168, 294], [87, 216, 169, 295], [86, 216, 170, 295], [86, 216, 170, 295]],
    sittingBounds: [86, 216, 170, 296],
    anchorBox: [106, 216, 150, 224]
  },
  pants: {
    asset: "avatar_room_bottom_male_navy_straight_pants_v1.png",
    outputPrefix: "room_avatar_bottom_male_navy_straight_pants_v1",
    targetBounds: [[104, 288, 152, 334], [102, 288, 154, 337], [102, 288, 155, 337], [102, 288, 154, 337]],
    sittingBounds: [88, 288, 168, 339],
    anchorBox: [104, 288, 152, 294]
  },
  shoes: {
    asset: "avatar_room_shoes_male_milk_tea_court_v1.png",
    outputPrefix: "room_avatar_shoes_male_milk_tea_court_v1",
    targetBounds: [[105, 326, 151, 348], [101, 320, 154, 349], [101, 320, 155, 349], [101, 320, 154, 349]],
    sittingBounds: [91, 322, 165, 346]
  }
}

const configuration = configurations[kindArgument]
if (!configuration) throw new Error(`unsupported male starter motion kind: ${kindArgument}`)
if (!new Set(["walking", "sitting", "return"]).has(poseArgument)) {
  throw new Error(`unsupported male starter pose: ${poseArgument}`)
}
const panelCount = poseArgument === "walking" ? 4 : 1

const strip = PNG.sync.read(readFileSync(resolve(stripArgument)))
const outputDirectory = resolve(outputDirectoryArgument)
const canonicalAsset = PNG.sync.read(
  readFileSync(resolve("apps/mobile/src/features/avatarV2/assets/room", configuration.asset))
)

const minimumWidth = poseArgument === "walking" ? 1024 : 512
if (strip.width < minimumWidth || strip.height < 512) {
  throw new Error(`motion strip is unexpectedly small: ${strip.width}x${strip.height}`)
}

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)))
const sourceOffset = (image, x, y) => (y * image.width + x) * 4

const chromaAlpha = (red, green, blue) => {
  const dominance = green - Math.max(red, blue)
  return clampByte(((82 - dominance) / 48) * 255)
}

const extractPanel = (panelIndex) => {
  const sourceX = Math.round((panelIndex * strip.width) / panelCount)
  const sourceMaxX = Math.round(((panelIndex + 1) * strip.width) / panelCount)
  const panelWidth = sourceMaxX - sourceX
  const panel = new PNG({ width: panelWidth, height: strip.height })

  for (let y = 0; y < panel.height; y += 1) {
    for (let x = 0; x < panel.width; x += 1) {
      const from = sourceOffset(strip, sourceX + x, y)
      const to = sourceOffset(panel, x, y)
      const red = strip.data[from] ?? 0
      const green = strip.data[from + 1] ?? 0
      const blue = strip.data[from + 2] ?? 0
      const alpha = chromaAlpha(red, green, blue)

      panel.data[to] = red
      panel.data[to + 1] = Math.min(green, Math.max(red, blue) + 18)
      panel.data[to + 2] = blue
      panel.data[to + 3] = alpha
    }
  }

  return panel
}

const visibleBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[sourceOffset(image, x, y) + 3] ?? 0) <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) throw new Error("motion panel contains no garment pixels")
  return [minX, minY, maxX + 1, maxY + 1]
}

const sampleBilinear = (image, x, y) => {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(y)))
  const x1 = Math.min(image.width - 1, x0 + 1)
  const y1 = Math.min(image.height - 1, y0 + 1)
  const wx = x - Math.floor(x)
  const wy = y - Math.floor(y)
  const samples = [[x0, y0, (1 - wx) * (1 - wy)], [x1, y0, wx * (1 - wy)], [x0, y1, (1 - wx) * wy], [x1, y1, wx * wy]]
  let alpha = 0
  let red = 0
  let green = 0
  let blue = 0

  for (const [sampleX, sampleY, weight] of samples) {
    const offset = sourceOffset(image, sampleX, sampleY)
    const sampleAlpha = (image.data[offset + 3] ?? 0) / 255
    const premultipliedWeight = weight * sampleAlpha
    alpha += premultipliedWeight
    red += (image.data[offset] ?? 0) * premultipliedWeight
    green += (image.data[offset + 1] ?? 0) * premultipliedWeight
    blue += (image.data[offset + 2] ?? 0) * premultipliedWeight
  }

  if (alpha <= 0) return [0, 0, 0, 0]
  return [clampByte(red / alpha), clampByte(green / alpha), clampByte(blue / alpha), clampByte(alpha * 255)]
}

const fitPanel = (panel, bounds) => {
  const [sourceMinX, sourceMinY, sourceMaxX, sourceMaxY] = visibleBounds(panel)
  const [targetMinX, targetMinY, targetMaxX, targetMaxY] = bounds
  const target = new PNG({ width: 256, height: 384 })
  const targetWidth = targetMaxX - targetMinX
  const targetHeight = targetMaxY - targetMinY

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = sourceMinX + ((x + 0.5) / targetWidth) * (sourceMaxX - sourceMinX) - 0.5
      const sourceY = sourceMinY + ((y + 0.5) / targetHeight) * (sourceMaxY - sourceMinY) - 0.5
      const pixel = sampleBilinear(panel, sourceX, sourceY)
      const targetOffset = sourceOffset(target, targetMinX + x, targetMinY + y)
      pixel.forEach((value, channel) => {
        target.data[targetOffset + channel] = value
      })
    }
  }

  return target
}

const restoreCanonicalAnchor = (frame) => {
  const restored = PNG.sync.read(PNG.sync.write(frame))
  if (!configuration.anchorBox) return restored
  const [minX, minY, maxX, maxY] = configuration.anchorBox
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const offset = sourceOffset(frame, x, y)
      for (let channel = 0; channel < 4; channel += 1) {
        restored.data[offset + channel] = canonicalAsset.data[offset + channel] ?? 0
      }
    }
  }
  return restored
}

const isContaminated = (image, x, y) => {
  const offset = sourceOffset(image, x, y)
  const red = image.data[offset] ?? 0
  const green = image.data[offset + 1] ?? 0
  const blue = image.data[offset + 2] ?? 0
  const alpha = image.data[offset + 3] ?? 0
  return alpha >= 11 && green > red + 12 && green > blue + 12
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const decontaminate = (frame) => {
  const cleaned = PNG.sync.read(PNG.sync.write(frame))
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (!isContaminated(frame, x, y)) continue
      const targetOffset = sourceOffset(frame, x, y)
      const targetAlpha = frame.data[targetOffset + 3] ?? 0
      const samples = []

      for (let neighborY = Math.max(0, y - 2); neighborY <= Math.min(frame.height - 1, y + 2); neighborY += 1) {
        for (let neighborX = Math.max(0, x - 2); neighborX <= Math.min(frame.width - 1, x + 2); neighborX += 1) {
          const offset = sourceOffset(frame, neighborX, neighborY)
          const alpha = frame.data[offset + 3] ?? 0
          if (Math.abs(alpha - targetAlpha) > 32 || isContaminated(frame, neighborX, neighborY)) continue
          const green = frame.data[offset + 1] ?? 0
          const blue = frame.data[offset + 2] ?? 0
          if (blue < green) continue
          samples.push([frame.data[offset] ?? 0, green, blue])
        }
      }

      if (samples.length === 0) {
        cleaned.data[targetOffset + 1] = Math.max(frame.data[targetOffset] ?? 0, frame.data[targetOffset + 2] ?? 0)
        continue
      }
      for (let channel = 0; channel < 3; channel += 1) {
        cleaned.data[targetOffset + channel] = median(samples.map((sample) => sample[channel]))
      }
    }
  }
  return cleaned
}

const mirrorHorizontal = (frame) => {
  const mirrored = new PNG({ width: frame.width, height: frame.height })
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const source = sourceOffset(frame, x, y)
      const target = sourceOffset(mirrored, frame.width - x - 1, y)
      for (let channel = 0; channel < 4; channel += 1) {
        mirrored.data[target + channel] = frame.data[source + channel] ?? 0
      }
    }
  }
  return mirrored
}

mkdirSync(outputDirectory, { recursive: true })

const selectedBounds = poseArgument === "sitting"
  ? [configuration.sittingBounds]
  : poseArgument === "return"
    ? [configuration.targetBounds[3]]
    : configuration.targetBounds
const outputPose = poseArgument === "return" ? "walking" : poseArgument

selectedBounds.forEach((bounds, index) => {
  const frame = decontaminate(restoreCanonicalAnchor(fitPanel(extractPanel(index), bounds)))
  const frameNumber = poseArgument === "return"
    ? "04"
    : String(index + 1).padStart(2, "0")
  const outputName = `${configuration.outputPrefix}_${outputPose}_front_f${frameNumber}.png`
  writeFileSync(join(outputDirectory, outputName), PNG.sync.write(frame))
})

if (kindArgument === "shoes" && poseArgument === "walking") {
  const secondFramePath = join(
    outputDirectory,
    `${configuration.outputPrefix}_walking_front_f02.png`
  )
  const thirdFramePath = join(
    outputDirectory,
    `${configuration.outputPrefix}_walking_front_f03.png`
  )
  const secondFrame = PNG.sync.read(readFileSync(secondFramePath))
  writeFileSync(thirdFramePath, PNG.sync.write(mirrorHorizontal(secondFrame)))
}

console.log(`prepared ${selectedBounds.length} fitted ${kindArgument} ${poseArgument} frame(s) from ${basename(stripArgument)}`)
