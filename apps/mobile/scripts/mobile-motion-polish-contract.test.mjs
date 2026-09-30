import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const readMobileFile = (relativePath) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8")

test("shared motion hooks honor the operating system reduced-motion preference", () => {
  const source = readMobileFile("src/ui/animations.ts")
  const store = readMobileFile("src/ui/reducedMotionStore.ts")

  // One shared OS subscription (behaviour covered by reducedMotionStore.test.ts).
  assert.match(source, /createReducedMotionStore\(\{[\s\S]*?AccessibilityInfo\.isReduceMotionEnabled\(\)[\s\S]*?AccessibilityInfo\.addEventListener\(event, listener\)/)
  assert.match(source, /export function useReducedMotion/)
  assert.match(source, /useSyncExternalStore\(/)
  assert.match(store, /const UNRESOLVED: ReducedMotionPreference = Object\.freeze\(\{\s*reduceMotion: true,\s*isResolved: false/)
  assert.match(store, /"reduceMotionChanged"/)
  assert.match(source, /if \(reduceMotion\) \{[\s\S]*?setValue\(1\)/)
  assert.match(source, /export function useSelectionTransition/)
})

test("selection transitions establish their first frame before paint", () => {
  const source = readMobileFile("src/ui/animations.ts")
  const selectionSource = source.slice(source.indexOf("export function useSelectionTransition"))

  assert.match(selectionSource, /useLayoutEffect\(\(\) => \{[\s\S]*progress\.setValue\(0\)/)
  assert.doesNotMatch(
    selectionSource,
    /useEffect\(\(\) => \{[\s\S]*progress\.setValue\(0\)/,
    "a post-paint reset flashes the new onboarding panel before its transition begins"
  )
})

test("continuous pulse animation is suppressed for reduced motion", () => {
  const source = readMobileFile("src/ui/animations.ts")
  const pulseSource = source.slice(
    source.indexOf("export function usePulse"),
    source.indexOf("/* ── Fade In")
  )

  assert.match(pulseSource, /useReducedMotion\(\)/)
  assert.match(pulseSource, /if \(reduceMotion\)/)
  assert.match(pulseSource, /pulse\.setValue\(0\)/)
  // Opt-in bound; the default (-1, RN's own) keeps existing callers endless.
  assert.match(pulseSource, /iterations = -1 \} = options/)
  assert.match(pulseSource, /\{ iterations \}/)
})

test("shared entrance defaults come from the theme motion tokens", () => {
  const theme = readMobileFile("src/ui/theme.ts")
  const source = readMobileFile("src/ui/animations.ts")
  const animationBlock = theme.slice(theme.indexOf("  animation: {"), theme.indexOf("  opacity: {"))

  // Existing tokens stay as they were; the named springs are additive.
  assert.match(animationBlock, /spring: \{ damping: 20, stiffness: 300, mass: 1 \}/)
  assert.match(animationBlock, /durationEntrance: 350,/)
  // Reanimated `withSpring({ duration, dampingRatio })` configs.
  assert.match(animationBlock, /springSnappy: \{ duration: 350, dampingRatio: 0\.85 \}/)
  assert.match(animationBlock, /springGentleTimed: \{ duration: 500, dampingRatio: 1 \}/)
  assert.match(animationBlock, /springCelebrate: \{ duration: 550, dampingRatio: 0\.7 \}/)
  assert.match(animationBlock, /staggerMs: 35,/)

  const entranceSource = source.slice(
    source.indexOf("export function useEntranceAnimation"),
    source.indexOf("/* ── Staggered List Entrance")
  )
  const staggerSource = source.slice(
    source.indexOf("export function useStaggeredEntrance"),
    source.indexOf("/* ── Scale Bounce")
  )
  assert.match(source, /import \{ uiTheme \} from "\.\/theme"/)
  assert.match(
    entranceSource,
    /const \{ delay = 0, duration = uiTheme\.animation\.durationEntrance, translateY = 20 \} = options/,
    "the entrance default must follow the theme token instead of a private 500 ms"
  )
  assert.match(
    staggerSource,
    /const \{ staggerMs = uiTheme\.animation\.staggerMs, duration = 320, translateY = 20 \} = options/
  )
})

test("account and shop selection changes use restrained shared transitions", () => {
  const register = readMobileFile("src/screens/RegisterScreen.tsx")
  const registerSignIn = readMobileFile("src/features/session/register/RegisterSignInView.tsx")
  const shop = readMobileFile("src/screens/CosmeticShopScreen.tsx")
  const shopPreviewModel = readMobileFile("src/features/shop/screen/useShopPreviewModel.ts")
  const shopClosetBrowser = readMobileFile("src/features/shop/screen/ClosetBrowser.tsx")

  assert.match(register, /useSelectionTransition\(flow\.stage/)
  assert.match(registerSignIn, /testID="register-motion-card"/)
  assert.match(shopPreviewModel, /useSelectionTransition\(selectedProduct\?\.id/)
  assert.match(shop, /testID="shop-preview-motion"/)
  assert.match(shop, /shopMode === "avatar" \? undefined : previewTransition/)
  assert.match(shopClosetBrowser, /useReducedMotion/)
  assert.match(shopClosetBrowser, /animated: !reduceMotion/)
})

/** The body of `  name: {` in a StyleSheet, optionally after `const <scope> =`. */
function readStyleBlock(source, name, scope) {
  const from = scope ? source.indexOf(`const ${scope} = StyleSheet.create`) : 0
  assert.ok(from >= 0, `${scope} exists`)
  const open = source.indexOf(`\n  ${name}: {\n`, from)
  assert.ok(open >= 0, `${name} style exists`)
  const close = source.indexOf("\n  }", open + 1)
  return source.slice(open, close)
}

test("cards, sheets and bubbles use continuous (squircle) corners; circles stay circles", () => {
  const rounded = {
    "src/components/DiscoverCard.tsx": ["card", "heroBlock", "heroInfoPanel"],
    "src/features/chat/thread/chatThreadStyles.ts": ["bubble"],
    "src/features/chat/ChatRoomInviteCard.tsx": ["card"],
    "src/ui/toast.tsx": ["container", "gradient"],
    "src/screens/InboxScreen.tsx": ["cardStyles:card"],
    "src/features/shop/screen/shopScreenStyles.ts": ["showcaseCard", "closetBrowserCard", "productCard"],
    "src/features/shop/shopPreviewStyles.ts": [
      "previewCard",
      "previewStage",
      "shopRoomScenePreview",
      "avatarHeroTopPanel",
      "avatarHeroAction"
    ],
    "src/components/DiscoverFiltersBottomSheet.tsx": ["ageCard", "stepperButton", "footer"],
    "src/components/ReportModal.tsx": ["reasonCard"]
  }
  for (const [file, styles] of Object.entries(rounded)) {
    const source = readMobileFile(file)
    for (const entry of styles) {
      const [scope, name] = entry.includes(":") ? entry.split(":") : [undefined, entry]
      const block = readStyleBlock(source, name, scope)
      assert.match(block, /border\w*Radius:/, `${file} ${entry} is rounded`)
      assert.match(block, /borderCurve: "continuous"/, `${file} ${entry} uses continuous corners`)
    }
    // A squircle of a full circle or pill is not a circle.
    const blocks = source.split(/\n  (?=[A-Za-z0-9_]+: \{\n)/)
    for (const block of blocks) {
      if (/borderRadius: (?:uiTheme\.radius\.full|999)\b/.test(block)) {
        assert.doesNotMatch(block, /borderCurve/, `${file}: ${block.slice(0, block.indexOf(":"))} stays circular`)
      }
    }
  }

  // Every swipe-dismiss sheet (Report, Discover filters, …) gets the shape from the sheet itself.
  const sheet = readMobileFile("src/ui/SwipeDismissSheet.tsx")
  assert.match(sheet, /style=\{\[styles\.sheetShape, style, sheetStyle\]\}/)
  assert.match(readStyleBlock(sheet, "sheetShape"), /borderCurve: "continuous"/)
  for (const file of ["src/components/ReportModal.tsx", "src/components/DiscoverFiltersBottomSheet.tsx"]) {
    assert.match(readMobileFile(file), /<SwipeDismissSheet\b/, `${file} renders inside SwipeDismissSheet`)
  }
})
