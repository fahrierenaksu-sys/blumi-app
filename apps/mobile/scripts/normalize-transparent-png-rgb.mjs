import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { PNG } from "pngjs"

const inputPaths = process.argv.slice(2)

if (inputPaths.length === 0) {
  throw new Error("usage: normalize-transparent-png-rgb.mjs <png-or-directory> [...]")
}

const collectPngFiles = (inputPath) => {
  const absolutePath = resolve(inputPath)
  const stats = statSync(absolutePath)
  if (!stats.isDirectory()) {
    return extname(absolutePath).toLowerCase() === ".png" ? [absolutePath] : []
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
    collectPngFiles(join(absolutePath, entry.name))
  )
}

const pngFiles = [...new Set(inputPaths.flatMap(collectPngFiles))]
let normalizedPixelCount = 0
let normalizedFileCount = 0

for (const filename of pngFiles) {
  const image = PNG.sync.read(readFileSync(filename))
  let filePixelCount = 0

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if ((image.data[offset + 3] ?? 0) !== 0) continue
    if (
      (image.data[offset] ?? 0) === 0 &&
      (image.data[offset + 1] ?? 0) === 0 &&
      (image.data[offset + 2] ?? 0) === 0
    ) {
      continue
    }

    image.data[offset] = 0
    image.data[offset + 1] = 0
    image.data[offset + 2] = 0
    filePixelCount += 1
  }

  if (filePixelCount === 0) continue
  writeFileSync(filename, PNG.sync.write(image))
  normalizedFileCount += 1
  normalizedPixelCount += filePixelCount
  console.log(`${filename}: ${filePixelCount}`)
}

console.log(
  `normalized ${normalizedPixelCount} transparent pixels across ${normalizedFileCount} PNG files`
)
