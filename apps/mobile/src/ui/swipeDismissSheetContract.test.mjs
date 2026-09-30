import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// Source contracts for swipe-down-to-dismiss. The release and claim rules
// are covered by sheetDismissModel.test.ts; this pins the wiring.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

const sheet = read("./SwipeDismissSheet.tsx")
const filters = read("../components/DiscoverFiltersBottomSheet.tsx")
const report = read("../components/ReportModal.tsx")
// The filters close label is localised; its English wording is unchanged.
const filtersCopy = read("../features/discovery/discoveryHomeCopy.ts")

test("every bottom sheet uses the one shared swipe-dismiss surface", () => {
  for (const [name, source] of [["filters", filters], ["report", report]]) {
    assert.match(source, /import \{ GestureHandlerRootView \} from "react-native-gesture-handler"/, `${name}: gestures work inside the Modal on Android`)
    assert.match(source, /<Modal[\s\S]*?<GestureHandlerRootView style=\{styles\.overlay\}>[\s\S]*?<SwipeDismissSheet[\s\S]*?<\/SwipeDismissSheet>\s*<\/GestureHandlerRootView>\s*<\/Modal>/, name)
    assert.doesNotMatch(source, /PanResponder/, `${name}: no second gesture mechanism`)
  }
  assert.match(filters, /<SwipeDismissSheet\s+onDismiss=\{onClose\}/)
  assert.match(report, /<SwipeDismissSheet\s+onDismiss=\{handleClose\}\s+enabled=\{!isSubmitting && step !== "done"\}/, "never closes mid-submit")
})

test("the backdrop belongs to the sheet and fades with the drag, so nothing trails a swipe dismiss", () => {
  // The Modal slides its whole content out after onDismiss. A backdrop tint
  // outside the sheet stayed opaque while the sheet slid away and was then
  // carried down by that slide: the ghost behind the sheet.
  assert.match(sheet, /backdrop\?: SwipeDismissSheetBackdrop/)
  assert.match(sheet, /const backdropStyle = useAnimatedStyle\(\(\) => \(\{\s*opacity: getSheetBackdropOpacity\(offset\.value, sheetHeight\.value\)/)
  // Reduce Motion: the sheet and its backdrop leave at once before the Modal closes.
  assert.match(sheet, /if \(reduceMotionValue\.value\) \{\s*offset\.value = getSheetExitOffset\(sheetHeight\.value\)\s*scheduleOnRN\(dismiss\)/)
  for (const [name, source] of [["filters", filters], ["report", report]]) {
    assert.match(source, /<SwipeDismissSheet[\s\S]*?backdrop=\{/, `${name}: backdrop is owned by the sheet`)
    assert.doesNotMatch(source, /overlay: \{[^}]*backgroundColor/, `${name}: no static tint on the modal container`)
  }
  assert.doesNotMatch(filters, /<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=(?:"Close discovery filters"|\{copy\.closeAccessibilityLabel\})\s+style=\{styles\.backdrop\}/, "filters: tap-to-close lives in the sheet backdrop")
  assert.match(filters, /backdrop=\{\{\s*style: styles\.backdrop,\s*onPress: onClose,\s*accessibilityLabel: copy\.closeAccessibilityLabel\s*\}\}/)
  assert.match(filtersCopy, /closeAccessibilityLabel: "Close discovery filters"/)
  assert.match(filtersCopy, /closeAccessibilityLabel: "Discover filtrelerini kapat"/)
  assert.match(report, /backdrop=\{\{\s*style: styles\.backdrop\s*\}\}/)
})

test("inner scroll content keeps its touch unless it is at the top", () => {
  assert.match(filters, /<SwipeDismissSheetScrollView[\s\S]*?<\/SwipeDismissSheetScrollView>/)
  assert.doesNotMatch(filters, /<ScrollView\b/)
  assert.match(sheet, /startedAtTop\.value = scrollOffset\.value <= 0\.5/)
  assert.match(sheet, /Gesture\.Native\(\)\.simultaneousWithExternalGesture\(panRef\)/)
  assert.match(sheet, /bounces=\{false\}/)
})

test("the visible close buttons stay; VoiceOver escape also closes", () => {
  // Backdrop tap (in the sheet's backdrop prop) and the visible close button.
  assert.match(filters, /backdrop=\{\{[\s\S]*?onPress: onClose,\s*accessibilityLabel: copy\.closeAccessibilityLabel[\s\S]*?accessibilityLabel=\{copy\.closeAccessibilityLabel\}[\s\S]*?onPress=\{onClose\}/)
  assert.match(sheet, /<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{backdrop\.accessibilityLabel\}[\s\S]*?onPress=\{backdropPress\}/)
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
  assert.match(sheet, /if \(reduceMotionValue\.value\) \{\s*offset\.value = getSheetExitOffset\(sheetHeight\.value\)\s*scheduleOnRN\(dismiss\)/)
})
