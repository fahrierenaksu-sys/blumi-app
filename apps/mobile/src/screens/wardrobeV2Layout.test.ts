import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const screenSource = readFileSync(join(here, "WardrobeV2Screen.tsx"), "utf8")
const stylesSource = readFileSync(join(here, "wardrobeV2Styles.ts"), "utf8")

test("wardrobe keeps the studio header focused without the beta status pill", () => {
  assert.doesNotMatch(screenSource, /wardrobeReady|connectionPill/)
  assert.doesNotMatch(stylesSource, /connectionPill|connectionDot|connectionPillText|statusPill/)
})

test("wardrobe places the avatar preview above the product list without the retired side rail", () => {
  assert.match(stylesSource, /previewAndSlots:\s*\{[\s\S]*?flexDirection:\s*"column",/)
  assert.doesNotMatch(screenSource, /WardrobeEquippedSlotsRail/)
})

test("standard wardrobe view disables vertical scroll and bounce", () => {
  assert.match(screenSource, /scrollEnabled=\{useCompactVerticalFallback\}/)
  assert.match(screenSource, /bounces=\{useCompactVerticalFallback\}/)
  assert.match(screenSource, /alwaysBounceVertical=\{false\}/)
})

test("standard wardrobe composition reserves room for the first product row", () => {
  assert.match(screenSource, /size=\{180\}/)
  assert.match(screenSource, /stageHeight=\{228\}/)
  assert.match(stylesSource, /itemPreviewStage:\s*\{[\s\S]*?height:\s*88,/)
  assert.match(stylesSource, /itemCard:\s*\{[\s\S]*?minHeight:\s*164,[\s\S]*?padding:\s*8,/)
})

test("wardrobe keeps the preview uncluttered without the motion selector row", () => {
  assert.doesNotMatch(screenSource, /motionPreviewRow|wardrobe-motion-preview|PREVIEW_MOTION_MODES/)
  assert.doesNotMatch(stylesSource, /motionPreviewRow|motionPreviewButton/)
  assert.match(screenSource, /animationState="idle_front"/)
})
