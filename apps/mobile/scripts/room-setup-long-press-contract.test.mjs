import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("starter bed becomes editable from the placed object with long-press haptic feedback", () => {
  const screen = read("src/screens/RoomSetupScreen.tsx")
  const renderer = read("src/features/roomV2/components/RoomRenderer2D.tsx")

  assert.match(screen, /hapticMedium/)
  assert.match(screen, /onItemLongPress=\{handlePlacedBedLongPress\}/)
  assert.match(screen, /onItemLongPressMove=\{handlePlacedBedLongPressMove\}/)
  assert.match(screen, /onItemLongPressRelease=\{handlePlacedBedLongPressRelease\}/)
  // The hint is localised in roomSetupCopy.ts; the Turkish wording is unchanged.
  assert.match(screen, /setPlacementMessage\(copy\.placement\.longPressMove\)/)
  const copy = read("src/features/roomV2/roomSetupCopy.ts")
  assert.match(copy, /longPressMove: "Basılı tutup sürükleyerek taşı\."/)
  assert.match(copy, /longPressMove: "Press and hold, then drag to move\."/)

  assert.match(renderer, /onItemLongPress\?: \(item: RoomV2RenderItem\) => void/)
  assert.match(renderer, /onItemLongPressMove\?: \(item: RoomV2RenderItem, point: \{ pageX: number; pageY: number \}\) => void/)
  assert.match(renderer, /onItemLongPressRelease\?: \(item: RoomV2RenderItem, point: RoomWorldPoint\) => void/)
  assert.match(renderer, /onLongPress=/)
  assert.match(renderer, /onPressOut=/)
  // A drag-capable host starts the move immediately; others keep the 360 ms hold.
  assert.match(renderer, /delayLongPress=\{onItemLongPressMove \? 0 : 360\}/)
})

test("the first-room bed drag follows the finger on the UI thread and writes the room once (ROOMSETUP-1)", () => {
  const screen = read("src/screens/RoomSetupScreen.tsx")
  const drag = read("src/features/session/setupFlow/useRoomSetupBedDrag.ts")

  // Gesture Handler pan on the card; no JS PanResponder that only acted on release.
  assert.doesNotMatch(screen, /PanResponder/)
  assert.match(screen, /<GestureDetector gesture=\{bedDrag\.cardGesture\}>/)
  assert.match(drag, /Gesture\.Pan\(\)/)
  assert.match(drag, /\.onUpdate\(\(event\) => \{\s*"worklet"\s*x\.value = event\.absoluteX/)
  const update = drag.slice(drag.indexOf(".onUpdate("), drag.indexOf(".onEnd("))
  assert.doesNotMatch(update, /scheduleOnRN/, "no JS hop per move")
  // A ghost shows where the bed goes; the room is placed only on release.
  assert.match(screen, /<RoomEditorDragGhost/)
  const move = screen.slice(screen.indexOf("const handlePlacedBedLongPressMove"), screen.indexOf("const handlePlacedBedLongPressRelease"))
  assert.doesNotMatch(move, /placeBedAtPoint|placeBedAtWindowPoint|setUserRoomDecor/)
  const release = screen.slice(screen.indexOf("const handlePlacedBedLongPressRelease"), screen.indexOf("const bedGhostSource"))
  assert.match(release, /placeBedAtPoint\(point\)/)
  // Valid and rejected drops answer physically; the placed card fades in.
  assert.match(screen, /setPlacementMessage\(copy\.placement\.placed\)\s*hapticLight\(\)/)
  assert.match(screen, /hapticError\(\)\s*setPlacementMessage\(copy\.placement\.chooseAnotherSpot\)/)
  assert.match(screen, /entering=\{reduceMotion \? undefined : FadeIn\.duration\(200\)\}/)
})
