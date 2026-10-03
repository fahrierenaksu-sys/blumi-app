import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { createClockedReanimatedStub } from "../../../testing/reanimatedClock"
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
  const clock = createClockedReanimatedStub(runtime)
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
          useMotion: () => ({ reduceMotion, snappy: {} }),
          animateTo: (value: number, _config: unknown, callback?: (finished: boolean) => void) =>
            (clock.module.withTiming as (v: number, c: unknown, cb?: unknown) => unknown)(value, { duration: 100 }, callback)
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

test("a stage drag uses measured room coordinates and one visible piece through drop", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] })
  const h = mountDrag(false)
  const pan = h.read().stageDragGesture as unknown as Pan
  const start = h.event(0.5, 0.63)
  let failed = false
  pan.down({ numberOfTouches: 1, changedTouches: [start] }, { fail: () => { failed = true } })
  assert.equal(failed, false, "the child-local point does not break the hit test")
  pan.start(start)
  assert.equal(h.read().ghost?.renderId, "chair_1")
  assert.equal(h.read().ghostValues.x.value, h.bounds.x + 0.5 * h.bounds.width)
  assert.deepEqual(getRoomEditorDisplayRenderItems(h.scene.renderItems, undefined, h.read().ghost?.renderId), [])
  pan.update(h.event(0.6, 0.7))
  t.mock.timers.tick(70)
  const preview = h.preview()!
  assert.ok(preview.isValid)
  assert.ok(Math.abs(h.read().ghostValues.x.value - (h.bounds.x + preview.item.x * h.bounds.width)) < 1e-8)
  assert.ok(Math.abs(h.read().ghostValues.y.value - (h.bounds.y + preview.item.y * h.bounds.height)) < 1e-8)
  assert.deepEqual(getRoomEditorDisplayRenderItems(h.scene.renderItems, preview, h.read().ghost?.renderId), [])
  pan.end(h.event(0.6, 0.7), true)
  assert.equal(h.commits.length, 1)
  t.mock.timers.tick(150)
  assert.ok(h.read().ghost, "the overlay remains until its drop animation finishes")
  assert.equal(h.read().ghostValues.opacity.value, 1, "the only visible copy must not fade out")
  assert.deepEqual(getRoomEditorDisplayRenderItems(h.scene.renderItems, preview, h.read().ghost?.renderId), [])
  t.mock.timers.tick(350)
  assert.equal(h.read().ghost, undefined)
  assert.equal(getRoomEditorDisplayRenderItems(h.scene.renderItems, preview, undefined).length, 1)
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
