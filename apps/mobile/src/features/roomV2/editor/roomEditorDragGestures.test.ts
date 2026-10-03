import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { createClockedReanimatedStub, loadClockedMotion } from "../../../testing/reanimatedClock"
import { MOTION_DURATIONS } from "../../../ui/motionTokens"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import { resolvePlacedFurnitureRenderItem, resolveRoomV2Scene } from "../roomV2Selectors"
import * as dragModel from "./roomEditorDragModel"
import * as floorModel from "./roomEditorFloorGridModel"
import * as placementModel from "./roomEditorPlacementModel"
import { getRoomEditorDisplayRenderItems } from "./roomEditorPresentationModel"
import { createTestFurniture, createTestPlaced, TEST_FLOOR_GRID_SHELL } from "./roomEditorTestFixtures"
import type { useRoomEditorDragGestures as DragHook } from "./useRoomEditorDragGestures"

type Event = { absoluteX: number; absoluteY: number; x: number; y: number }
class Pan {
  down!: (event: { numberOfTouches: number; changedTouches: Event[] }, manager: { fail: () => void }) => void
  start!: (event: Event) => void
  update!: (event: Event) => void
  end!: (event: Event, success: boolean) => void
  enabled() { return this }
  activateAfterLongPress() { return this }
  shouldCancelWhenOutside() { return this }
  maxPointers() { return this }
  onTouchesDown(callback: Pan["down"]) { this.down = callback; return this }
  onStart(callback: Pan["start"]) { this.start = callback; return this }
  onUpdate(callback: Pan["update"]) { this.update = callback; return this }
  onEnd(callback: Pan["end"]) { this.end = callback; return this }
}

function mountDrag(reduceMotion: boolean) {
  const runtime = createFakeReactRuntime()
  const native = createReactNativeStub()
  // Springs report completion at rest, about 1.5x their visible duration.
  const clock = createClockedReanimatedStub(runtime, { springRestFactor: 1.5 })
  const motion = loadClockedMotion(runtime, clock.module, native.module) as {
    resolveMotion: (reduce: boolean) => unknown
    animateTo: unknown
  }
  const bounds = { x: -40, y: 100, width: 472, height: 269 }
  const chair = createTestFurniture()
  const placed = createTestPlaced({ x: 0.5, y: 0.65 })
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [TEST_FLOOR_GRID_SHELL], furnitureCatalog: [chair],
    decor: { roomShellId: TEST_FLOOR_GRID_SHELL.id, placedItems: [placed] },
    defaultRoomShellId: TEST_FLOOR_GRID_SHELL.id
  })
  let preview: placementModel.PlacementPreview | undefined
  let selected: string | undefined
  let picked: string | undefined
  const commits: placementModel.PlacementPreview[] = []
  const selection: Parameters<typeof DragHook>[0]["selection"] = {
    get selectedInstanceId() { return selected },
    get placementPreview() { return preview },
    placementFeedback: undefined,
    setSelectedInstanceId: (id) => { selected = typeof id === "function" ? id(selected) : id },
    setPlacementFeedback: () => undefined, updatePlacementFeedback: () => undefined,
    setPlacementPreview: (next) => { preview = typeof next === "function" ? next(preview) : next },
    updatePlacementPreview: (next: placementModel.PlacementPreview | undefined) => { preview = next }
  }
  const hook = loadSourceWithFakeReact<{ useRoomEditorDragGestures: typeof DragHook }>(
    "features/roomV2/editor/useRoomEditorDragGestures.ts", runtime, {
      modules: {
        "react-native": native.module,
        "react-native-gesture-handler": { Gesture: { Pan: () => new Pan() } },
        "react-native-reanimated": {
          ...clock.module,
          useAnimatedRef: () => (runtime.react.useRef as (value: unknown) => unknown)(null),
          measure: () => ({ pageX: bounds.x, pageY: bounds.y, width: bounds.width, height: bounds.height })
        },
        "react-native-worklets": { ...clock.worklets, scheduleOnUI: clock.worklets.scheduleOnRN },
        "../../../ui/haptics": { hapticError() {}, hapticMedium() {}, hapticRigid() {}, hapticSelection() {} },
        "../../../ui/motion": {
          useMotion: () => motion.resolveMotion(reduceMotion),
          animateTo: motion.animateTo
        },
        "../roomV2Selectors": { resolvePlacedFurnitureRenderItem },
        "./roomEditorCatalog": { ACTIVE_ROOM_FURNITURE_CATALOG: [chair] },
        "./roomEditorDragModel": dragModel,
        "./roomEditorFloorGridModel": floorModel,
        "./roomEditorPlacementModel": placementModel
      }
    }
  )
  runtime.render(() => hook.useRoomEditorDragGestures({
    copy: getMyRoomEditorCopy("en"), scene, placedItems: [placed],
    canPlaceAnotherRoomItem: () => true,
    commitTrayPlacementPreview: (next) => { if (next) commits.push(next); return !!next?.isValid },
    selection,
    stage: {
      roomLayout: { width: bounds.width, height: bounds.height },
      // Intentionally stale: only the measurement taken by this pan is correct.
      stageWindowBounds: { x: 0, y: 0, width: 390, height: 220 },
      measureStageWindow: () => undefined
    } as Parameters<typeof DragHook>[0]["stage"],
    inventory: { setSelectedInventoryItemId: (id) => { picked = typeof id === "function" ? id(picked) : id }, setSelectedInventoryRotation: () => undefined }
  }))
  const read = () => runtime.output as ReturnType<typeof DragHook>
  const event = (x: number, y: number): Event => ({
    absoluteX: bounds.x + x * bounds.width, absoluteY: bounds.y + y * bounds.height,
    x: 2, y: 3 // Touch-local child coordinates must never offset the room.
  })
  return { read, event, scene, bounds, native, runtime, commits, preview: () => preview, selected: () => selected, picked: () => picked }
}

function dragChairAndDrop(h: ReturnType<typeof mountDrag>, t: { mock: { timers: { tick: (ms: number) => void } } }) {
  const pan = h.read().stageDragGesture as unknown as Pan
  const start = h.event(0.5, 0.63)
  let failed = false
  pan.down({ numberOfTouches: 1, changedTouches: [start] }, { fail: () => { failed = true } })
  assert.equal(failed, false, "the child-local point does not break the hit test")
  pan.start(start)
  assert.equal(h.read().ghostValues.x.value, h.bounds.x + 0.5 * h.bounds.width)
  const held = () => getRoomEditorDisplayRenderItems(h.scene.renderItems, h.preview(), h.read().ghost?.renderId)
  assert.deepEqual(held(), [], "while held, the overlay is the only visible copy")
  pan.update(h.event(0.6, 0.7))
  t.mock.timers.tick(70)
  const preview = h.preview()!
  assert.ok(preview.isValid)
  assert.deepEqual(held(), [], "a valid preview spot is still drawn only by the overlay")
  pan.end(h.event(0.6, 0.7), true)
  assert.equal(h.commits.length, 1)
  // The test scene is static: the preview stands in for the committed piece.
  const shown = () => getRoomEditorDisplayRenderItems(h.scene.renderItems, preview, h.read().ghost?.renderId)
  const landing = { x: h.bounds.x + preview.item.x * h.bounds.width, y: h.bounds.y + preview.item.y * h.bounds.height }
  return { shown, landing }
}

test("a valid drop shows the placed piece at once and the overlay fades out on a short fixed timing", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] })
  const h = mountDrag(false)
  const { shown, landing } = dragChairAndDrop(h, t)
  assert.equal(shown().length, 1, "the placed piece draws at its own depth in the drop frame")
  t.mock.timers.tick(MOTION_DURATIONS.fadeOut / 2)
  assert.equal(shown().length, 1, "never a frame without the piece")
  const fading = h.read().ghostValues.opacity.value
  assert.ok(fading > 0 && fading < 1, "the overlay is already fading over the placed piece")
  t.mock.timers.tick(MOTION_DURATIONS.fadeOut / 2)
  assert.equal(h.read().ghostValues.opacity.value, 0)
  assert.ok(Math.abs(h.read().ghostValues.x.value - landing.x) < 1e-8, "the overlay sets down on the placed piece")
  assert.ok(Math.abs(h.read().ghostValues.y.value - landing.y) < 1e-8)
  assert.equal(h.read().ghostValues.scale.value, 1)
  assert.equal(h.read().ghost, undefined, "the overlay leaves when its fade ends, not when a spring rests")
  assert.equal(shown().length, 1)
  h.runtime.unmount()
})

test("under Reduce Motion a drop lands the overlay in place and only crossfades it", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] })
  const h = mountDrag(true)
  const { shown, landing } = dragChairAndDrop(h, t)
  assert.equal(shown().length, 1)
  assert.equal(h.read().ghostValues.x.value, landing.x, "no travel under Reduce Motion")
  assert.equal(h.read().ghostValues.scale.value, 1)
  t.mock.timers.tick(MOTION_DURATIONS.crossfade)
  assert.equal(h.read().ghostValues.opacity.value, 0)
  assert.equal(h.read().ghost, undefined)
  h.runtime.unmount()
})

test("backgrounding a stage drag restores the original and clears the preview", () => {
  const h = mountDrag(true)
  const pan = h.read().stageDragGesture as unknown as Pan
  const event = h.event(0.5, 0.63)
  pan.down({ numberOfTouches: 1, changedTouches: [event] }, { fail() {} })
  pan.start(event)
  pan.update(h.event(0.6, 0.7))
  h.native.emitAppState("background")
  assert.equal(h.read().ghost, undefined)
  assert.equal(h.preview(), undefined)
  assert.equal(h.commits.length, 0)
  assert.equal(getRoomEditorDisplayRenderItems(h.scene.renderItems, h.preview(), undefined)[0].x, 0.5)
  h.runtime.unmount()
})

test("a tray drag selects its own card and cancelling never places another piece", () => {
  const h = mountDrag(true)
  const pan = h.read().createTrayDragGesture(createTestFurniture(), true, false, "front") as unknown as Pan
  pan.start(h.event(0.5, 1.8))
  assert.equal(h.picked(), "chair")
  assert.equal(h.read().ghost?.renderId, h.selected())
  pan.end(h.event(0.5, 1.8), false)
  assert.equal(h.selected(), undefined)
  assert.equal(h.read().ghost, undefined)
  assert.equal(h.commits.length, 0)
  h.runtime.unmount()
})
