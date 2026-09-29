import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomPresentation } from "./miniRoomPresentation"

test("shared room uses the approved wide isometric camera on a regular phone", () => {
  assert.deepEqual(resolveMiniRoomPresentation({
    viewportWidth: 390,
    viewportHeight: 844,
    keyboardVisible: false
  }), {
    cameraWidthPercent: 154,
    cameraTop: 235,
    chromeHorizontalInset: 16,
    chromeGap: 8,
    composerHorizontalInset: 16,
    composerVerticalInset: 14
  })
})

test("keyboard mode shows more of the room while raising its camera", () => {
  const closed = resolveMiniRoomPresentation({
    viewportWidth: 390,
    viewportHeight: 844,
    keyboardVisible: false
  })
  const open = resolveMiniRoomPresentation({
    viewportWidth: 390,
    viewportHeight: 844,
    keyboardVisible: true
  })

  assert.ok(open.cameraWidthPercent < closed.cameraWidthPercent)
  assert.ok(open.cameraTop < closed.cameraTop)
  assert.ok(open.composerVerticalInset < closed.composerVerticalInset)
})

test("narrow phones retain touch-safe margins without zooming the room out", () => {
  const compact = resolveMiniRoomPresentation({
    viewportWidth: 350,
    viewportHeight: 740,
    keyboardVisible: false
  })

  assert.equal(compact.cameraWidthPercent, 155)
  assert.equal(compact.chromeHorizontalInset, 10)
  assert.equal(compact.composerHorizontalInset, 10)
})
