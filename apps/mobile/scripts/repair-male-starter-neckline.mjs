import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { PNG } from "pngjs"

const [sourceArgument, outputArgument] = process.argv.slice(2)

if (!sourceArgument || !outputArgument) {
  throw new Error("usage: repair-male-starter-neckline.mjs <source.png> <output.png>")
}

const sourcePath = resolve(sourceArgument)
const outputPath = resolve(outputArgument)
const source = PNG.sync.read(readFileSync(sourcePath))

if (source.width !== 256 || source.height !== 384) {
  throw new Error(`expected a 256x384 rig layer, received ${source.width}x${source.height}`)
}

const repaired = new PNG({ width: source.width, height: source.height })
source.data.copy(repaired.data)

const offsetAt = (x, y) => (y * source.width + x) * 4
const alphaAt = (x, y) => source.data[offsetAt(x, y) + 3] ?? 0
const isNecklinePixel = (x, y) => x >= 106 && x <= 150 && y >= 216 && y <= 223
const touchesOpening = (x, y) =>
  alphaAt(x - 1, y) <= 32 ||
  alphaAt(x + 1, y) <= 32 ||
  alphaAt(x, y - 1) <= 32 ||
  alphaAt(x, y + 1) <= 32

for (let y = 216; y <= 223; y += 1) {
  for (let x = 106; x <= 150; x += 1) {
    if (!isNecklinePixel(x, y) || alphaAt(x, y) <= 32) continue

    const targetOffset = offsetAt(x, y)
    const donorOffset = offsetAt(x, 224)
    const contourScale = touchesOpening(x, y) ? 0.93 : 1

    for (let channel = 0; channel < 3; channel += 1) {
      repaired.data[targetOffset + channel] = Math.round(
        (source.data[donorOffset + channel] ?? 0) * contourScale
      )
    }
  }
}

writeFileSync(outputPath, PNG.sync.write(repaired))
