import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import process from "node:process"

import sharp from "sharp"

const [inputArgument, outputArgument, maskArgument] = process.argv.slice(2)

if (!inputArgument || !outputArgument) {
  throw new Error(
    "Usage: node fit-male-basic-tshirt-static.mjs <alpha-source.png> <output.png>"
  )
}

const inputPath = resolve(inputArgument)
const outputPath = resolve(outputArgument)
const maskPath = maskArgument ? resolve(maskArgument) : undefined

// Canonical Blumi male room-rig envelope. Every static T-shirt is normalized
// to this exact canvas and anchor before it can enter visual/contract QA.
const STATIC_TEE_ENVELOPE = {
  canvasWidth: 256,
  canvasHeight: 384,
  left: 88,
  top: 216,
  width: 80,
  height: 78
}

await mkdir(dirname(outputPath), { recursive: true })

const fitted = await sharp(inputPath)
  .trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    threshold: 8
  })
  .resize(STATIC_TEE_ENVELOPE.width, STATIC_TEE_ENVELOPE.height, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3
  })
  .png()
  .toBuffer()

const placed = await sharp({
  create: {
    width: STATIC_TEE_ENVELOPE.canvasWidth,
    height: STATIC_TEE_ENVELOPE.canvasHeight,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .composite([
    {
      input: fitted,
      left: STATIC_TEE_ENVELOPE.left,
      top: STATIC_TEE_ENVELOPE.top
    }
  ])
  .png()
  .toBuffer()

const normalized = maskPath
  ? sharp(placed).composite([{ input: maskPath, blend: "dest-in" }])
  : sharp(placed)

await normalized.png().toFile(outputPath)

console.log(outputPath)
