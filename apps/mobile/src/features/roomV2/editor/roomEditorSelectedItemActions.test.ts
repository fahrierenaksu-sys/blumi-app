import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { findElements } from "../../../testing/reanimatedClock"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import { getNextRoomEditorTrayRotation } from "./roomEditorDockModel"
import { createTestRenderItem } from "./roomEditorTestFixtures"
import type { RoomEditorSelectedItemActions as Actions } from "./RoomEditorSelectedItemActions"

const copy = getMyRoomEditorCopy("tr")

function renderActions(overrides: Partial<Parameters<typeof Actions>[0]> = {}) {
  const runtime = createFakeReactRuntime()
  const calls: string[] = []
  const { RoomEditorSelectedItemActions } = loadSourceWithFakeReact<{ RoomEditorSelectedItemActions: typeof Actions }>(
    "features/roomV2/editor/RoomEditorSelectedItemActions.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub().module,
        "@expo/vector-icons/Ionicons": "Icon",
        "../../avatarV2/wardrobe/WardrobeGlass": { WardrobeGlass: "Glass" },
        "./roomEditorDockModel": { getNextRoomEditorTrayRotation },
        "./roomEditorStyles": { styles: {}, roomEditorTheme: { ink: "black", accent: "pink" } }
      }
    }
  )
  const preview = { item: createTestRenderItem(), isValid: true }
  const props: Parameters<typeof Actions>[0] = {
    copy, mode: "placed", itemName: "Chair", placementPreview: preview,
    selectedInstanceId: "chair_1", canRotateSelectedPlacedItem: true,
    commitTrayPlacementPreview: (next) => { assert.equal(next, preview); calls.push("confirm"); return true },
    handleRotate: () => { calls.push("rotate") },
    handleRemoveItem: () => { calls.push("remove") },
    trayRotation: "front", trayRotations: ["front", "right"],
    handleSelectInventoryRotation: (rotation) => { calls.push(`direction:${rotation}`) },
    handlePlaceTrayItem: () => { calls.push("place") },
    onClearSelection: () => { calls.push("close") },
    ...overrides
  }
  const tree = runtime.render(() => RoomEditorSelectedItemActions(props))
  const button = (label: string) => {
    const found = findElements(tree, (element) => element.props.accessibilityRole === "button" && element.props.accessibilityLabel === label)
    assert.equal(found.length, 1)
    return found[0].props
  }
  return { button, calls }
}

test("closing a selection never removes or confirms its furniture", () => {
  const h = renderActions()
  ;(h.button(copy.clearSelection).onPress as () => void)()
  assert.deepEqual(h.calls, ["close"])
})

test("placed furniture offers separate rotate, confirm and remove actions", () => {
  const h = renderActions()
  assert.equal(h.button(copy.rotateSelected).disabled, false)
  ;(h.button(copy.rotateSelected).onPress as () => void)()
  ;(h.button(copy.confirmPlacement).onPress as () => void)()
  ;(h.button(copy.removeSelected).onPress as () => void)()
  assert.deepEqual(h.calls, ["rotate", "confirm", "remove"])
})

test("rotation stays visible but disabled for furniture with one authored view", () => {
  const h = renderActions({ canRotateSelectedPlacedItem: false })
  assert.equal(h.button(copy.rotateSelected).disabled, true)
  assert.equal(h.button(copy.rotateSelected).accessibilityHint, copy.feedback.unsupportedDirection)
})

test("tray rotation picks the next available view without placing another piece", () => {
  const h = renderActions({ mode: "tray", selectedInstanceId: undefined, placementPreview: undefined })
  ;(h.button(copy.rotateSelected).onPress as () => void)()
  assert.deepEqual(h.calls, ["direction:right"])
  const fixed = renderActions({ mode: "tray", selectedInstanceId: undefined, trayRotations: [] })
  assert.equal(fixed.button(copy.rotateSelected).disabled, true)
})
