import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { PNG } from "pngjs"

const [
  baseDirectoryArgument,
  topDirectoryArgument,
  outputArgument,
  pantsDirectoryArgument,
  shoesDirectoryArgument,
  poseArgument = "walking"
] = process.argv.slice(2)

if (!baseDirectoryArgument || !topDirectoryArgument || !outputArgument) {
  throw new Error(
    "usage: render-male-starter-motion-qa.mjs <base-dir> <top-dir> <output.png> [pants-dir] [shoes-dir] [walking|sitting]"
  )
}

const baseDirectory = resolve(baseDirectoryArgument)
const topDirectory = resolve(topDirectoryArgument)
const outputPath = resolve(outputArgument)
const pantsDirectory = pantsDirectoryArgument ? resolve(pantsDirectoryArgument) : undefined
const shoesDirectory = shoesDirectoryArgument ? resolve(shoesDirectoryArgument) : undefined
const scale = 3
const frameWidth = 256
const frameHeight = 384
const gap = 12
const frameCount = poseArgument === "sitting" ? 1 : 4
const sheet = new PNG({
  width: (frameWidth * frameCount + gap * (frameCount - 1)) * scale,
  height: frameHeight * scale
})

const offsetAt = (image, x, y) => (y * image.width + x) * 4

const blendPixel = (background, foreground) => {
  const foregroundAlpha = foreground[3] / 255
  const backgroundAlpha = background[3] / 255
  const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha)
  if (outputAlpha <= 0) return [0, 0, 0, 0]

  return [
    Math.round((foreground[0] * foregroundAlpha + background[0] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round((foreground[1] * foregroundAlpha + background[1] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round((foreground[2] * foregroundAlpha + background[2] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round(outputAlpha * 255)
  ]
}

const composite = (base, overlay) => {
  const result = new PNG({ width: frameWidth, height: frameHeight })
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const offset = offsetAt(base, x, y)
      const background = [base.data[offset], base.data[offset + 1], base.data[offset + 2], base.data[offset + 3]]
      const foreground = [overlay.data[offset], overlay.data[offset + 1], overlay.data[offset + 2], overlay.data[offset + 3]]
      const pixel = blendPixel(background, foreground)
      pixel.forEach((value, channel) => {
        result.data[offset + channel] = value
      })
    }
  }
  return result
}

const paintScaledFrame = (frame, frameIndex) => {
  const originX = frameIndex * (frameWidth + gap) * scale
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const sourceOffset = offsetAt(frame, x, y)
      const alpha = (frame.data[sourceOffset + 3] ?? 0) / 255
      const red = Math.round((frame.data[sourceOffset] ?? 0) * alpha + 255 * (1 - alpha))
      const green = Math.round((frame.data[sourceOffset + 1] ?? 0) * alpha + 246 * (1 - alpha))
      const blue = Math.round((frame.data[sourceOffset + 2] ?? 0) * alpha + 248 * (1 - alpha))
      for (let scaleY = 0; scaleY < scale; scaleY += 1) {
        for (let scaleX = 0; scaleX < scale; scaleX += 1) {
          const targetX = originX + x * scale + scaleX
          const targetY = y * scale + scaleY
          const targetOffset = offsetAt(sheet, targetX, targetY)
          sheet.data[targetOffset] = red
          sheet.data[targetOffset + 1] = green
          sheet.data[targetOffset + 2] = blue
          sheet.data[targetOffset + 3] = 255
        }
      }
    }
  }
}

for (let index = 1; index <= frameCount; index += 1) {
  const frame = String(index).padStart(2, "0")
  const base = PNG.sync.read(
    readFileSync(join(baseDirectory, `room_avatar_base_male_light_v1_${poseArgument}_front_f${frame}.png`))
  )
  const top = PNG.sync.read(
    readFileSync(join(topDirectory, `room_avatar_top_male_powder_blue_crew_tee_v1_${poseArgument}_front_f${frame}.png`))
  )
  const shoes = shoesDirectory
    ? PNG.sync.read(
        readFileSync(join(shoesDirectory, `room_avatar_shoes_male_milk_tea_court_v1_${poseArgument}_front_f${frame}.png`))
      )
    : undefined
  const pants = pantsDirectory
    ? PNG.sync.read(
        readFileSync(join(pantsDirectory, `room_avatar_bottom_male_navy_straight_pants_v1_${poseArgument}_front_f${frame}.png`))
      )
    : undefined
  const withShoes = shoes ? composite(base, shoes) : base
  const withPants = pants ? composite(withShoes, pants) : withShoes
  paintScaledFrame(composite(withPants, top), index - 1)
}

writeFileSync(outputPath, PNG.sync.write(sheet))
