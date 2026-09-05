import { mkdir } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import sharp from "sharp"

const TARGET_FLOOR_CONTACT_Y = 1_110
const directions = ["front", "back", "left", "right"]
const [candidateDirectory, requestedDirection] = process.argv.slice(2)

if (!candidateDirectory) {
  throw new Error(
    "Usage: node scripts/normalize-room-v3-furniture-floor-contact.mjs <candidate-directory> [front|back|left|right]"
  )
}

if (requestedDirection && !directions.includes(requestedDirection)) {
  throw new Error(`Unknown direction: ${requestedDirection}`)
}

const candidateId = basename(resolve(candidateDirectory))
const selectedDirections = requestedDirection ? [requestedDirection] : directions

for (const direction of selectedDirections) {
  const source = resolve(candidateDirectory, `${candidateId}_${direction}_source_v1.png`)
  const output = resolve(candidateDirectory, `${candidateId}_${direction}_pilot_v1.png`)
  const sourceImage = sharp(source).ensureAlpha()
  const { data, info } = await sourceImage.raw().toBuffer({ resolveWithObject: true })
  const floorContactY = findFloorContactY(data, info.width, info.height, info.channels)
  const offsetY = TARGET_FLOOR_CONTACT_Y - floorContactY

  if (TARGET_FLOOR_CONTACT_Y >= info.height || offsetY < 0 || floorContactY < 0) {
    throw new Error(
      `${basename(source)} cannot be moved to the canonical floor contact without clipping`
    )
  }

  await mkdir(dirname(output), { recursive: true })
  await sharp({
    create: {
      width: info.width,
      height: info.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: await sharp(source).png().toBuffer(), left: 0, top: offsetY }])
    .png()
    .toFile(output)

  process.stdout.write(
    `${basename(source)}: floor ${floorContactY} -> ${TARGET_FLOOR_CONTACT_Y} (${offsetY}px)\n`
  )
}

function findFloorContactY(data, width, height, channels) {
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] > 0) maxY = y
    }
  }

  return maxY
}
