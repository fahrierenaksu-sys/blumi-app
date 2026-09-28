import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(__dirname, "../../..")

test("account changes remount the room scope and loading never paints default decor", () => {
  const navigator = readFileSync(resolve(root, "src/navigation/RootNavigator.tsx"), "utf8")
  const room = readFileSync(resolve(root, "src/screens/MyRoomScreen.tsx"), "utf8")

  assert.match(
    navigator,
    /<RoomV2Provider[\s\S]*?key=\{`\$\{sessionActor\?\.profile\.userId \?\? preAuthDraftScopeId\}:production`\}/
  )
  assert.match(room, /const \{ userRoomDecor, persistenceState \} = useRoomV2\(\)/)
  assert.match(room, /persistenceState === "loading" \? \([\s\S]*?\) : <RoomRenderer2D/)
})
