import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// Source contracts for swipe-down-to-dismiss. The release and claim rules
// are covered by sheetDismissModel.test.ts; this pins the wiring.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

const sheet = read("./SwipeDismissSheet.tsx")
const filters = read("../components/DiscoverFiltersBottomSheet.tsx")
const report = read("../components/ReportModal.tsx")

test("every bottom sheet uses the one shared swipe-dismiss surface", () => {
  for (const [name, source] of [["filters", filters], ["report", report]]) {
    assert.match(source, /import \{ GestureHandlerRootView \} from "react-native-gesture-handler"/, `${name}: gestures work inside the Modal on Android`)
    assert.match(source, /<Modal[\s\S]*?<GestureHandlerRootView style=\{styles\.overlay\}>[\s\S]*?<SwipeDismissSheet[\s\S]*?<\/SwipeDismissSheet>\s*<\/GestureHandlerRootView>\s*<\/Modal>/, name)
    assert.doesNotMatch(source, /PanResponder/, `${name}: no second gesture mechanism`)
  }
  assert.match(filters, /<SwipeDismissSheet\s+onDismiss=\{onClose\}/)
  assert.match(report, /<SwipeDismissSheet\s+onDismiss=\{handleClose\}\s+enabled=\{!isSubmitting && step !== "done"\}/, "never closes mid-submit")
})

test("inner scroll content keeps its touch unless it is at the top", () => {
  assert.match(filters, /<SwipeDismissSheetScrollView[\s\S]*?<\/SwipeDismissSheetScrollView>/)
  assert.doesNotMatch(filters, /<ScrollView\b/)
  assert.match(sheet, /startedAtTop\.value = scrollOffset\.value <= 0\.5/)
  assert.match(sheet, /Gesture\.Native\(\)\.simultaneousWithExternalGesture\(panRef\)/)
  assert.match(sheet, /bounces=\{false\}/)
})

test("the visible close buttons stay; VoiceOver escape also closes", () => {
  assert.match(filters, /accessibilityLabel="Close discovery filters"[\s\S]*?onPress=\{onClose\}[\s\S]*?accessibilityLabel="Close discovery filters"[\s\S]*?onPress=\{onClose\}/)
  assert.match(report, /accessibilityLabel=\{copy\.closeAccessibilityLabel\}[\s\S]*?onPress=\{handleClose\}/)
  assert.match(sheet, /onAccessibilityEscape=\{enabled \? dismiss : undefined\}/)
})

test("the drag runs on the UI thread and Reduce Motion comes from the shared store", () => {
  assert.match(sheet, /import \{ useReducedMotion \} from "\.\/animations"/)
  assert.doesNotMatch(sheet, /AccessibilityInfo/)
  const onUpdate = sheet.slice(sheet.indexOf(".onUpdate("), sheet.indexOf(".onEnd("))
  assert.match(onUpdate, /"worklet"/)
  assert.doesNotMatch(onUpdate, /scheduleOnRN|runOnJS|set[A-Z]\w*\(/, "no JS work per frame")
  // JS hears once, when the sheet closes.
  assert.deepEqual((sheet.match(/scheduleOnRN\((\w+)/g) ?? []).sort(), ["scheduleOnRN(dismiss", "scheduleOnRN(dismiss"])
  assert.match(sheet, /if \(reduceMotionValue\.value\) \{\s*scheduleOnRN\(dismiss\)/)
})
