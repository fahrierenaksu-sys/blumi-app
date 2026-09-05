import { mkdirSync, readFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"

import { PNG } from "pngjs"
import sharp from "sharp"

const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const motionRoot = join(roomRoot, "motion")
const stagingRoot = resolve("docs/avatar-motion-pipeline/male-motion-wave-staging/frames")
const qaRoot = resolve("docs/avatar-motion-pipeline/male-motion-wave-staging/qa")

const items = [
  ["Cream Basic Tee", "top", "avatar_room_top_male_cream_basic_tee_v1.png"],
  ["Dusty Navy Tee", "top", "avatar_room_top_male_dusty_navy_tee_v1.png"],
  ["Powder Blue Crew Tee", "top", "avatar_room_top_male_powder_blue_crew_tee_v1.png"],
  ["Sage Basic Tee", "top", "avatar_room_top_male_sage_basic_tee_v1.png"],
  ["Mist Blue Oxford Shirt", "top", "avatar_room_top_male_mist_blue_oxford_shirt_v1_alpha.png"],
  ["Soft Sage Linen Shirt", "top", "avatar_room_top_male_soft_sage_linen_shirt_v1_alpha.png"],
  ["Cocoa Varsity Jacket", "top", "avatar_room_top_male_cocoa_varsity_jacket_v1_alpha.png"],
  ["Dusty Navy Chore Jacket", "top", "avatar_room_top_male_dusty_navy_chore_jacket_v1_alpha.png"],
  ["Navy Straight Pants", "bottom", "avatar_room_bottom_male_navy_straight_pants_v1.png"],
  ["Mid Blue Straight Jeans", "bottom", "avatar_room_bottom_male_mid_blue_straight_jeans_v1_alpha.png"],
  ["Charcoal Tapered Chinos", "bottom", "avatar_room_bottom_male_charcoal_tapered_chinos_v1_alpha.png"],
  ["Warm Sand Relaxed Pants", "bottom", "avatar_room_bottom_male_warm_sand_relaxed_pants_v1_alpha.png"]
]

const prefixFor = (staticName) => basename(staticName, ".png")
  .replace(/^avatar_room_/, "room_avatar_")
  .replace(/_alpha$/, "")
const frameName = (prefix, pose, frame) =>
  `${prefix}_${pose}_front_f${String(frame).padStart(2, "0")}.png`
const escapeXml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")

const labelSvg = (label, kind, width, height) => Buffer.from(`
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff7fa"/>
    <text x="16" y="42" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#2c2030">${escapeXml(label)}</text>
    <text x="16" y="68" font-family="Arial, sans-serif" font-size="13" fill="#a04469">${kind.toUpperCase()} · W1 W2 W3 W4 SIT</text>
  </svg>
`)

const referenceName = (kind, pose, frame) => frameName(
  kind === "top"
    ? "room_avatar_top_male_powder_blue_crew_tee_v1"
    : "room_avatar_bottom_male_navy_straight_pants_v1",
  pose,
  frame
)

const composeFrame = async (kind, prefix, pose, frame) => {
  const base = join(motionRoot, frameName("room_avatar_base_male_light_v1", pose, frame))
  const shoes = join(motionRoot, frameName("room_avatar_shoes_male_milk_tea_court_v1", pose, frame))
  const top = kind === "top"
    ? join(stagingRoot, frameName(prefix, pose, frame))
    : join(motionRoot, referenceName("top", pose, frame))
  const bottom = kind === "bottom"
    ? join(stagingRoot, frameName(prefix, pose, frame))
    : join(motionRoot, referenceName("bottom", pose, frame))
  return sharp(base)
    .composite([{ input: shoes }, { input: bottom }, { input: top }])
    .png()
    .toBuffer()
}

const alphaDifference = (leftPath, rightPath) => {
  const left = PNG.sync.read(readFileSync(leftPath))
  const right = PNG.sync.read(readFileSync(rightPath))
  const difference = new PNG({ width: left.width, height: left.height })
  for (let pixel = 0; pixel < left.width * left.height; pixel += 1) {
    const offset = pixel * 4
    const leftAlpha = left.data[offset + 3] ?? 0
    const rightAlpha = right.data[offset + 3] ?? 0
    const delta = Math.abs(leftAlpha - rightAlpha)
    if (delta <= 16) continue
    const leftOnly = leftAlpha > rightAlpha
    difference.data[offset] = leftOnly ? 62 : 236
    difference.data[offset + 1] = leftOnly ? 126 : 74
    difference.data[offset + 2] = leftOnly ? 245 : 142
    difference.data[offset + 3] = Math.max(120, delta)
  }
  return PNG.sync.write(difference)
}

const poses = [["walking", 1], ["walking", 2], ["walking", 3], ["walking", 4], ["sitting", 1]]
const frameWidth = 256
const frameHeight = 384
const labelWidth = 220
const gap = 8
const headerHeight = 72
const rowGap = 12
const sheetWidth = labelWidth + poses.length * frameWidth + (poses.length - 1) * gap
const sheetHeight = headerHeight + items.length * frameHeight + (items.length - 1) * rowGap

mkdirSync(qaRoot, { recursive: true })

const fullComposites = []
for (const [index, [label, kind, staticName]] of items.entries()) {
  const prefix = prefixFor(staticName)
  const top = headerHeight + index * (frameHeight + rowGap)
  fullComposites.push({ input: labelSvg(label, kind, labelWidth, frameHeight), left: 0, top })
  for (const [poseIndex, [pose, frame]] of poses.entries()) {
    fullComposites.push({
      input: await composeFrame(kind, prefix, pose, frame),
      left: labelWidth + poseIndex * (frameWidth + gap),
      top
    })
  }
}

const headerSvg = (width) => Buffer.from(`
  <svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff7fa"/>
    <text x="16" y="30" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#2c2030">Male capsule motion staging · 4W + 1S</text>
    <text x="16" y="54" font-family="Arial, sans-serif" font-size="13" fill="#755f78">Canonical male base · staged only · shoes under pants · top over waist</text>
  </svg>
`)
fullComposites.unshift({ input: headerSvg(sheetWidth), left: 0, top: 0 })

await sharp({
  create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "#fff7fa" }
}).composite(fullComposites).png().toFile(join(qaRoot, "2026-07-14-male-motion-wave-full-contact-sheet.png"))

const closeFrameWidth = 240
const closeLabelWidth = 220
const closeRows = []
let closeHeight = headerHeight
for (const [label, kind, staticName] of items) {
  const crop = kind === "top"
    ? { left: 68, top: 208, width: 120, height: 104 }
    : { left: 68, top: 280, width: 120, height: 74 }
  const closeFrameHeight = crop.height * 2
  const rowHeight = Math.max(closeFrameHeight, 100)
  const prefix = prefixFor(staticName)
  closeRows.push({ input: labelSvg(label, `${kind} contact`, closeLabelWidth, rowHeight), left: 0, top: closeHeight })
  for (const [poseIndex, [pose, frame]] of poses.entries()) {
    const composed = await composeFrame(kind, prefix, pose, frame)
    const cropped = await sharp(composed).extract(crop).resize({ width: crop.width * 2, height: crop.height * 2, kernel: "nearest" }).png().toBuffer()
    closeRows.push({ input: cropped, left: closeLabelWidth + poseIndex * (closeFrameWidth + gap), top: closeHeight })
  }
  closeHeight += rowHeight + rowGap
}

const closeWidth = closeLabelWidth + poses.length * closeFrameWidth + (poses.length - 1) * gap
closeRows.unshift({ input: headerSvg(closeWidth), left: 0, top: 0 })
await sharp({
  create: { width: closeWidth, height: closeHeight, channels: 4, background: "#fff7fa" }
}).composite(closeRows).png().toFile(join(qaRoot, "2026-07-14-male-motion-wave-contact-closeups.png"))

const diffFrameWidth = 240
const diffLabelWidth = 220
const diffPairs = [[1, 2], [2, 3], [3, 4], [1, "sit"]]
const diffRows = []
let diffHeight = headerHeight
for (const [label, kind, staticName] of items) {
  const crop = kind === "top"
    ? { left: 68, top: 208, width: 120, height: 104 }
    : { left: 68, top: 280, width: 120, height: 74 }
  const rowHeight = Math.max(crop.height * 2, 100)
  const prefix = prefixFor(staticName)
  diffRows.push({ input: labelSvg(label, `${kind} alpha deltas`, diffLabelWidth, rowHeight), left: 0, top: diffHeight })
  for (const [pairIndex, [leftFrame, rightFrame]] of diffPairs.entries()) {
    const leftPath = join(stagingRoot, frameName(prefix, "walking", leftFrame))
    const rightPath = rightFrame === "sit"
      ? join(stagingRoot, frameName(prefix, "sitting", 1))
      : join(stagingRoot, frameName(prefix, "walking", rightFrame))
    const difference = alphaDifference(leftPath, rightPath)
    const cropped = await sharp(difference).extract(crop).resize({ width: crop.width * 2, height: crop.height * 2, kernel: "nearest" }).flatten({ background: "#fff7fa" }).png().toBuffer()
    diffRows.push({ input: cropped, left: diffLabelWidth + pairIndex * (diffFrameWidth + gap), top: diffHeight })
  }
  diffHeight += rowHeight + rowGap
}

const diffWidth = diffLabelWidth + diffPairs.length * diffFrameWidth + (diffPairs.length - 1) * gap
diffRows.unshift({ input: headerSvg(diffWidth), left: 0, top: 0 })
await sharp({
  create: { width: diffWidth, height: diffHeight, channels: 4, background: "#fff7fa" }
}).composite(diffRows).png().toFile(join(qaRoot, "2026-07-14-male-motion-wave-frame-differences.png"))

const pants = items.filter(([, kind]) => kind === "bottom")
const pantsCrop = { left: 98, top: 284, width: 60, height: 64 }
const pantsScale = 6
const pantsFrameWidth = pantsCrop.width * pantsScale
const pantsFrameHeight = pantsCrop.height * pantsScale
const pantsLabelWidth = 220
const pantsRows = []
let pantsHeight = headerHeight
for (const [label, kind, staticName] of pants) {
  const prefix = prefixFor(staticName)
  pantsRows.push({
    input: labelSvg(label, `${kind} 6x contact`, pantsLabelWidth, pantsFrameHeight),
    left: 0,
    top: pantsHeight
  })
  for (const [poseIndex, [pose, frame]] of poses.entries()) {
    const composed = await composeFrame(kind, prefix, pose, frame)
    const cropped = await sharp(composed)
      .extract(pantsCrop)
      .resize({
        width: pantsFrameWidth,
        height: pantsFrameHeight,
        kernel: "nearest"
      })
      .png()
      .toBuffer()
    pantsRows.push({
      input: cropped,
      left: pantsLabelWidth + poseIndex * (pantsFrameWidth + gap),
      top: pantsHeight
    })
  }
  pantsHeight += pantsFrameHeight + rowGap
}

const pantsWidth = pantsLabelWidth + poses.length * pantsFrameWidth + (poses.length - 1) * gap
pantsRows.unshift({ input: headerSvg(pantsWidth), left: 0, top: 0 })
await sharp({
  create: { width: pantsWidth, height: pantsHeight, channels: 4, background: "#fff7fa" }
}).composite(pantsRows).png().toFile(join(
  qaRoot,
  "2026-07-14-male-motion-wave-pants-6x.png"
))

console.log(`rendered motion QA sheets in ${qaRoot}`)
