import type {
  FurnitureCategory,
  RoomLayer,
  RoomPlacementSurface,
  RoomV2RenderItem
} from "./roomV2.types"

/**
 * Furniture scale now lives in the canonical item metadata so collision,
 * tabletop support, seat routes, and the rendered sprite all stay aligned.
 */
export const ROOM_V2_FURNITURE_MOBILE_RENDER_SCALE = 1

/**
 * The locked room is an isometric 2.5D stage: every object shares one stable
 * scale at every floor position. This keeps sprites, collision and seat
 * contacts in the same coordinate system.
 */
export function getRoomV2DepthPerspectiveScale(y: number): number {
  void y
  return 1
}

export function getRoomV2FurnitureMobileRenderScale(
  kind: "furniture" | "avatar"
): number {
  return kind === "furniture" ? ROOM_V2_FURNITURE_MOBILE_RENDER_SCALE : 1
}

export function getRoomV2FurnitureImageResizeMode(
  sceneProjection?: "upright" | "floor_plane"
): "contain" | "stretch" {
  return sceneProjection === "floor_plane" ? "stretch" : "contain"
}

/**
 * Front-seat occlusion is stateful: only furniture currently hosting a
 * seated avatar may replay its foreground crop above the render stack.
 */
export function getRoomV2SeatedFurnitureRenderIds(
  renderItems: RoomV2RenderItem[]
): ReadonlySet<string> {
  return new Set(
    renderItems.flatMap((item) =>
      item.kind === "avatar" && item.state === "sitting" && item.seatRig
        ? [item.seatRig.furnitureRenderId]
        : []
    )
  )
}

export function shouldShowRoomV2FurnitureGroundShadow(input: {
  layer: RoomLayer
  category: FurnitureCategory
  placementSurface?: RoomPlacementSurface
}): boolean {
  void input
  return false
}
