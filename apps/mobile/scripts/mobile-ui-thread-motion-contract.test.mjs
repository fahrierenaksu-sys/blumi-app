// Pins the UI-thread motion migrations of 2026-09-30 (animation risk audit):
// small surfaces whose motion used to run on the JS thread or remount views.
// Behaviour is proven where it is pure (node model tests); these pins keep
// the wiring from sliding back to JS-driven animation.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(resolve(mobileRoot, path), "utf8")

test("toast progress shrinks with a native-driver scaleX, not a JS width animation", () => {
  const toast = read("src/ui/toast.tsx")
  assert.doesNotMatch(toast, /useNativeDriver:\s*false/)
  assert.doesNotMatch(toast, /width: progressWidth/)
  assert.match(toast, /transform: \[\{ scaleX: progressAnim \}\]/)
  assert.match(toast, /transformOrigin: "left center"/)
})

test("field focus colour crossfades on the UI thread and keeps the error colour", () => {
  const field = read("src/ui/fieldInput.tsx")
  assert.doesNotMatch(field, /useNativeDriver:\s*false|Animated\.spring/)
  assert.match(field, /const FIELD_FOCUS_COLOR_DURATION_MS = 120/)
  assert.match(field, /interpolateColor\(focusProgress\.value, \[0, 1\], \[FIELD_BORDER_COLOR, FIELD_FOCUSED_BORDER_COLOR\]\)/)
  assert.match(field, /borderColor: hasError\s*\?\s*FIELD_ERROR_BORDER_COLOR/)
})

test("setup keyboard collapse animates layout on the UI thread except under Reduce Motion", () => {
  const shell = read("src/features/session/setupFlow/BlumiSetupShell.tsx")
  assert.doesNotMatch(shell, /requestAnimationFrame\(/)
  assert.match(shell, /const animateKeyboardLayout = keyboardMotion && !reduceMotion/)
  assert.match(shell, /entering=\{keyboardEntering\}\s*exiting=\{keyboardExiting\}\s*layout=\{keyboardLayout\}/)
  assert.match(shell, /<Animated\.View layout=\{keyboardLayout\} style=\{styles\.keyboardSlot\}>/)
})

test("wardrobe carousel scroll and thumb stay on the UI thread; one list for every category", () => {
  const carousel = read("src/features/avatarV2/wardrobe/useWardrobeCarousel.ts")
  const list = read("src/features/avatarV2/wardrobe/WardrobeCatalogList.tsx")
  const thumb = read("src/screens/components/WardrobeCarouselProgress.tsx")
  assert.match(carousel, /useAnimatedScrollHandler\(\{\s*onScroll: \(event\) => \{\s*carouselOffsetX\.value = event\.contentOffset\.x/)
  assert.doesNotMatch(carousel, /Animated\.event|useNativeDriver/)
  // The accessibility value still updates on settle only.
  assert.match(carousel, /onMomentumEnd: \(event\) => \{\s*scheduleOnRN\(handleCarouselSettled/)
  assert.doesNotMatch(list, /key=\{activeCategory\}/)
  assert.match(list, /scrollToOffset\(\{ offset: 0, animated: false \}\)/)
  assert.match(thumb, /interpolate\(offsetX\.value, \[0, maxScroll\], \[0, maxTranslate\], Extrapolation\.CLAMP\)/)
})
