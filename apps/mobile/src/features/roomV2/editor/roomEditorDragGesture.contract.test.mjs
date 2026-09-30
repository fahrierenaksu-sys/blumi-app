// Source contract for My Room editor drag-to-move. RN Pressable spreads its
// own Pressability responder handlers after the props it receives, so
// PanResponder handlers spread onto a Pressable never run on a device: only
// taps reached placement. Stage and tray drags must be Gesture Handler pans
// whose frames stay on the UI thread, and taps must stay on the Pressables.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const editorDirectory = dirname(fileURLToPath(import.meta.url))
const mobileRoot = resolve(editorDirectory, "../../../..")
const read = (fileName) => readFileSync(join(editorDirectory, fileName), "utf8")
const screenSource = readFileSync(join(mobileRoot, "src/screens/MyRoomEditorScreen.tsx"), "utf8")
const dragHookSource = read("useRoomEditorDragGestures.ts")
const placementHookSource = read("useRoomEditorPlacementGestures.ts")
const stageSource = read("RoomEditorStage.tsx")
const cardSource = read("InventoryCatalogCard.tsx")
const listSource = read("RoomEditorInventoryList.tsx")
const ghostSource = read("RoomEditorDragGhost.tsx")
const editorSurfaceSource = [
  screenSource,
  ...readdirSync(editorDirectory)
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .map(read)
].join("\n")

test("no editor surface spreads PanResponder handlers onto a Pressable", () => {
  assert.doesNotMatch(editorSurfaceSource, /PanResponder/)
  assert.doesNotMatch(editorSurfaceSource, /panHandlers/)
  assert.doesNotMatch(editorSurfaceSource, /GestureResponderHandlers/)
  assert.doesNotMatch(placementHookSource, /eslint-disable/)
})

test("the stage and tray drags are Gesture Handler pans with long-press activation", () => {
  assert.equal((dragHookSource.match(/Gesture\.Pan\(\)/g) ?? []).length, 2)
  assert.equal(
    (dragHookSource.match(/\.activateAfterLongPress\(ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS\)/g) ?? []).length,
    2
  )
  assert.match(dragHookSource, /\.shouldCancelWhenOutside\(false\)/)
  // A stage drag only starts on a placed piece; anywhere else the pan fails
  // at touch-down so taps, page scroll and edge back keep the touch.
  assert.match(
    dragHookSource,
    /\.onTouchesDown\(\(event, stateManager\) => \{[\s\S]*findRoomEditorDragHitRect\([\s\S]*stateManager\.fail\(\)/
  )
  assert.match(stageSource, /<GestureDetector gesture=\{dragGesture\}>\s*<Pressable/)
  assert.match(cardSource, /<GestureDetector gesture=\{dragGesture\}>\s*<Pressable/)
  assert.match(cardSource, /createDragGesture\(item, owned, placed, previewRotation\)/)
  assert.match(listSource, /createDragGesture=\{createInventoryItemDragGesture\}/)
  assert.match(screenSource, /dragGesture=\{drag\.stageDragGesture\}/)
  assert.match(screenSource, /createInventoryItemDragGesture=\{drag\.createTrayDragGesture\}/)
})

test("drag frames stay on the UI thread; JS hears only cell changes and the release", () => {
  assert.match(dragHookSource, /from "react-native-worklets"/)
  assert.match(dragHookSource, /hasRoomEditorDragCellChanged\(/)
  const onUpdateBodies = dragHookSource.match(/\.onUpdate\(\(event\) => \{[\s\S]*?(?=\.onEnd\()/g) ?? []
  assert.equal(onUpdateBodies.length, 2)
  for (const body of onUpdateBodies) {
    assert.match(body, /ghostX\.value = /)
    assert.match(body, /if \(hasRoomEditorDragCellChanged\([\s\S]*scheduleOnRN\(/)
    assert.doesNotMatch(body, /setState|updatePlacementPreview/)
  }
  assert.match(ghostSource, /useAnimatedStyle\(/)
  assert.match(ghostSource, /pointerEvents="none"/)
  assert.match(screenSource, /<RoomEditorDragGhost/)
})

test("a drop commits through the same path as the confirm control; cancel restores", () => {
  assert.match(dragHookSource, /resolveRoomEditorDragRelease\(/)
  assert.match(dragHookSource, /if \(release === "commit"[\s\S]*commitTrayPlacementPreview\(preview\)/)
  assert.match(screenSource, /commitTrayPlacementPreview: gestures\.commitTrayPlacementPreview/)
  // Interrupted gestures and backgrounding clear the preview so the piece
  // returns to its saved spot.
  assert.match(dragHookSource, /\.onEnd\(\(_event, success\) => \{[\s\S]*if \(!success\)[\s\S]*scheduleOnRN\(cancelDrag/)
  assert.match(dragHookSource, /AppState\.addEventListener\("change"/)
})

test("reduce motion drops the lift and spring but the ghost still follows the finger", () => {
  assert.match(dragHookSource, /useReducedMotion\(\)/)
  assert.match(dragHookSource, /reduceMotion \? 1 : withSpring\(ROOM_EDITOR_DRAG_LIFT_SCALE/)
  assert.match(dragHookSource, /if \(reduceMotion\) \{[\s\S]*ghostX\.value = ghostOriginX\.value/)
})

test("the unsaved-exit guard can stop the iOS swipe and cancels a drag in progress", () => {
  // native-stack turns only usePreventRemove into `preventNativeDismiss`; a
  // bare beforeRemove listener let the native page pop while JS kept the
  // editor route (2026-09-30 frozen My Room regression).
  assert.doesNotMatch(editorSurfaceSource, /addListener\("beforeRemove"/)
  assert.match(read("useRoomEditorSave.ts"), /usePreventRemove\(isDirty,/)
  assert.match(screenSource, /isDirty: editorSession\.isDirty/)
  assert.match(screenSource, /cancelActiveDrag: drag\.cancelActiveDrag/)
})

test("taps keep their Pressables and drag is announced where it is available", () => {
  assert.match(stageSource, /onPress=\{onPress\}/)
  assert.match(stageSource, /accessibilityHint=\{`\$\{copy\.stageHint\} \$\{copy\.stageDragHint\}`\}/)
  assert.match(cardSource, /onPress=\{\(\) => onPreviewItem\(item\.id\)\}/)
  assert.match(cardSource, /accessibilityHint=\{canDrag \? trayDragHint : undefined\}/)
  assert.match(placementHookSource, /const handleItemTap = useCallback/)
  assert.match(placementHookSource, /const handleFloorTap = useCallback/)
})
