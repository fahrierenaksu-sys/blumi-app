import type { RoomWorldPoint } from "../roomWorld/roomWorldGeometry"

/**
 * Where the room stage is on the screen at one moment: its untransformed
 * layout box (`width` x `height`, the box every room item is positioned in by
 * percentage) and the transform its ancestors apply to it (a camera's zoom
 * and translation, a scroll offset, the safe-area inset). `originX/Y` is the
 * screen point of the box's top-left corner with that transform applied.
 *
 * Stage coordinates are the shell canvas normalized (0..1 on each axis): the
 * renderer sizes its box to the canvas aspect, so a box fraction and a canvas
 * fraction are the same point. The floor model (@blumi/domain roomFloorGrid)
 * maps stage coordinates to floor tiles; together they take a finger on the
 * glass to the exact floor point under it.
 */
export interface RoomStageViewport {
  originX: number
  originY: number
  width: number
  height: number
  /** Uniform scale the ancestors apply (MiniRoom's camera zoom); 1 when none. */
  zoom: number
}

/** Stage point under a screen point. */
export function mapRoomScreenPointToStage(
  viewport: RoomStageViewport,
  screenX: number,
  screenY: number
): RoomWorldPoint {
  "worklet"
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1
  return mapRoomStageLocalPointToStage(
    (screenX - viewport.originX) / zoom,
    (screenY - viewport.originY) / zoom,
    viewport.width,
    viewport.height
  )
}

/** Screen point of a stage point (the inverse of mapRoomScreenPointToStage). */
export function mapRoomStagePointToScreen(
  viewport: RoomStageViewport,
  point: RoomWorldPoint
): { x: number; y: number } {
  "worklet"
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1
  return {
    x: viewport.originX + point.x * viewport.width * zoom,
    y: viewport.originY + point.y * viewport.height * zoom
  }
}

/**
 * Stage point of a touch given in the stage view's own coordinates (Gesture
 * Handler's `x`/`y` on the stage view already undo every ancestor transform),
 * with the box size measured at the moment of the tap. Not clamped: a touch
 * past the floor's edge resolves to the floor point nearest it later, so the
 * walk ends next to the finger rather than at a clamped corner.
 */
export function mapRoomStageLocalPointToStage(
  localX: number,
  localY: number,
  width: number,
  height: number
): RoomWorldPoint {
  "worklet"
  return {
    x: width > 0 ? localX / width : 0,
    y: height > 0 ? localY / height : 0
  }
}
