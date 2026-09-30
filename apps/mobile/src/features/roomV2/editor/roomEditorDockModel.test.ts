import assert from "node:assert/strict"
import test from "node:test"
import {
  canToggleRoomEditorStageZoom,
  getNextRoomEditorTrayRotation,
  getRoomEditorCapsuleMode,
  getRoomEditorDockColumns,
  getRoomEditorDockRowCount,
  getRoomEditorDockCardWidth,
  getRoomEditorDockPageCount,
  getRoomEditorDockPageIndex,
  getRoomEditorHighlightedTrayItemId,
  getRoomEditorStageFrame,
  getRoomEditorVisibleCategoryIds
} from "./roomEditorDockModel"
import type { RoomEditorInventoryEntry } from "./roomEditorPresentationModel"
import { createTestFurniture } from "./roomEditorTestFixtures"

const ASPECT = 1254 / 714
const CATEGORY_ORDER = ["seating", "table", "rug", "misc", "lighting", "wallDecor", "plant"] as const

function entry(
  id: string,
  category: RoomEditorInventoryEntry["item"]["category"],
  owned = true
): RoomEditorInventoryEntry {
  return { item: createTestFurniture({ id, name: id, category }), owned }
}

test("fit shows the whole room, centred and never wider than the stage", () => {
  const frame = getRoomEditorStageFrame({ availableWidth: 400, availableHeight: 470, aspectRatio: ASPECT, zoom: "fit" })
  assert.equal(frame.width, 400)
  assert.equal(frame.height, Math.round(400 / ASPECT))
  assert.equal(frame.left, 0)
  assert.equal(frame.top, Math.round((470 - frame.height) / 2))
})

test("fill grows the room past the side edges on a tall stage, capped at 1.2x", () => {
  const frame = getRoomEditorStageFrame({ availableWidth: 400, availableHeight: 470, aspectRatio: ASPECT, zoom: "fill" })
  assert.equal(frame.width, 480)
  assert.equal(frame.left, -40)
  assert.ok(frame.height <= 470)
})

test("the room is never taller than the stage in either mode", () => {
  for (const zoom of ["fill", "fit"] as const) {
    const frame = getRoomEditorStageFrame({ availableWidth: 400, availableHeight: 180, aspectRatio: ASPECT, zoom })
    assert.ok(frame.height <= 180, `${zoom} height ${frame.height}`)
    assert.ok(frame.width < 400)
    assert.equal(frame.top, Math.round((180 - frame.height) / 2))
    assert.equal(frame.left, Math.round((400 - frame.width) / 2))
  }
})

test("an unmeasured stage yields an empty frame instead of NaN", () => {
  assert.deepEqual(
    getRoomEditorStageFrame({ availableWidth: 0, availableHeight: 0, aspectRatio: ASPECT, zoom: "fill" }),
    { left: 0, top: 0, width: 0, height: 0 }
  )
})

test("the zoom control exists only when fill and fit differ", () => {
  assert.equal(canToggleRoomEditorStageZoom({ availableWidth: 400, availableHeight: 470, aspectRatio: ASPECT }), true)
  assert.equal(canToggleRoomEditorStageZoom({ availableWidth: 400, availableHeight: 180, aspectRatio: ASPECT }), false)
  assert.equal(canToggleRoomEditorStageZoom({ availableWidth: 0, availableHeight: 0, aspectRatio: ASPECT }), false)
})

test("category tabs come from the collection, in catalog order, after All", () => {
  assert.deepEqual(getRoomEditorVisibleCategoryIds([], CATEGORY_ORDER), ["all"])
  assert.deepEqual(
    getRoomEditorVisibleCategoryIds(
      [entry("lamp", "lighting"), entry("chair", "seating"), entry("sofa", "seating"), entry("fern", "plant", false)],
      CATEGORY_ORDER
    ),
    ["all", "seating", "lighting", "plant"]
  )
})

test("the compact tray shows three cards per page", () => {
  assert.equal(getRoomEditorDockCardWidth(0, 8), 0)
  assert.equal(getRoomEditorDockCardWidth(316, 8), 100)
  assert.equal(getRoomEditorDockPageCount(0, 1), 1)
  assert.equal(getRoomEditorDockPageCount(3, 1), 1)
  assert.equal(getRoomEditorDockPageCount(4, 1), 2)
  assert.equal(getRoomEditorDockPageIndex(0, 324, 3), 0)
  assert.equal(getRoomEditorDockPageIndex(330, 324, 3), 1)
  assert.equal(getRoomEditorDockPageIndex(5000, 324, 3), 2)
  assert.equal(getRoomEditorDockPageIndex(330, 0, 3), 0)
})

test("the capsule serves the room selection first, then a picked tray piece, else hides", () => {
  const chair = entry("chair", "seating")
  const base = {
    selectedInstanceId: undefined,
    hasValidPlacementPreview: false,
    pickedTrayItemId: undefined,
    selectedInventoryEntry: chair,
    canPlaceSelectedInventoryItem: true
  }
  // The inspector's default entry alone is not a user selection.
  assert.equal(getRoomEditorCapsuleMode(base), "hidden")
  assert.equal(getRoomEditorCapsuleMode({ ...base, pickedTrayItemId: "chair" }), "tray")
  assert.equal(getRoomEditorCapsuleMode({ ...base, pickedTrayItemId: "lamp" }), "hidden")
  assert.equal(
    getRoomEditorCapsuleMode({ ...base, pickedTrayItemId: "chair", canPlaceSelectedInventoryItem: false }),
    "hidden"
  )
  assert.equal(
    getRoomEditorCapsuleMode({ ...base, pickedTrayItemId: "chair", selectedInventoryEntry: entry("chair", "seating", false) }),
    "hidden"
  )
  assert.equal(getRoomEditorCapsuleMode({ ...base, pickedTrayItemId: "chair", selectedInstanceId: "chair_1" }), "placed")
  assert.equal(getRoomEditorCapsuleMode({ ...base, hasValidPlacementPreview: true }), "placed")
})

test("the dock highlights only what the user chose", () => {
  const base = {
    selectedInventoryItemId: "chair",
    selectedPlacedItemId: undefined,
    pickedTrayItemId: undefined
  }
  assert.equal(getRoomEditorHighlightedTrayItemId(base), undefined)
  assert.equal(getRoomEditorHighlightedTrayItemId({ ...base, pickedTrayItemId: "chair" }), "chair")
  assert.equal(getRoomEditorHighlightedTrayItemId({ ...base, pickedTrayItemId: "lamp" }), undefined)
  assert.equal(
    getRoomEditorHighlightedTrayItemId({ ...base, pickedTrayItemId: "chair", selectedPlacedItemId: "table" }),
    "table"
  )
})

test("the expanded dock shows at most two rows of three and pages sideways", () => {
  assert.equal(getRoomEditorDockRowCount(false, 9), 1)
  assert.equal(getRoomEditorDockRowCount(true, 3), 1)
  assert.equal(getRoomEditorDockRowCount(true, 4), 2)
  assert.equal(getRoomEditorDockPageCount(6, 2), 1)
  assert.equal(getRoomEditorDockPageCount(7, 2), 2)
  const entries = ["a", "b", "c", "d", "e", "f", "g", "h"]
  assert.deepEqual(getRoomEditorDockColumns(entries, 1), [["a"], ["b"], ["c"], ["d"], ["e"], ["f"], ["g"], ["h"]])
  // Page one reads a b c / d e f; page two starts with g h.
  assert.deepEqual(getRoomEditorDockColumns(entries, 2), [["a", "d"], ["b", "e"], ["c", "f"], ["g"], ["h"]])
  assert.deepEqual(getRoomEditorDockColumns([], 2), [])
})

test("the tray direction control cycles only through supplied asset views", () => {
  assert.equal(getNextRoomEditorTrayRotation(["front"], "front"), undefined)
  assert.equal(getNextRoomEditorTrayRotation([], "front"), undefined)
  assert.equal(getNextRoomEditorTrayRotation(["front", "right", "back"], "front"), "right")
  assert.equal(getNextRoomEditorTrayRotation(["front", "right", "back"], "back"), "front")
})
