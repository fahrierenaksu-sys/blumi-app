// The room avatar's own tap target (ROOM-01: tapping the avatar plays the
// wave chain, or stops a walk). The avatar box is the 256×384 frame canvas,
// about twice as wide as the drawn figure, so a box-sized target swallowed
// floor taps right beside the avatar: a walking avatar stopped instead of
// walking there, an idle one waved. The target covers the figure only, so
// those taps reach the floor and walk.

/**
 * The figure's extent inside the avatar box, as shares of its width and
 * height: every room avatar frame's opaque pixels (bodies, hair, outfits,
 * accessories) sit within about 0.24–0.77 across and 0.22–0.94 down. The
 * vertical range stays generous because a seated figure is shifted up.
 */
export const ROOM_AVATAR_TAP_FIGURE_BOUNDS = Object.freeze({
  left: 0.22,
  right: 0.78,
  top: 0.1,
  bottom: 1
})

/** Apple's smallest comfortable touch target, in points. */
export const ROOM_AVATAR_MIN_TAP_TARGET_PT = 44

export interface RoomAvatarTapTarget {
  left: number
  top: number
  width: number
  height: number
}

function span(start: number, end: number, boxPx: number): { offset: number; size: number } {
  const size = Math.min(boxPx, Math.max(ROOM_AVATAR_MIN_TAP_TARGET_PT, (end - start) * boxPx))
  const center = ((start + end) / 2) * boxPx
  const offset = Math.min(boxPx - size, Math.max(0, center - size / 2))
  return { offset, size }
}

/**
 * A calibrated 2.5D figure stands on the box's floor point and is drawn from the room's one world scale,
 * not from the box: it is taller than the box (about 80 pt against a 60 pt box), so the box-based target covered only
 * its legs and chest, and a tap on its head or shoulders fell through to the furniture behind it (a sofa sat her
 * down instead of her waving). Its target is its own figure: this tall, ending at the box bottom, this wide
 * (about its height; arms and a raised wave included), centred on the box.
 */
export const ROOM_AVATAR_FIGURE_TAP_WIDTH_PER_HEIGHT = 0.5
/** Margin above the head and below the soles that a fingertip may miss by (pt). */
export const ROOM_AVATAR_FIGURE_TAP_MARGIN_PT = 4

/**
 * The avatar's tap target in px inside its box of `boxWidthPx` × `boxHeightPx`. `figureHeightPx` is the drawn
 * height of a calibrated 2.5D figure standing on the box's bottom edge; the target may then reach above the box.
 */
export function getRoomAvatarTapTarget(boxWidthPx: number, boxHeightPx: number, figureHeightPx?: number): RoomAvatarTapTarget {
  const width = Math.max(0, boxWidthPx)
  const height = Math.max(0, boxHeightPx)
  if (figureHeightPx !== undefined && figureHeightPx > 0 && width > 0 && height > 0) {
    const targetWidth = Math.max(ROOM_AVATAR_MIN_TAP_TARGET_PT, figureHeightPx * ROOM_AVATAR_FIGURE_TAP_WIDTH_PER_HEIGHT)
    const targetHeight = Math.max(ROOM_AVATAR_MIN_TAP_TARGET_PT, figureHeightPx) + ROOM_AVATAR_FIGURE_TAP_MARGIN_PT
    return {
      left: (width - targetWidth) / 2,
      top: height - targetHeight + ROOM_AVATAR_FIGURE_TAP_MARGIN_PT / 2,
      width: targetWidth,
      height: targetHeight
    }
  }
  const bounds = ROOM_AVATAR_TAP_FIGURE_BOUNDS
  const across = span(bounds.left, bounds.right, width)
  const down = span(bounds.top, bounds.bottom, height)
  return { left: across.offset, top: down.offset, width: across.size, height: down.size }
}
