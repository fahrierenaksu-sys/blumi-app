/**
 * Pure rules that keep MiniRoom avatar motion off the layout system
 * (ROOM-06, ROOM-15). Functions marked 'worklet' run on the UI thread; they
 * are plain functions under node:test.
 */

/** Avatars nearest the back first; ties by id so both phones agree. */
export function resolveMiniRoomAvatarDepthOrder(entries: readonly { id: string; y: number }[]): string {
  "worklet"
  const sorted = entries.slice().sort((a, b) => (a.y === b.y ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.y - b.y))
  let order = ""
  for (let index = 0; index < sorted.length; index += 1) {
    order += index === 0 ? sorted[index]!.id : `|${sorted[index]!.id}`
  }
  return order
}

/** Draw order of one avatar for a depth order: nearer avatars on top. */
export function getMiniRoomAvatarZIndex(order: string, id: string): number {
  return order.split("|").indexOf(id) + 1
}

/**
 * The anchor's offset inside the room for a live room position (0..1). It is
 * a transform, so a walking frame never triggers layout.
 */
export function resolveMiniRoomAvatarAnchorOffset(
  point: { x: number; y: number },
  stage: { width: number; height: number }
): { translateX: number; translateY: number } {
  "worklet"
  return { translateX: point.x * stage.width, translateY: point.y * stage.height }
}

export interface MiniRoomCameraFrame {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Transform that shows the room laid out at `rest` inside `target` (same
 * aspect ratio): translate the centre, then scale about it. The room keeps
 * one layout while the keyboard opens, so its content never re-lays out.
 */
export function resolveMiniRoomCameraTransform(
  rest: MiniRoomCameraFrame,
  target: MiniRoomCameraFrame
): { translateX: number; translateY: number; scale: number } {
  if (!(rest.width > 0)) return { translateX: 0, translateY: 0, scale: 1 }
  return {
    translateX: target.left + target.width / 2 - (rest.left + rest.width / 2),
    translateY: target.top + target.height / 2 - (rest.top + rest.height / 2),
    scale: target.width / rest.width
  }
}
