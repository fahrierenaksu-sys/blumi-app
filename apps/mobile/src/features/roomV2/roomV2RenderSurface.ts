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
  "worklet"
  void y
  return 1
}

/** Stable origin: React step/depth commits cannot move the box beneath its transform. */
export function getRoomV2LiveAvatarFrame(input: {
  liveX: number
  liveY: number
  width: number
  height: number
  anchorX: number
  anchorY: number
  stageWidthPx: number
  stageHeightPx: number
}): { width: number; height: number; translateX: number; translateY: number; scale: number } {
  "worklet"
  const scale = getRoomV2DepthPerspectiveScale(input.liveY)
  const width = input.width * input.stageWidthPx
  const height = input.height * input.stageHeightPx
  return {
    width,
    height,
    translateX: input.liveX * input.stageWidthPx - width * input.anchorX + width * (scale - 1) * (0.5 - input.anchorX),
    translateY: input.liveY * input.stageHeightPx - height * input.anchorY + height * (scale - 1) * (0.5 - input.anchorY),
    scale
  }
}

/**
 * The transform that moves an avatar laid out at its React (base) point onto
 * the box the renderer would lay out at its live UI-thread point, so a walk
 * moves on the UI thread without a React render per frame. Transforms use
 * the view centre as origin, hence the centre delta.
 */
export function getRoomV2LiveAvatarOffset(input: {
  baseX: number
  baseY: number
  liveX: number
  liveY: number
  width: number
  height: number
  anchorX: number
  anchorY: number
  stageWidthPx: number
  stageHeightPx: number
}): { translateX: number; translateY: number; scale: number } {
  "worklet"
  const baseScale = getRoomV2DepthPerspectiveScale(input.baseY)
  const liveScale = getRoomV2DepthPerspectiveScale(input.liveY)
  const centerX = (x: number, scale: number): number =>
    x + input.width * scale * (0.5 - input.anchorX)
  const centerY = (y: number, scale: number): number =>
    y + input.height * scale * (0.5 - input.anchorY)
  return {
    translateX: (centerX(input.liveX, liveScale) - centerX(input.baseX, baseScale)) * input.stageWidthPx,
    translateY: (centerY(input.liveY, liveScale) - centerY(input.baseY, baseScale)) * input.stageHeightPx,
    scale: liveScale / baseScale
  }
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
