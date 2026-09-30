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
