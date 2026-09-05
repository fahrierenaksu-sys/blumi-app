import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const rendererSource = readFileSync(
  new URL("../src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx", import.meta.url),
  "utf8"
)

test("room avatar ticker callbacks stay stable while movement rerenders the parent", () => {
  assert.match(rendererSource, /const subscribeToFrameTicker = useCallback\(/)
  assert.match(rendererSource, /const getFrameTickerSnapshot = useCallback\(/)
  assert.match(
    rendererSource,
    /useSyncExternalStore\(\s*subscribeToFrameTicker,\s*getFrameTickerSnapshot,/s
  )
})
