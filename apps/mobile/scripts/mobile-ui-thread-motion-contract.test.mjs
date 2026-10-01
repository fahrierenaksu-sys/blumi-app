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

test("wardrobe uses one paged grid for every category and animates zoom on the UI thread", () => {
  const list = read("src/features/avatarV2/wardrobe/WardrobeCatalogList.tsx")
  const stage = read("src/features/avatarV2/wardrobe/WardrobePreviewStage.tsx")
  const motion = read("src/features/avatarV2/wardrobe/useWardrobeCategoryMotion.ts")
  assert.doesNotMatch(list, /key=\{activeCategory\}/)
  assert.match(list, /scrollToOffset\(\{ offset: 0, animated: false \}\)/)
  assert.match(stage, /useSharedValue\(1\)/)
  assert.match(stage, /reduceMotion\s*\?\s*target\s*:\s*withTiming\(target/)
  assert.doesNotMatch(motion, /requestAnimationFrame\(/)
})

test("press feedback and entrances have a non-moving Reduce Motion path from the shared store", () => {
  const helper = read("src/ui/animations.ts")
  assert.match(helper, /export function springPressScale\([\s\S]*?if \(reduceMotion\) \{\s*value\.stopAnimation\(\)\s*value\.setValue\(toValue\)/)
  for (const path of [
    "src/components/IncomingInviteCallout.tsx",
    "src/ui/vibeTilePicker.tsx",
    "src/screens/RoomDebriefScreen.tsx",
    "src/screens/ProfilePreviewScreen.tsx",
    "src/screens/ProfileEditScreen.tsx"
  ]) {
    const source = read(path)
    assert.match(source, /const reduceMotion = useReducedMotion\(\)/, path)
    assert.match(source, /springPressScale\(\w+, [^)]*, reduceMotion\)/, path)
    assert.doesNotMatch(source, /Animated\.spring\(\w*[sS]caleAnim/, path)
  }
  // Settings rows do not move at all: a pressed row tints like an iOS list (DSC-16).
  const settingsRow = read("src/features/settings/SettingsRow.tsx")
  assert.doesNotMatch(settingsRow, /scale/i)
  assert.match(settingsRow, /pressed && styles\.rowPressed/)
  // Entrances and the feedback pill fade in place (opacity only).
  assert.match(read("src/screens/RoomDebriefScreen.tsx"), /opacity: heroAnim,[\s\S]{0,120}transform: reduceMotion \? \[\] :/)
  assert.match(read("src/screens/ProfilePreviewScreen.tsx"), /opacity: contentAnim,[\s\S]{0,120}transform: reduceMotion \? \[\] :/)
  assert.match(read("src/features/discovery/screen/DiscoveryFeedbackPill.tsx"), /opacity: feedbackAnim,[\s\S]{0,120}transform: reduceMotion \? \[\] :/)
  const toast = read("src/ui/toast.tsx")
  assert.match(toast, /if \(reduceMotion\) slideAnim\.setValue\(0\)/)
  assert.match(toast, /\.\.\.\(reduceMotion \? \[\] : \[Animated\.spring\(slideAnim/)
})
