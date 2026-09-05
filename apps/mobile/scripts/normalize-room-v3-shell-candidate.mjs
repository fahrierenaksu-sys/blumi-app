import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"

export async function normalizeRoomV3ShellCandidate({
  masterPath,
  sourcePath,
  outputPath,
  backgroundThreshold = 18
}) {
  if (!masterPath || !sourcePath || !outputPath) {
    throw new Error("masterPath, sourcePath, and outputPath are required")
  }
  if (!Number.isFinite(backgroundThreshold) || backgroundThreshold < 1) {
    throw new Error("backgroundThreshold must be a positive number")
  }

  const [master, source] = await Promise.all([
    sharp(masterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ])
  const masterAlpha = extractAlpha(master.data, master.info)
  const masterAlphaBounds = findBounds(
    masterAlpha,
    master.info.width,
    master.info.height,
    (value) => value > 0
  )
  if (!masterAlphaBounds) {
    throw new Error("canonical shell master has no alpha foreground")
  }

  const background = sampleCornerBackground(source.data, source.info)
  const sourceForegroundBounds = findBounds(
    source.data,
    source.info.width,
    source.info.height,
    (_, offset) => colorDistance(source.data, offset, background) >= backgroundThreshold,
    source.info.channels
  )
  if (!sourceForegroundBounds) {
    throw new Error("generated shell source has no detectable foreground")
  }

  const targetWidth =
    masterAlphaBounds.maxXInclusive - masterAlphaBounds.minX + 1
  const targetHeight =
    masterAlphaBounds.maxYInclusive - masterAlphaBounds.minY + 1
  const cropWidth =
    sourceForegroundBounds.maxXInclusive - sourceForegroundBounds.minX + 1
  const cropHeight =
    sourceForegroundBounds.maxYInclusive - sourceForegroundBounds.minY + 1
  const normalizedSource = await sharp(sourcePath)
    .extract({
      left: sourceForegroundBounds.minX,
      top: sourceForegroundBounds.minY,
      width: cropWidth,
      height: cropHeight
    })
    .resize(targetWidth, targetHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const output = Buffer.alloc(master.info.width * master.info.height * 4)
  let backgroundFallbackPixelCount = 0
  const edgeBackgroundThreshold = Math.max(72, backgroundThreshold * 5)
  const canonicalEdgeFallbackRadius = 3
  const foregroundPaletteMedian = sampleForegroundPalette(
    normalizedSource.data,
    normalizedSource.info,
    background,
    backgroundThreshold
  )
  for (let y = 0; y < master.info.height; y += 1) {
    for (let x = 0; x < master.info.width; x += 1) {
      const targetPixel = y * master.info.width + x
      const targetOffset = targetPixel * 4
      const alpha = masterAlpha[targetPixel]
      if (alpha === 0) continue

      const sourceX = x - masterAlphaBounds.minX
      const sourceY = y - masterAlphaBounds.minY
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= normalizedSource.info.width ||
        sourceY >= normalizedSource.info.height
      ) {
        throw new Error("normalized shell source does not cover canonical alpha bounds")
      }
      const sourceOffset =
        (sourceY * normalizedSource.info.width + sourceX) *
        normalizedSource.info.channels
      const shouldRepairEdge =
        isNearTransparentEdge(
          masterAlpha,
          x,
          y,
          master.info.width,
          master.info.height,
          canonicalEdgeFallbackRadius
        ) &&
        (
          colorDistance(normalizedSource.data, sourceOffset, background) <
            edgeBackgroundThreshold ||
          luminanceAt(normalizedSource.data, sourceOffset) < 24
        )
      const repairedRgb = shouldRepairEdge
        ? findNearestValidSourceRgb({
            data: normalizedSource.data,
            info: normalizedSource.info,
            x: sourceX,
            y: sourceY,
            background,
            backgroundThreshold,
            maxRadius: 48
          }) ?? foregroundPaletteMedian
        : undefined
      output[targetOffset] = repairedRgb?.[0] ?? normalizedSource.data[sourceOffset]
      output[targetOffset + 1] = repairedRgb?.[1] ?? normalizedSource.data[sourceOffset + 1]
      output[targetOffset + 2] = repairedRgb?.[2] ?? normalizedSource.data[sourceOffset + 2]
      output[targetOffset + 3] = alpha
      if (shouldRepairEdge) backgroundFallbackPixelCount += 1
    }
  }

  await sharp(output, {
    raw: {
      width: master.info.width,
      height: master.info.height,
      channels: 4
    }
  }).png({ compressionLevel: 9 }).toFile(outputPath)

  const outputFile = await readFile(outputPath)
  const outputAlpha = extractAlpha(output, {
    width: master.info.width,
    height: master.info.height,
    channels: 4
  })
  return {
    normalizerVersion: "room-v3-shell-canonical-alpha-normalizer-v1",
    canvasSize: {
      width: master.info.width,
      height: master.info.height
    },
    masterAlphaBounds,
    sourceForegroundBounds,
    backgroundRgb: background,
    backgroundThreshold,
    edgeBackgroundThreshold,
    canonicalEdgeFallbackRadius,
    foregroundPaletteMedian,
    backgroundFallbackPixelCount,
    alphaMaskMatchesMaster: outputAlpha.equals(masterAlpha),
    outputSha256: createHash("sha256").update(outputFile).digest("hex")
  }
}

function extractAlpha(data, info) {
  const alpha = Buffer.alloc(info.width * info.height)
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = data[pixel * info.channels + info.channels - 1]
  }
  return alpha
}

function findBounds(data, width, height, isForeground, channels = 1) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      const offset = pixel * channels
      if (!isForeground(data[offset], offset)) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX >= minX && maxY >= minY
    ? { minX, minY, maxXInclusive: maxX, maxYInclusive: maxY }
    : null
}

function sampleCornerBackground(data, info) {
  const patch = Math.max(1, Math.min(12, Math.floor(Math.min(info.width, info.height) / 4)))
  const samples = [[], [], []]
  const origins = [
    [0, 0],
    [info.width - patch, 0],
    [0, info.height - patch],
    [info.width - patch, info.height - patch]
  ]
  for (const [originX, originY] of origins) {
    for (let y = originY; y < originY + patch; y += 1) {
      for (let x = originX; x < originX + patch; x += 1) {
        const offset = (y * info.width + x) * info.channels
        for (let channel = 0; channel < 3; channel += 1) {
          samples[channel].push(data[offset + channel])
        }
      }
    }
  }
  return samples.map(median)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function colorDistance(data, offset, background) {
  return Math.max(
    Math.abs(data[offset] - background[0]),
    Math.abs(data[offset + 1] - background[1]),
    Math.abs(data[offset + 2] - background[2])
  )
}

function luminanceAt(data, offset) {
  return (
    0.2126 * data[offset] +
    0.7152 * data[offset + 1] +
    0.0722 * data[offset + 2]
  )
}

function isValidForegroundPixel(data, info, offset, background, threshold) {
  return (
    data[offset + info.channels - 1] > 32 &&
    colorDistance(data, offset, background) >= threshold &&
    luminanceAt(data, offset) >= 24
  )
}

function findNearestValidSourceRgb({
  data,
  info,
  x,
  y,
  background,
  backgroundThreshold,
  maxRadius
}) {
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(info.height - 1, y + radius); sampleY += 1) {
      for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(info.width - 1, x + radius); sampleX += 1) {
        if (
          sampleX !== x - radius &&
          sampleX !== x + radius &&
          sampleY !== y - radius &&
          sampleY !== y + radius
        ) {
          continue
        }
        const offset = (sampleY * info.width + sampleX) * info.channels
        if (
          isValidForegroundPixel(
            data,
            info,
            offset,
            background,
            backgroundThreshold
          )
        ) {
          return [data[offset], data[offset + 1], data[offset + 2]]
        }
      }
    }
  }
  return undefined
}

function sampleForegroundPalette(data, info, background, threshold) {
  const channels = [[], [], []]
  const pixelCount = info.width * info.height
  const stride = Math.max(1, Math.floor(pixelCount / 20000))
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * info.channels
    if (!isValidForegroundPixel(data, info, offset, background, threshold)) continue
    for (let channel = 0; channel < 3; channel += 1) {
      channels[channel].push(data[offset + channel])
    }
  }
  return channels.map(median)
}

function isNearTransparentEdge(alpha, x, y, width, height, radius) {
  if (
    x - radius < 0 ||
    y - radius < 0 ||
    x + radius >= width ||
    y + radius >= height
  ) {
    return true
  }
  for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += 1) {
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
      if (alpha[sampleY * width + sampleX] === 0) return true
    }
  }
  return false
}

function valueFor(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const args = process.argv.slice(2)
  const report = await normalizeRoomV3ShellCandidate({
    masterPath: valueFor(args, "--master"),
    sourcePath: valueFor(args, "--source"),
    outputPath: valueFor(args, "--out"),
    backgroundThreshold: Number(valueFor(args, "--threshold") ?? 18)
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
