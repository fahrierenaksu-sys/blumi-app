import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const wardrobeFolder = join(here, "../features/avatarV2/wardrobe")
// The screen composes components from features/avatarV2/wardrobe; layout
// contracts read the screen and every module it delegates to.
const screenSource = [
  join(here, "WardrobeV2Screen.tsx"),
  ...readdirSync(wardrobeFolder)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file) && file !== "wardrobeV2Styles.ts")
    .sort()
    .map((file) => join(wardrobeFolder, file))
].map((file) => readFileSync(file, "utf8")).join("\n")
const stylesSource = readFileSync(join(here, "../features/avatarV2/wardrobe/wardrobeV2Styles.ts"), "utf8")

test("wardrobe keeps the studio header focused without the beta status pill", () => {
  assert.doesNotMatch(screenSource, /wardrobeReady|connectionPill/)
  assert.doesNotMatch(stylesSource, /connectionPill|connectionDot|connectionPillText|statusPill/)
})

test("wardrobe places the character stage above a glass panel without the retired side rail", () => {
  assert.doesNotMatch(screenSource, /WardrobeEquippedSlotsRail/)
  const stage = screenSource.indexOf("<WardrobePreviewStage")
  const panel = screenSource.indexOf('<WardrobeGlass tone="panel"')
  assert.ok(stage > 0 && panel > stage, "the panel follows the stage")
  assert.match(stylesSource, /panelShell:\s*\{[\s\S]*?marginHorizontal:\s*WARDROBE_PANEL_MARGIN,/)
  assert.match(stylesSource, /panelShell:\s*\{[\s\S]*?borderRadius:\s*30,/)
})

test("wardrobe shows its headline with a back button and a Save capsule, and no step indicator", () => {
  assert.match(screenSource, /copy\.headline/)
  assert.match(screenSource, /copy\.tagline/)
  assert.match(screenSource, /testID="wardrobe-back"/)
  assert.match(screenSource, /testID="wardrobe-done"/)
  assert.doesNotMatch(screenSource, /copy\.progress|progressPill/)
  assert.doesNotMatch(screenSource, /Tasarım önizlemesi|örnek envanter/)
})

test("the product list pages three-column rows sideways with names under the cards", () => {
  assert.match(screenSource, /const GRID_COLUMNS = 3/)
  assert.match(screenSource, /chunkWardrobePages\(page, GRID_COLUMNS\)/)
  assert.match(screenSource, /horizontal\s+pagingEnabled/)
  assert.match(screenSource, /pageCount > 1 \? \(/)
  assert.match(screenSource, /onPageChange=\{setCatalogPage\}/)
  assert.doesNotMatch(screenSource, /sortWardrobeItemsEquippedFirst/)
  assert.match(stylesSource, /itemName:\s*\{[\s\S]*?marginTop:\s*6,/)
  assert.match(screenSource, /\{item\.name\}/)
})

test("glass falls back to a solid surface for Reduce Transparency or a missing native blur", () => {
  assert.match(screenSource, /useReduceTransparency\(\)/)
  assert.match(screenSource, /!reduceTransparency && OptionalBlurView/)
  assert.match(screenSource, /panelSolid/)
  assert.doesNotMatch(screenSource, /from "expo-blur"/)
})

test("a category change swaps products while they are invisible, on the UI thread (WRD-1/WRD-2)", () => {
  const motion = readFileSync(join(wardrobeFolder, "useWardrobeCategoryMotion.ts"), "utf8")
  const card = readFileSync(join(wardrobeFolder, "WardrobeCatalogCard.tsx"), "utf8")
  assert.match(motion, /withTiming\(0, \{ duration: WARDROBE_CATALOG_FADE_OUT_MS \}, \(finished\) => \{\s*if \(finished\) scheduleOnRN\(setShownCategory, target\)/)
  assert.match(motion, /useLayoutEffect\(\(\) => \{[\s\S]*?withTiming\(1, \{ duration: WARDROBE_CATALOG_FADE_IN_MS \}\)/)
  assert.doesNotMatch(motion, /from "react-native"|Animated\.timing|requestAnimationFrame/)
  assert.match(screenSource, /catalogStyle=\{catalogTransition\.style\}/)
  assert.match(screenSource, /pointerEvents=\{switching \? "none" : "auto"\}/)
  assert.match(card, /transition=\{0\}/)
  assert.doesNotMatch(card, /thumbnailTransition/)
})

test("the stage sizes the canonical character from its measured area", () => {
  assert.match(screenSource, /getWardrobeStageLayout\(/)
  assert.match(screenSource, /animationState="idle_front"/)
  assert.match(screenSource, /showGlow=\{false\}/)
  assert.match(screenSource, /testID="wardrobe-zoom"/)
})

test("wardrobe keeps the preview uncluttered without the motion selector row", () => {
  assert.doesNotMatch(screenSource, /motionPreviewRow|wardrobe-motion-preview|PREVIEW_MOTION_MODES/)
  assert.doesNotMatch(stylesSource, /motionPreviewRow|motionPreviewButton/)
  assert.match(screenSource, /animationState="idle_front"/)
})
