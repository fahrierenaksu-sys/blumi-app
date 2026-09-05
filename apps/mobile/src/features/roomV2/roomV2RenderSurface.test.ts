import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureMobileRenderScale,
  getRoomV2FurnitureImageResizeMode,
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
