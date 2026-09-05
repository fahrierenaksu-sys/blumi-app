import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV2EditorSubtitle,
  getRoomV2EditorInspectorHint,
  hasMultipleRoomV2RotationOptions
} from "./roomV2EditorPresentation"

test("seat inspector explains the front-facing sitting contract before the user leaves the editor", () => {
  assert.equal(
    getRoomV2EditorInspectorHint({
      interactionType: "seat",
      rotation: "right"
    }),
    "Turn front to sit · drag to move"
  )
  assert.equal(
    getRoomV2EditorInspectorHint({
      interactionType: "seat",
      rotation: "front"
    }),
    "Drag in the room · choose a direction"
  )
  assert.equal(
    getRoomV2EditorInspectorHint({
      interactionType: "decor",
      rotation: "left"
    }),
    "Drag in the room · choose a direction"
  )
})

test("rotate action is shown only when the selected item has another real asset direction", () => {
  assert.equal(hasMultipleRoomV2RotationOptions(["front"]), false)
  assert.equal(hasMultipleRoomV2RotationOptions(["front", "back"]), true)
})

test("a committed selected item gets neutral adjustment guidance instead of an invalid-placement warning", () => {
  assert.equal(
    getRoomV2EditorSubtitle({
      placementFeedback: undefined,
      hasSelectedItem: true,
      canRotateSelectedItem: true
    }),
    "Drag to move · rotate or save"
  )
  assert.equal(
    getRoomV2EditorSubtitle({
      placementFeedback: undefined,
      hasSelectedItem: true,
      canRotateSelectedItem: false
    }),
    "Drag to move · then save"
  )
  assert.equal(
    getRoomV2EditorSubtitle({
      placementFeedback: "Move it to a clear spot",
      hasSelectedItem: true,
      canRotateSelectedItem: false
    }),
    "Move it to a clear spot"
  )
  assert.equal(
    getRoomV2EditorSubtitle({
      placementFeedback: undefined,
      hasSelectedItem: false,
      canRotateSelectedItem: false
    }),
    "Choose a piece, then place it your way"
  )
})
