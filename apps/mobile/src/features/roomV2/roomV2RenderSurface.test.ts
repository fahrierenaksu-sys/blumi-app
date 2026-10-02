import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureMobileRenderScale,
  getRoomV2FurnitureImageResizeMode,
  getRoomV2LiveAvatarOffset,
  getRoomV2LiveAvatarFrame,
  getRoomV2SeatedFurnitureRenderIds,
  ROOM_V2_FURNITURE_MOBILE_RENDER_SCALE,
  shouldShowRoomV2FurnitureGroundShadow
} from "./roomV2RenderSurface"

test("avatar and furniture share one locked-room depth perspective", () => {
  assert.equal(getRoomV2DepthPerspectiveScale(0.46), 1)
  assert.equal(getRoomV2DepthPerspectiveScale(0.88), 1)
  assert.equal(getRoomV2DepthPerspectiveScale(0.2), 1)
  assert.equal(getRoomV2DepthPerspectiveScale(1), 1)
})

test("mobile furniture visuals use the canonical runtime size without a second render-only scale", () => {
  assert.equal(
    getRoomV2FurnitureMobileRenderScale("furniture"),
    ROOM_V2_FURNITURE_MOBILE_RENDER_SCALE
  )
  assert.equal(getRoomV2FurnitureMobileRenderScale("avatar"), 1)
  assert.equal(ROOM_V2_FURNITURE_MOBILE_RENDER_SCALE, 1)
})

test("floor-plane art fills its calibrated perspective box while upright art preserves aspect ratio", () => {
  assert.equal(getRoomV2FurnitureImageResizeMode("floor_plane"), "stretch")
  assert.equal(getRoomV2FurnitureImageResizeMode("upright"), "contain")
  assert.equal(getRoomV2FurnitureImageResizeMode(undefined), "contain")
})

test("room furniture never receives a synthetic ground shadow", () => {
  assert.equal(
    shouldShowRoomV2FurnitureGroundShadow({
      layer: "furniture",
      category: "misc",
      placementSurface: "floor"
    }),
    false
  )
  assert.equal(
    shouldShowRoomV2FurnitureGroundShadow({
      layer: "furniture",
      category: "rug",
      placementSurface: "floor"
    }),
    false
  )
})

test("non-floor room props also stay free of synthetic shadows", () => {
  for (const placementSurface of ["tabletop", "wall", "ceiling", "floor"] as const) {
    assert.equal(
      shouldShowRoomV2FurnitureGroundShadow({
        layer: placementSurface === "wall" ? "wall" : "furniture",
        category: placementSurface === "wall" ? "wallDecor" : "misc",
        placementSurface
      }),
      false
    )
  }
})

test("front-seat occlusion is limited to furniture hosting a seated avatar", () => {
  const seatedFurnitureRenderIds = getRoomV2SeatedFurnitureRenderIds([
    {
      kind: "furniture",
      renderId: "loveseat-1"
    } as never,
    {
      kind: "avatar",
      renderId: "avatar-1",
      state: "walking"
    } as never,
    {
      kind: "avatar",
      renderId: "avatar-2",
      state: "sitting",
      seatRig: {
        furnitureRenderId: "loveseat-1",
        seatId: "left",
        seatHeight: 0.085,
        facing: "front"
      }
    } as never
  ])

  assert.deepEqual([...seatedFurnitureRenderIds], ["loveseat-1"])
})

test("live avatar placement stays anchored to the floor across React pose commits", () => {
  const input = { liveX: 0.63, liveY: 0.72, width: 0.2, height: 0.34,
    anchorX: 0.5, anchorY: 0.92, stageWidthPx: 390, stageHeightPx: 292 }
  // A step/depth/arrival commit must not change the box's origin underneath
  // an already-applied live transform, even when the two commits are apart.
  for (const base of [{ baseX: 0.4, baseY: 0.5 }, { baseX: 0.63, baseY: 0.72 }]) {
    const frame = getRoomV2LiveAvatarFrame({ ...input, ...base })
    assert.ok(Math.abs(frame.translateX + frame.width * input.anchorX - input.liveX * 390) < 1e-9)
    assert.ok(Math.abs(frame.translateY + frame.height * input.anchorY - input.liveY * 292) < 1e-9)
    assert.deepEqual(frame, getRoomV2LiveAvatarFrame(input))
  }
})

test("a live avatar offset moves the base-laid-out box onto the box the renderer lays out at the live point", () => {
  const item = { width: 0.2, height: 0.34, anchorX: 0.5, anchorY: 0.92 }
  const stage = { stageWidthPx: 390, stageHeightPx: 292 }
  const layout = (x: number, y: number) => {
    const scale = getRoomV2DepthPerspectiveScale(y)
    const width = item.width * scale
    const height = item.height * scale
    const left = x - width * item.anchorX
    const top = y - height * item.anchorY
    return {
      centerX: (left + width / 2) * stage.stageWidthPx,
      centerY: (top + height / 2) * stage.stageHeightPx,
      width: width * stage.stageWidthPx
    }
  }
  const base = { x: 0.42, y: 0.61 }
  for (const live of [{ x: 0.42, y: 0.61 }, { x: 0.5, y: 0.7 }, { x: 0.2, y: 0.45 }]) {
    const offset = getRoomV2LiveAvatarOffset({
      ...item,
      ...stage,
      baseX: base.x,
      baseY: base.y,
      liveX: live.x,
      liveY: live.y
    })
    const from = layout(base.x, base.y)
    const to = layout(live.x, live.y)
    assert.ok(Math.abs(from.centerX + offset.translateX - to.centerX) < 1e-9)
    assert.ok(Math.abs(from.centerY + offset.translateY - to.centerY) < 1e-9)
    assert.ok(Math.abs(from.width * offset.scale - to.width) < 1e-9)
  }
  assert.deepEqual(
    getRoomV2LiveAvatarOffset({ ...item, ...stage, baseX: 0.3, baseY: 0.6, liveX: 0.3, liveY: 0.6 }),
    { translateX: 0, translateY: 0, scale: 1 }
  )
})
