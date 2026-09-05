import { mkdir } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import sharp from "sharp"

import { despillLowAlphaChroma } from "./room-v3-runtime-alpha.mjs"

const TARGET_CONTENT_HEIGHT = 952
const PADDING = 24
const OUTPUT_HEIGHT = TARGET_CONTENT_HEIGHT + PADDING * 2
const allDirections = ["front", "back", "left", "right"]
const [candidateDirectory, requestedDirection] = process.argv.slice(2)

if (!candidateDirectory) {
  throw new Error(
    "Usage: node scripts/prepare-room-v3-furniture-runtime-assets.mjs <candidate-directory> [front|back|left|right]"
  )
}

if (requestedDirection && !allDirections.includes(requestedDirection)) {
  throw new Error(`Unknown direction: ${requestedDirection}`)
}

const directions = requestedDirection ? [requestedDirection] : allDirections

const candidateId = basename(resolve(candidateDirectory))

for (const direction of directions) {
  const source = resolve(candidateDirectory, `${candidateId}_${direction}_pilot_v1.png`)
  const output = resolve(candidateDirectory, `${candidateId}_${direction}_runtime_v2.png`)
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({
    resolveWithObject: true
  })
  const alphaBounds = findAlphaBounds(data, info.width, info.height, info.channels)

  if (!alphaBounds) {
    throw new Error(`${basename(source)} has no visible pixels to prepare`)
  }

  const sanitizedPilot = await sharp(despillLowAlphaChroma(data), {
    raw: { width: info.width, height: info.height, channels: info.channels }
  })
    .png()
    .toBuffer()
  const cropped = await sharp(sanitizedPilot)
    .extract({
      left: alphaBounds.minX,
      top: alphaBounds.minY,
      width: alphaBounds.maxXInclusive - alphaBounds.minX + 1,
      height: alphaBounds.maxYInclusive - alphaBounds.minY + 1
    })
    .resize({ height: TARGET_CONTENT_HEIGHT, kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const despilledCropped = await sharp(despillLowAlphaChroma(cropped.data), {
    raw: {
      width: cropped.info.width,
      height: cropped.info.height,
      channels: cropped.info.channels
    }
  })
    .png()
    .toBuffer()
  const croppedMetadata = await sharp(despilledCropped).metadata()

  if (!croppedMetadata.width || !croppedMetadata.height) {
    throw new Error(`${basename(source)} could not be resized`)
  }

  await mkdir(dirname(output), { recursive: true })
  await sharp({
    create: {
      width: croppedMetadata.width + PADDING * 2,
      height: OUTPUT_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: despilledCropped, left: PADDING, top: PADDING }])
    .png()
    .toFile(output)

  process.stdout.write(
    `${basename(source)} -> ${basename(output)}: alpha floor ${OUTPUT_HEIGHT - PADDING - 1}\n`
  )
}

function findAlphaBounds(data, width, height, channels) {
  let minX = width
  let minY = height
  let maxXInclusive = -1
  let maxYInclusive = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxXInclusive = Math.max(maxXInclusive, x)
      maxYInclusive = Math.max(maxYInclusive, y)
    }
  }

  return maxXInclusive >= minX && maxYInclusive >= minY
    ? { minX, minY, maxXInclusive, maxYInclusive }
    : undefined
}
