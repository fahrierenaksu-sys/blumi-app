import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("match and debrief celebrations use the product icon system instead of font glyphs", () => {
  const matchResult = read("src/components/MatchResultModal.tsx")
  const roomDebrief = read("src/screens/RoomDebriefScreen.tsx")

  assert.match(matchResult, /@expo\/vector-icons\/Ionicons/)
  assert.match(roomDebrief, /@expo\/vector-icons\/Ionicons/)
  assert.doesNotMatch(matchResult, /[✦✧◆●♥♡]/u)
  assert.doesNotMatch(roomDebrief, /[✦👋💖]/u)
  assert.match(matchResult, /name="heart"/)
  assert.match(roomDebrief, /name="sparkles"/)
  assert.match(roomDebrief, /name="hand-left-outline"/)
})

test("MiniRoom reactions preserve all four semantics with stable vector icons", () => {
  const miniRoomScene = read("src/features/miniRoom/scene/MiniRoomScene.tsx")
  const avatarLayer = read("src/features/miniRoom/scene/AvatarLayer.tsx")

  for (const source of [miniRoomScene, avatarLayer]) {
    assert.match(source, /@expo\/vector-icons\/Ionicons/)
    assert.match(source, /wave:\s*"hand-left-outline"/)
    assert.match(source, /heart:\s*"heart"/)
    assert.match(source, /laugh:\s*"happy"/)
    assert.match(source, /fire:\s*"flame"/)
    assert.doesNotMatch(source, /[👋❤😂🔥💗]/u)
  }
})
