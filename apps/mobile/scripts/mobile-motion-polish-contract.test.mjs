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

  assert.match(source, /AccessibilityInfo/)
  assert.match(source, /export function useReducedMotion/)
  assert.match(source, /useState\(true\)/)
  assert.match(source, /isReduceMotionEnabled\(\)/)
  assert.match(source, /"reduceMotionChanged"/)
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

test("welcome motion has an instant reduced-motion path", () => {
  const source = readMobileFile("src/screens/WelcomeScreen.tsx")

  assert.match(source, /useReducedMotion/)
  assert.match(source, /<AnimatedDot[^>]*reduceMotion=\{reduceMotion\}/)
  assert.match(source, /if \(reduceMotion\) \{[\s\S]*?setCurrentStep\(step\)/)
})

test("account and shop selection changes use restrained shared transitions", () => {
  const register = readMobileFile("src/screens/RegisterScreen.tsx")
  const profile = readMobileFile("src/screens/ProfileSetupScreen.tsx")
  const shop = readMobileFile("src/screens/CosmeticShopScreen.tsx")

  assert.match(register, /useSelectionTransition\(flow\.stage/)
  assert.match(register, /testID="register-motion-card"/)
  assert.match(profile, /useSelectionTransition\(gender/)
  assert.match(profile, /testID="profile-avatar-motion"/)
  assert.match(shop, /useSelectionTransition\(selectedProduct\?\.id/)
  assert.match(shop, /testID="shop-preview-motion"/)
  assert.match(shop, /useReducedMotion/)
})
