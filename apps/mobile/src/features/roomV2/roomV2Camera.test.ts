import assert from "node:assert/strict"
import test from "node:test"
import { resolveRoomV2MyRoomCamera } from "./roomV2Camera"
import type { RoomShellMyRoomCamera } from "./roomV2.types"

test("My Room ignores stale per-shell camera overrides and keeps the canonical viewport", () => {
  const staleOverrides: RoomShellMyRoomCamera = {
    compactRendererWidth: "151%",
    regularRendererWidth: "182%",
    rendererTranslateY: -12,
    compactStageHeightRatio: 0.58,
    wideStageHeightRatio: 0.52,
    compactMinStageHeight: 320,
    wideMinStageHeight: 340,
    compactMaxStageHeight: 460,
    wideMaxStageHeight: 480
  }

  assert.deepEqual(
    resolveRoomV2MyRoomCamera(staleOverrides),
    resolveRoomV2MyRoomCamera(undefined)
  )
})
