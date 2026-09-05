import assert from "node:assert/strict"
import test from "node:test"
import { resolveRoomStudioModuleFrame } from "./roomStudioPresentation"

test("module frame keeps the approved anchor as a floor pivot and preserves source aspect", () => {
  const frame = resolveRoomStudioModuleFrame({
    anchor: { x: 0.39, y: 0.67 },
    normalizedWidth: 0.37,
    sourceWidth: 1672,
    sourceHeight: 941,
    stageWidth: 360,
    stageHeight: 205
  })

  assert.equal(frame.width, 133.2)
  assert.equal(frame.height, 74.96)
  assert.equal(frame.left, 73.8)
  assert.equal(frame.top, 62.39)
  assert.equal(frame.anchorX, 140.4)
  assert.equal(frame.anchorY, 137.35)
})

test("invalid source or stage geometry fails closed", () => {
  assert.throws(
    () => resolveRoomStudioModuleFrame({
      anchor: { x: 0.5, y: 0.5 },
      normalizedWidth: 0,
      sourceWidth: 0,
      sourceHeight: 100,
      stageWidth: 360,
      stageHeight: 205
    }),
    /room_studio_render_geometry_invalid/
  )
})
