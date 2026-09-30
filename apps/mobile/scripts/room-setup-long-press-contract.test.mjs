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
