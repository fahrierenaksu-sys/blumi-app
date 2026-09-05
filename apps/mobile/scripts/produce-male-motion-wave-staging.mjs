import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"

import { PNG } from "pngjs"

const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const liveMotionRoot = join(roomRoot, "motion")
const wave2Root = resolve("docs/avatar-motion-pipeline/male-wave2-static-qa")
const outputRoot = resolve("docs/avatar-motion-pipeline/male-motion-wave-staging/frames")

const items = [
  ["top", "avatar_room_top_male_cream_basic_tee_v1.png"],
  ["top", "avatar_room_top_male_dusty_navy_tee_v1.png"],
  ["top", "avatar_room_top_male_powder_blue_crew_tee_v1.png"],
  ["top", "avatar_room_top_male_sage_basic_tee_v1.png"],
  ["top", "avatar_room_top_male_mist_blue_oxford_shirt_v1_alpha.png"],
  ["top", "avatar_room_top_male_soft_sage_linen_shirt_v1_alpha.png"],
  ["top", "avatar_room_top_male_cocoa_varsity_jacket_v1_alpha.png"],
  ["top", "avatar_room_top_male_dusty_navy_chore_jacket_v1_alpha.png"],
  ["bottom", "avatar_room_bottom_male_navy_straight_pants_v1.png"],
  ["bottom", "avatar_room_bottom_male_mid_blue_straight_jeans_v1_alpha.png"],
  ["bottom", "avatar_room_bottom_male_charcoal_tapered_chinos_v1_alpha.png"],
  ["bottom", "avatar_room_bottom_male_warm_sand_relaxed_pants_v1_alpha.png"]
]

const references = {
  top: {
    staticName: "avatar_room_top_male_powder_blue_crew_tee_v1.png",
    motionPrefix: "room_avatar_top_male_powder_blue_crew_tee_v1"
  },
  bottom: {
    staticName: "avatar_room_bottom_male_navy_straight_pants_v1.png",
    motionPrefix: "room_avatar_bottom_male_navy_straight_pants_v1"
  }
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const offsetAt = (image, x, y) => (y * image.width + x) * 4
const alphaAt = (image, x, y) => image.data[offsetAt(image, x, y) + 3] ?? 0
const readPng = (path) => PNG.sync.read(readFileSync(path))

const locateStatic = (filename) => {
  const livePath = join(roomRoot, filename)
  if (existsSync(livePath)) return livePath
  const stagedPath = join(wave2Root, filename)
  if (existsSync(stagedPath)) return stagedPath
  throw new Error(`approved static candidate not found: ${filename}`)
}

const visibleBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("source has no visible pixels")
  return [minX, minY, maxX, maxY]
}

const opaqueRuns = (image, y, threshold = 16) => {
  const runs = []
  let start = null
  for (let x = 0; x <= image.width; x += 1) {
    const visible = x < image.width && alphaAt(image, x, y) > threshold
    if (visible && start === null) start = x
    if (!visible && start !== null) {
      runs.push([start, x - 1])
      start = null
    }
  }
  return runs
}

const samplePremultiplied = (image, x, y) => {
  const x0 = clamp(Math.floor(x), 0, image.width - 1)
  const y0 = clamp(Math.floor(y), 0, image.height - 1)
  const x1 = Math.min(image.width - 1, x0 + 1)
  const y1 = Math.min(image.height - 1, y0 + 1)
  const xWeight = x - Math.floor(x)
  const yWeight = y - Math.floor(y)
  const samples = [
    [x0, y0, (1 - xWeight) * (1 - yWeight)],
    [x1, y0, xWeight * (1 - yWeight)],
    [x0, y1, (1 - xWeight) * yWeight],
    [x1, y1, xWeight * yWeight]
  ]
  let alpha = 0
  let red = 0
  let green = 0
  let blue = 0
  for (const [sampleX, sampleY, weight] of samples) {
    const offset = offsetAt(image, sampleX, sampleY)
    const sampleAlpha = (image.data[offset + 3] ?? 0) / 255
    const weightedAlpha = weight * sampleAlpha
    alpha += weightedAlpha
    red += (image.data[offset] ?? 0) * weightedAlpha
    green += (image.data[offset + 1] ?? 0) * weightedAlpha
    blue += (image.data[offset + 2] ?? 0) * weightedAlpha
  }
  if (alpha <= 0.001) return [0, 0, 0, 0]
  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round(alpha * 255)
  ]
}

const normalizeTransparentPixels = (image) => {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if ((image.data[offset + 3] ?? 0) !== 0) continue
    image.data[offset] = 0
    image.data[offset + 1] = 0
    image.data[offset + 2] = 0
  }
  return image
}

const nearestPantPixel = (image, originX, originY) => {
  for (let radius = 1; radius <= 24; radius += 1) {
    for (let y = originY - radius; y <= originY + radius; y += 1) {
      if (y < 0 || y >= image.height) continue
      for (let x = originX - radius; x <= originX + radius; x += 1) {
        if (x < 0 || x >= image.width) continue
        if (
          Math.abs(x - originX) !== radius &&
          Math.abs(y - originY) !== radius
        ) continue
        const offset = offsetAt(image, x, y)
        if ((image.data[offset + 3] ?? 0) <= 16) continue
        return [
          image.data[offset] ?? 0,
          image.data[offset + 1] ?? 0,
          image.data[offset + 2] ?? 0,
          image.data[offset + 3] ?? 0
        ]
      }
    }
  }
  throw new Error(`pant wrap has no nearby painted sample at ${originX},${originY}`)
}

const sealPantBodyWrap = (image, bodyMotion, canonicalPantsMotion) => {
  const source = PNG.sync.read(PNG.sync.write(image))
  for (let y = 288; y <= 346; y += 1) {
    for (let x = 106; x <= 150; x += 1) {
      if (
        alphaAt(bodyMotion, x, y) <= 16 ||
        alphaAt(canonicalPantsMotion, x, y) <= 16 ||
        alphaAt(source, x, y) >= alphaAt(canonicalPantsMotion, x, y)
      ) continue
      const sourceOffset = offsetAt(source, x, y)
      const [red, green, blue] = alphaAt(source, x, y) > 16
        ? [
          source.data[sourceOffset] ?? 0,
          source.data[sourceOffset + 1] ?? 0,
          source.data[sourceOffset + 2] ?? 0
        ]
        : nearestPantPixel(source, x, y)
      const offset = offsetAt(image, x, y)
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = alphaAt(canonicalPantsMotion, x, y)
    }
  }
  return normalizeTransparentPixels(image)
}

const fittedRuns = (candidateRuns, referenceStaticRuns, referenceMotionRuns) => {
  if (
    candidateRuns.length > 0 &&
    candidateRuns.length === referenceStaticRuns.length &&
    referenceStaticRuns.length === referenceMotionRuns.length &&
    candidateRuns.length <= 3
  ) {
    return candidateRuns.map(([candidateStart, candidateEnd], index) => {
      const [staticStart, staticEnd] = referenceStaticRuns[index]
      const [motionStart, motionEnd] = referenceMotionRuns[index]
      const candidateWidth = candidateEnd - candidateStart + 1
      const staticWidth = staticEnd - staticStart + 1
      const motionWidth = motionEnd - motionStart + 1
      const targetWidth = Math.max(1, Math.round(motionWidth * candidateWidth / staticWidth))
      const candidateCenter = (candidateStart + candidateEnd) / 2
      const staticCenter = (staticStart + staticEnd) / 2
      const motionCenter = (motionStart + motionEnd) / 2
      const targetCenter = motionCenter + candidateCenter - staticCenter
      const targetStart = Math.round(targetCenter - (targetWidth - 1) / 2)
      return {
        sourceStart: candidateStart,
        sourceEnd: candidateEnd,
        targetStart,
        targetEnd: targetStart + targetWidth - 1
      }
    })
  }

  const candidateStart = candidateRuns[0]?.[0]
  const candidateEnd = candidateRuns.at(-1)?.[1]
  const staticStart = referenceStaticRuns[0]?.[0]
  const staticEnd = referenceStaticRuns.at(-1)?.[1]
  const motionStart = referenceMotionRuns[0]?.[0]
  const motionEnd = referenceMotionRuns.at(-1)?.[1]
  if ([candidateStart, candidateEnd, staticStart, staticEnd, motionStart, motionEnd].some((value) => value === undefined)) {
    return []
  }
  const targetWidth = Math.max(
    1,
    Math.round((motionEnd - motionStart + 1) * (candidateEnd - candidateStart + 1) / (staticEnd - staticStart + 1))
  )
  const targetCenter = (motionStart + motionEnd) / 2 +
    (candidateStart + candidateEnd - staticStart - staticEnd) / 2
  const targetStart = Math.round(targetCenter - (targetWidth - 1) / 2)
  return [{
    sourceStart: candidateStart,
    sourceEnd: candidateEnd,
    targetStart,
    targetEnd: targetStart + targetWidth - 1
  }]
}

const outerEdges = (runs) => runs.length === 0
  ? undefined
  : [runs[0][0], runs.at(-1)[1]]

const interpolate = (start, end, ratio) => start + (end - start) * ratio

const deformToPose = (candidate, referenceStatic, referenceMotion, kind, useSmoothTopMesh) => {
  const output = new PNG({ width: 256, height: 384 })
  const candidateBounds = visibleBounds(candidate)
  const staticBounds = visibleBounds(referenceStatic)
  const motionBounds = visibleBounds(referenceMotion)
  const targetMinX = clamp(
    motionBounds[0] + candidateBounds[0] - staticBounds[0],
    0,
    255
  )
  const targetMaxX = clamp(
    motionBounds[2] + candidateBounds[2] - staticBounds[2],
    targetMinX,
    255
  )
  const topDelta = candidateBounds[1] - staticBounds[1]
  const bottomDelta = candidateBounds[3] - staticBounds[3]
  const targetMinY = clamp(motionBounds[1] + topDelta, 0, 383)
  const targetMaxY = clamp(motionBounds[3] + bottomDelta, targetMinY, 383)
  const targetHeight = Math.max(1, targetMaxY - targetMinY)
  const topControlRatios = [0, 0.12, 0.25, 0.4, 0.6, 0.8, 1]
  const topControls = kind === "top"
    ? topControlRatios.map((ratio) => {
      const candidateY = Math.round(candidateBounds[1] + ratio * (candidateBounds[3] - candidateBounds[1]))
      const staticY = Math.round(staticBounds[1] + ratio * (staticBounds[3] - staticBounds[1]))
      const motionY = Math.round(motionBounds[1] + ratio * (motionBounds[3] - motionBounds[1]))
      const candidateEdges = outerEdges(opaqueRuns(candidate, candidateY))
      const staticEdges = outerEdges(opaqueRuns(referenceStatic, staticY))
      const motionEdges = outerEdges(opaqueRuns(referenceMotion, motionY))
      if (!candidateEdges || !staticEdges || !motionEdges) return undefined
      return {
        ratio,
        leftDelta: motionEdges[0] - staticEdges[0],
        rightDelta: motionEdges[1] - staticEdges[1]
      }
    }).filter(Boolean)
    : []

  const topSpanAt = (ratio) => {
    const rightIndex = topControls.findIndex((control) => control.ratio >= ratio)
    if (rightIndex <= 0) return topControls[0]
    if (rightIndex === -1) return topControls.at(-1)
    const leftControl = topControls[rightIndex - 1]
    const rightControl = topControls[rightIndex]
    const localRatio = (ratio - leftControl.ratio) / (rightControl.ratio - leftControl.ratio)
    return {
      leftDelta: interpolate(leftControl.leftDelta, rightControl.leftDelta, localRatio),
      rightDelta: interpolate(leftControl.rightDelta, rightControl.rightDelta, localRatio)
    }
  }

  for (let targetY = targetMinY; targetY <= targetMaxY; targetY += 1) {
    const ratio = (targetY - targetMinY) / targetHeight
    const candidateY = candidateBounds[1] + ratio * (candidateBounds[3] - candidateBounds[1])
    const staticY = Math.round(staticBounds[1] + ratio * (staticBounds[3] - staticBounds[1]))
    const motionY = Math.round(motionBounds[1] + ratio * (motionBounds[3] - motionBounds[1]))
    const candidateRuns = opaqueRuns(candidate, Math.round(candidateY))
    const referenceStaticRuns = opaqueRuns(referenceStatic, staticY)
    const referenceMotionRuns = opaqueRuns(referenceMotion, motionY)
    const runs = kind === "top" && useSmoothTopMesh
      ? (() => {
        const candidateEdges = outerEdges(candidateRuns)
        const span = topSpanAt(ratio)
        if (!candidateEdges || !span) return []
        return [{
          sourceStart: candidateEdges[0],
          sourceEnd: candidateEdges[1],
          targetStart: Math.round(candidateEdges[0] + span.leftDelta),
          targetEnd: Math.round(candidateEdges[1] + span.rightDelta)
        }]
      })()
      : fittedRuns(candidateRuns, referenceStaticRuns, referenceMotionRuns)

    for (const { sourceStart, sourceEnd, targetStart, targetEnd } of runs) {
      const fittedStart = clamp(targetStart, targetMinX, targetMaxX)
      const fittedEnd = clamp(targetEnd, fittedStart, targetMaxX)
      const targetWidth = Math.max(1, fittedEnd - fittedStart)
      for (let targetX = fittedStart; targetX <= fittedEnd; targetX += 1) {
        if (targetX < 0 || targetX >= output.width) continue
        const xRatio = (targetX - fittedStart) / targetWidth
        const candidateX = sourceStart + xRatio * (sourceEnd - sourceStart)
        const pixel = samplePremultiplied(candidate, candidateX, candidateY)
        const offset = offsetAt(output, targetX, targetY)
        for (let channel = 0; channel < 4; channel += 1) output.data[offset + channel] = pixel[channel]
      }
    }
  }

  return normalizeTransparentPixels(output)
}

mkdirSync(outputRoot, { recursive: true })

for (const [kind, staticName] of items) {
  const candidate = readPng(locateStatic(staticName))
  const reference = references[kind]
  const referenceStatic = readPng(join(roomRoot, reference.staticName))
  const outputPrefix = basename(staticName, ".png")
    .replace(/^avatar_room_/, "room_avatar_")
    .replace(/_alpha$/, "")
  const poses = [
    ...[1, 2, 3, 4].map((frame) => ["walking", frame]),
    ["sitting", 1]
  ]

  for (const [pose, frame] of poses) {
    const frameNumber = String(frame).padStart(2, "0")
    const referenceMotion = readPng(join(
      liveMotionRoot,
      `${reference.motionPrefix}_${pose}_front_f${frameNumber}.png`
    ))
    const isCanonicalReference = staticName === reference.staticName
    const useSmoothTopMesh = kind === "top" && !/(?:basic_tee|navy_tee|crew_tee)/.test(staticName)
    const deformedOutput = isCanonicalReference
      ? normalizeTransparentPixels(PNG.sync.read(PNG.sync.write(referenceMotion)))
      : deformToPose(candidate, referenceStatic, referenceMotion, kind, useSmoothTopMesh)
    const output = kind === "bottom" && !isCanonicalReference
      ? sealPantBodyWrap(
        deformedOutput,
        readPng(join(
          liveMotionRoot,
          `room_avatar_base_male_light_v1_${pose}_front_f${frameNumber}.png`
        )),
        referenceMotion
      )
      : deformedOutput
    const outputName = `${outputPrefix}_${pose}_front_f${frameNumber}.png`
    writeFileSync(join(outputRoot, outputName), PNG.sync.write(output))
  }
}

console.log(`produced ${items.length * 5} deterministic male motion frames in ${outputRoot}`)
