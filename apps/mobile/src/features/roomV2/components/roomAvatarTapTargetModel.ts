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

/** The avatar's tap target in px inside its box of `boxWidthPx` × `boxHeightPx`. */
export function getRoomAvatarTapTarget(boxWidthPx: number, boxHeightPx: number): RoomAvatarTapTarget {
  const width = Math.max(0, boxWidthPx)
  const height = Math.max(0, boxHeightPx)
  const bounds = ROOM_AVATAR_TAP_FIGURE_BOUNDS
  const across = span(bounds.left, bounds.right, width)
  const down = span(bounds.top, bounds.bottom, height)
  return { left: across.offset, top: down.offset, width: across.size, height: down.size }
}
