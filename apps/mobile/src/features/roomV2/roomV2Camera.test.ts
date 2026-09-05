import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveRoomV2MyRoomCamera,
  resolveRoomV2StageHeight
} from "./roomV2Camera"

test("My Room uses the canonical camera when shell metadata is absent", () => {
  assert.deepEqual(resolveRoomV2MyRoomCamera(undefined), {
    compactRendererWidth: "155%",
    regularRendererWidth: "154%",
    rendererTranslateY: 0,
    compactStageHeightRatio: 0.64,
    wideStageHeightRatio: 0.64,
    compactMinStageHeight: 430,
    wideMinStageHeight: 440,
    compactMaxStageHeight: 680,
    wideMaxStageHeight: 560
  })
})

test("My Room ignores stale per-shell camera overrides and keeps the canonical viewport", () => {
  const camera = resolveRoomV2MyRoomCamera({
    compactRendererWidth: "151%",
    regularRendererWidth: "182%",
    rendererTranslateY: -12,
    compactStageHeightRatio: 0.58,
    wideStageHeightRatio: 0.52,
    compactMinStageHeight: 320,
    wideMinStageHeight: 340,
    compactMaxStageHeight: 460,
    wideMaxStageHeight: 480
  })

  assert.equal(camera.compactRendererWidth, "155%")
  assert.equal(camera.regularRendererWidth, "154%")
  assert.equal(camera.rendererTranslateY, 0)
  assert.equal(camera.compactStageHeightRatio, 0.64)
  assert.equal(camera.wideStageHeightRatio, 0.64)
  assert.equal(camera.compactMinStageHeight, 430)
  assert.equal(camera.wideMinStageHeight, 440)
  assert.equal(camera.compactMaxStageHeight, 680)
  assert.equal(camera.wideMaxStageHeight, 560)
})

test("My Room uses the empty lower viewport for the room stage while preserving safe height bounds", () => {
  const camera = resolveRoomV2MyRoomCamera(undefined)

  assert.equal(resolveRoomV2StageHeight(844, false, camera), 540)
  assert.equal(resolveRoomV2StageHeight(667, false, camera), 430)
  assert.equal(resolveRoomV2StageHeight(932, false, camera), 596)
})
