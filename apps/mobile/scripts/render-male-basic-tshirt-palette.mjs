import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { mkdir } from "node:fs/promises"
import process from "node:process"

import { PNG } from "pngjs"

const PALETTES = {
  cream: {
    shadow: [220, 169, 142],
    mid: [250, 227, 196],
    highlight: [255, 247, 224]
  },
  sage: {
    shadow: [91, 119, 91],
    mid: [157, 181, 145],
    highlight: [215, 226, 196]
  },
  dustyNavy: {
    shadow: [43, 53, 84],
    mid: [78, 96, 140],
    highlight: [139, 153, 186]
  }
}

const [sourceArgument, outputArgument, paletteArgument] = process.argv.slice(2)
const palette = PALETTES[paletteArgument]

if (!sourceArgument || !outputArgument || !palette) {
  throw new Error(
    "Usage: node render-male-basic-tshirt-palette.mjs <approved-tee.png> <output.png> <cream|sage|dustyNavy>"
  )
}

const sourcePath = resolve(sourceArgument)
const outputPath = resolve(outputArgument)
const source = PNG.sync.read(readFileSync(sourcePath))
const output = new PNG({ width: source.width, height: source.height })

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)))
const mix = (start, end, amount) =>
  start.map((channel, index) => channel + (end[index] - channel) * amount)

for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
  const offset = pixel * 4
  const alpha = source.data[offset + 3] ?? 0

  if (alpha === 0) {
    output.data[offset] = 0
    output.data[offset + 1] = 0
    output.data[offset + 2] = 0
    output.data[offset + 3] = 0
    continue
  }

  const red = source.data[offset] ?? 0
  const green = source.data[offset + 1] ?? 0
  const blue = source.data[offset + 2] ?? 0
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
  const normalized = Math.max(0, Math.min(1, (luminance - 0.42) / 0.56))
  const color =
    normalized < 0.58
      ? mix(palette.shadow, palette.mid, normalized / 0.58)
      : mix(palette.mid, palette.highlight, (normalized - 0.58) / 0.42)

  output.data[offset] = clampByte(color[0])
  output.data[offset + 1] = clampByte(color[1])
  output.data[offset + 2] = clampByte(color[2])
  output.data[offset + 3] = alpha
}

await mkdir(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, PNG.sync.write(output, { colorType: 6 }))
console.log(outputPath)
