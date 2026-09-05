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
  assert.match(screen, /onItemLongPressRelease=\{handlePlacedBedLongPressRelease\}/)
  assert.match(screen, /selectedInstanceId=\{placedBedRenderId\}/)
  assert.match(screen, /Basılı tutup sürükleyerek taşı/)

  assert.match(renderer, /onItemLongPress\?: \(item: RoomV2RenderItem\) => void/)
  assert.match(renderer, /onItemLongPressRelease\?: \(item: RoomV2RenderItem, point: RoomWorldPoint\) => void/)
  assert.match(renderer, /onLongPress=/)
  assert.match(renderer, /onPressOut=/)
  assert.match(renderer, /delayLongPress=\{360\}/)
})
