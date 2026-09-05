import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { PNG } from "pngjs"

const [poseArgument, baseArgument, pantsArgument, shoesArgument, outputArgument] =
  process.argv.slice(2)

if (!poseArgument || !baseArgument || !pantsArgument || !shoesArgument || !outputArgument) {
  throw new Error(
    "usage: repair-male-starter-lower-body.mjs <walking|sitting> <base-dir> <pants-dir> <shoes-dir> <output-dir>"
  )
}

if (!new Set(["walking", "sitting"]).has(poseArgument)) {
  throw new Error(`unsupported pose: ${poseArgument}`)
}

const baseDirectory = resolve(baseArgument)
const pantsDirectory = resolve(pantsArgument)
const shoesDirectory = resolve(shoesArgument)
const outputDirectory = resolve(outputArgument)
const frameCount = poseArgument === "walking" ? 4 : 1

const offsetAt = (image, x, y) => (y * image.width + x) * 4
const alphaAt = (image, x, y) => image.data[offsetAt(image, x, y) + 3] ?? 0
const cloneImage = (image) => PNG.sync.read(PNG.sync.write(image))

const nearestVisiblePixel = (image, x, y, radiusLimit = 14) => {
  let best
  for (let radius = 1; radius <= radiusLimit && !best; radius += 1) {
    for (let candidateY = Math.max(0, y - radius); candidateY <= Math.min(383, y + radius); candidateY += 1) {
      for (let candidateX = Math.max(0, x - radius); candidateX <= Math.min(255, x + radius); candidateX += 1) {
        if (Math.max(Math.abs(candidateX - x), Math.abs(candidateY - y)) !== radius) continue
        if (alphaAt(image, candidateX, candidateY) <= 200) continue
        const distance = Math.hypot(candidateX - x, candidateY - y)
        if (!best || distance < best.distance) best = { x: candidateX, y: candidateY, distance }
      }
    }
  }
  return best
}

const copyCoveragePixel = (target, sampleSource, body, x, y, sample) => {
  const targetOffset = offsetAt(target, x, y)
  const sourceOffset = offsetAt(sampleSource, sample.x, sample.y)
  for (let channel = 0; channel < 3; channel += 1) {
    target.data[targetOffset + channel] = sampleSource.data[sourceOffset + channel] ?? 0
  }
  target.data[targetOffset + 3] = 255
}

const compressSittingShoes = (shoes) => {
  const compressed = new PNG({ width: shoes.width, height: shoes.height })
  const baseline = 345
  const scale = 0.7

  for (let y = 322; y <= baseline; y += 1) {
    const targetY = Math.round(baseline + (y - baseline) * scale)
    for (let x = 0; x < shoes.width; x += 1) {
      const sourceOffset = offsetAt(shoes, x, y)
      const targetOffset = offsetAt(compressed, x, targetY)
      if ((shoes.data[sourceOffset + 3] ?? 0) <= (compressed.data[targetOffset + 3] ?? 0)) continue
      for (let channel = 0; channel < 4; channel += 1) {
        compressed.data[targetOffset + channel] = shoes.data[sourceOffset + channel] ?? 0
      }
    }
  }
  return compressed
}

const fillInternalPantsCoverage = (body, pants, shoes) => {
  const repaired = cloneImage(pants)
  for (let y = 288; y <= 338; y += 1) {
    const rowPixels = []
    for (let x = 88; x <= 168; x += 1) {
      if (alphaAt(pants, x, y) > 10) rowPixels.push(x)
    }
    if (rowPixels.length === 0) continue
    const minX = Math.min(...rowPixels)
    const maxX = Math.max(...rowPixels)

    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(body, x, y) <= 10 || alphaAt(repaired, x, y) >= 240) continue
      const sample = nearestVisiblePixel(pants, x, y)
      if (sample) copyCoveragePixel(repaired, pants, body, x, y, sample)
    }
  }
  return repaired
}

const fillRemainingCoverage = (body, pants, shoes) => {
  const repairedPants = cloneImage(pants)
  const repairedShoes = cloneImage(shoes)

  for (let y = 294; y <= 343; y += 1) {
    for (let x = 88; x <= 168; x += 1) {
      if (
        alphaAt(body, x, y) <= 10 ||
        alphaAt(repairedPants, x, y) >= 240 ||
        alphaAt(repairedShoes, x, y) >= 240
      ) {
        continue
      }
      const pantsSample = nearestVisiblePixel(repairedPants, x, y)
      const shoesSample = nearestVisiblePixel(repairedShoes, x, y)
      const usePants =
        pantsSample &&
        (y <= 336 || !shoesSample || pantsSample.distance <= shoesSample.distance + 2)

      if (usePants) {
        copyCoveragePixel(repairedPants, repairedPants, body, x, y, pantsSample)
      } else if (shoesSample) {
        copyCoveragePixel(repairedShoes, repairedShoes, body, x, y, shoesSample)
      }
    }
  }
  return [repairedPants, repairedShoes]
}

const darkenInnerSeam = (pants) => {
  const repaired = cloneImage(pants)
  for (let y = 308; y <= 334; y += 1) {
    for (const x of [127, 128]) {
      if (alphaAt(repaired, x, y) <= 10) continue
      const offset = offsetAt(repaired, x, y)
      for (let channel = 0; channel < 3; channel += 1) {
        repaired.data[offset + channel] = Math.round((repaired.data[offset + channel] ?? 0) * 0.84)
      }
    }
  }
  return repaired
}

const sittingOuterBounds = new Map([
  [288, [101, 155]], [289, [100, 155]], [290, [100, 156]], [291, [99, 156]],
  [292, [98, 157]], [293, [97, 158]], [294, [96, 159]], [295, [96, 159]],
  [296, [95, 160]], [297, [95, 160]], [298, [95, 160]], [299, [94, 162]],
  [300, [93, 162]], [301, [92, 163]], [302, [92, 164]], [303, [91, 164]],
  [304, [90, 165]], [305, [90, 166]], [306, [89, 166]], [307, [89, 166]],
  [308, [88, 167]], [309, [88, 167]], [310, [88, 167]], [311, [89, 167]],
  [312, [89, 166]], [313, [88, 167]], [314, [88, 167]], [315, [88, 167]],
  [316, [89, 166]], [317, [89, 166]], [318, [89, 166]], [319, [89, 166]],
  [320, [89, 166]], [321, [89, 166]], [322, [89, 166]], [323, [89, 165]],
  [324, [90, 165]], [325, [90, 165]], [326, [90, 165]], [327, [91, 164]],
  [328, [91, 164]], [329, [91, 164]], [330, [91, 163]], [331, [91, 163]],
  [332, [92, 163]], [333, [92, 163]], [334, [92, 163]], [335, [92, 163]],
  [336, [92, 163]], [337, [92, 162]], [338, [95, 159]]
])

const sittingRepairRanges = (y) => {
  if (y === 288) return [[104, 105], [150, 152]]
  if (y >= 289 && y <= 292) return [[104, 104], [151, 152]]
  if (y >= 293 && y <= 294) return [[152, 152]]
  if (y === 308) return [[126, 129]]
  if (y === 309) return [[125, 130]]
  if (y === 310) return [[124, 131]]
  if (y === 311) return [[123, 132]]
  if (y === 312) return [[121, 134]]
  if (y >= 313 && y <= 314) return [[120, 135]]
  if (y >= 315 && y <= 316) return [[119, 136]]
  if (y === 317) return [[118, 137]]
  if (y === 318) return [[119, 136]]
  if (y >= 319 && y <= 322) return [[118, 137]]
  if (y >= 323 && y <= 325) return [[118, 136]]
  if (y >= 326 && y <= 334) return [[118, 137]]
  if (y === 335) return [[118, 126], [128, 137]]
  if (y === 336) return [[118, 126], [129, 136]]
  if (y === 337) return [[118, 125], [130, 137]]
  if (y === 338) return [[114, 124], [130, 141]]
  return []
}

const boundaryClothColor = (pants, anchorX, y, direction) => {
  const samples = []
  for (let deltaY = -4; deltaY <= 4; deltaY += 1) {
    for (let distance = 1; distance <= 5; distance += 1) {
      const sampleX = anchorX + direction * distance
      const sampleY = y + deltaY
      if (alphaAt(pants, sampleX, sampleY) <= 200) continue
      const offset = offsetAt(pants, sampleX, sampleY)
      samples.push([
        pants.data[offset] ?? 0,
        pants.data[offset + 1] ?? 0,
        pants.data[offset + 2] ?? 0
      ])
    }
  }
  return [0, 1, 2].map((channel) => {
    const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right)
    return values[Math.floor(values.length / 2)] ?? [29, 25, 59][channel]
  })
}

const texturedBilateralColor = (pants, x, y, minX, maxX) => {
  const left = boundaryClothColor(pants, minX, y, -1)
  const right = boundaryClothColor(pants, maxX, y, 1)
  const progress = maxX === minX ? 0.5 : (x - minX) / (maxX - minX)
  const color = [0, 1, 2].map((channel) =>
    Math.round(left[channel] * (1 - progress) + right[channel] * progress)
  )
  const wrinkleOffset = Math.round(Math.min(12, Math.max(0, y - 307)) * 0.28)
  const onTensionWrinkle =
    Math.abs(x - (127 - wrinkleOffset)) <= 1 ||
    Math.abs(x - (128 + wrinkleOffset)) <= 1
  const shade = x === 127 || x === 128 ? 0.82 : onTensionWrinkle ? 0.93 : 1
  const shaded = color.map((channel) => Math.round(channel * shade))
  const luminance = shaded[0] * 0.2126 + shaded[1] * 0.7152 + shaded[2] * 0.0722
  const luminanceScale = luminance > 32 ? 30 / luminance : luminance < 24 ? 26 / luminance : 1
  return [
    Math.max(16, Math.round(shaded[0] * luminanceScale)),
    Math.max(14, Math.round(shaded[1] * luminanceScale)),
    Math.max(34, Math.round(shaded[2] * luminanceScale))
  ]
}

const repairSittingPants = (body, pants) => {
  const repaired = cloneImage(pants)
  for (let y = 288; y <= 338; y += 1) {
    const bounds = sittingOuterBounds.get(y)
    if (!bounds) continue
    const [minX, maxX] = bounds
    for (let x = 0; x < repaired.width; x += 1) {
      if (x >= minX && x <= maxX) continue
      const offset = offsetAt(repaired, x, y)
      repaired.data[offset + 3] = 0
    }
    const repairPixels = new Set()
    for (const [startX, endX] of sittingRepairRanges(y)) {
      for (let x = startX; x <= endX; x += 1) repairPixels.add(x)
    }
    if (y >= 300 && y <= 338) {
      for (let x = Math.max(minX, 110); x <= Math.min(maxX, 146); x += 1) {
        if (alphaAt(body, x, y) > 10 && alphaAt(pants, x, y) < 240) repairPixels.add(x)
      }
    }
    const repairColumns = [...repairPixels].sort((left, right) => left - right)
    const repairMinX = repairColumns[0]
    const repairMaxX = repairColumns[repairColumns.length - 1]
    for (const x of repairColumns) {
        const offset = offsetAt(repaired, x, y)
        const color = texturedBilateralColor(pants, x, y, repairMinX, repairMaxX)
        for (let channel = 0; channel < 3; channel += 1) {
          repaired.data[offset + channel] = color[channel]
        }
        repaired.data[offset + 3] = 255
    }
  }
  return repaired
}

mkdirSync(outputDirectory, { recursive: true })

for (let index = 1; index <= frameCount; index += 1) {
  const frame = String(index).padStart(2, "0")
  const suffix = `${poseArgument}_front_f${frame}.png`
  const base = PNG.sync.read(
    readFileSync(join(baseDirectory, `room_avatar_base_male_light_v1_${suffix}`))
  )
  const pantsName = `room_avatar_bottom_male_navy_straight_pants_v1_${suffix}`
  const shoesName = `room_avatar_shoes_male_milk_tea_court_v1_${suffix}`
  const rawPants = PNG.sync.read(readFileSync(join(pantsDirectory, pantsName)))
  const rawShoes = PNG.sync.read(readFileSync(join(shoesDirectory, shoesName)))
  const anchoredShoes = poseArgument === "sitting" ? compressSittingShoes(rawShoes) : rawShoes
  if (poseArgument === "sitting") {
    writeFileSync(join(outputDirectory, pantsName), PNG.sync.write(repairSittingPants(base, rawPants)))
    writeFileSync(join(outputDirectory, shoesName), PNG.sync.write(anchoredShoes))
    continue
  }

  const internalPants = fillInternalPantsCoverage(base, rawPants, anchoredShoes)
  const [coveredPants, coveredShoes] = fillRemainingCoverage(base, internalPants, anchoredShoes)
  writeFileSync(join(outputDirectory, pantsName), PNG.sync.write(darkenInnerSeam(coveredPants)))
  writeFileSync(join(outputDirectory, shoesName), PNG.sync.write(coveredShoes))
}
