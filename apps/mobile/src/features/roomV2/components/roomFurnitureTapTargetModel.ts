// The tap target of a seat (bed, chair) in My Room. A seat's box is its whole
// image canvas, and the drawn piece fills only part of it: the starter bed is
// exported on the shell-sized canvas, so its box spans more than the room
// while the bed covers about a tenth of it. A box-sized target turned taps on
// that empty canvas, which the player sees as floor, into a sit instead of a
// walk. Like the avatar's figure target (roomAvatarTapTargetModel), only the
// drawn piece takes the seat's taps; everything else reaches the floor.

/** A point as shares of an image's width and height (0..1, y down). */
export interface RoomFurnitureOutlinePoint {
  x: number
  y: number
}

export interface RoomFurnitureDrawnOutline {
  /** The image's own width / height, for `contain` letterboxing. */
  aspect: number
  /** Convex outline around every visible pixel, clockwise. */
  points: readonly RoomFurnitureOutlinePoint[]
}

/**
 * Measured from the runtime PNGs: an octagon around every pixel with alpha of
 * at least 32, padded by 1% of the image. Keyed by the asset key, so new art
 * gets a new key and a new outline. The room catalog test checks that every
 * seat's art has an outline here that still covers all of its pixels.
 */
export const ROOM_FURNITURE_DRAWN_OUTLINES: Readonly<Record<string, RoomFurnitureDrawnOutline>> = Object.freeze({
  room_v2_furniture_world_chair_v1: {
    aspect: 263 / 257,
    points: [
      { x: 0.18, y: 0 }, { x: 0.615, y: 0 }, { x: 0.974, y: 0.367 }, { x: 0.974, y: 0.769 },
      { x: 0.77, y: 0.977 }, { x: 0.203, y: 0.977 }, { x: 0.022, y: 0.792 }, { x: 0.022, y: 0.161 }
    ]
  },
  room_v2_modeled_pink_cloud_bed_front_body_v29: {
    aspect: 1254 / 714,
    points: [
      { x: 0.465, y: 0.245 }, { x: 0.578, y: 0.245 }, { x: 0.644, y: 0.362 }, { x: 0.644, y: 0.476 },
      { x: 0.565, y: 0.615 }, { x: 0.411, y: 0.615 }, { x: 0.353, y: 0.514 }, { x: 0.353, y: 0.442 }
    ]
  },
  room_v2_modeled_pink_cloud_bed_right_body_v29: {
    aspect: 1254 / 714,
    points: [
      { x: 0.422, y: 0.246 }, { x: 0.541, y: 0.246 }, { x: 0.649, y: 0.436 }, { x: 0.649, y: 0.505 },
      { x: 0.587, y: 0.614 }, { x: 0.429, y: 0.614 }, { x: 0.355, y: 0.483 }, { x: 0.355, y: 0.365 }
    ]
  },
  room_v2_modeled_pink_cloud_bed_back_body_v29: {
    aspect: 1254 / 714,
    points: [
      { x: 0.413, y: 0.284 }, { x: 0.587, y: 0.284 }, { x: 0.647, y: 0.39 }, { x: 0.647, y: 0.472 },
      { x: 0.565, y: 0.615 }, { x: 0.411, y: 0.615 }, { x: 0.356, y: 0.518 }, { x: 0.356, y: 0.386 }
    ]
  },
  room_v2_modeled_pink_cloud_bed_left_body_v29: {
    aspect: 1254 / 714,
    points: [
      { x: 0.413, y: 0.288 }, { x: 0.594, y: 0.288 }, { x: 0.645, y: 0.379 }, { x: 0.645, y: 0.512 },
      { x: 0.587, y: 0.614 }, { x: 0.429, y: 0.614 }, { x: 0.351, y: 0.476 }, { x: 0.351, y: 0.397 }
    ]
  }
})

/** Apple's smallest comfortable touch target, in points. */
export const ROOM_FURNITURE_MIN_TAP_TARGET_PT = 44

export interface RoomFurnitureTapTarget {
  /** The pressable rectangle in px inside the item's box. */
  left: number
  top: number
  width: number
  height: number
  /** The drawn outline in px inside the item's box. */
  outline: readonly RoomFurnitureOutlinePoint[]
}

/**
 * The seat's tap target in px inside its box, or `null` when its art has no
 * measured outline (then the whole box stays the target, as before).
 * `fit` is how the image fills the box; `mirrored` is a scaleX(-1) image.
 */
export function getRoomFurnitureTapTarget(input: {
  assetKey: string
  boxWidthPx: number
  boxHeightPx: number
  fit: "contain" | "fill"
  mirrored: boolean
}): RoomFurnitureTapTarget | null {
  const drawn = ROOM_FURNITURE_DRAWN_OUTLINES[input.assetKey]
  const boxWidth = Math.max(0, input.boxWidthPx)
  const boxHeight = Math.max(0, input.boxHeightPx)
  if (!drawn || boxWidth <= 0 || boxHeight <= 0) return null

  // Where the image itself lands in the box (expo-image centers `contain`).
  let imageWidth = boxWidth
  let imageHeight = boxHeight
  if (input.fit === "contain" && drawn.aspect > 0) {
    if (boxWidth / boxHeight > drawn.aspect) imageWidth = boxHeight * drawn.aspect
    else imageHeight = boxWidth / drawn.aspect
  }
  const imageLeft = (boxWidth - imageWidth) / 2
  const imageTop = (boxHeight - imageHeight) / 2

  let outline = drawn.points.map((point) => ({
    x: imageLeft + (input.mirrored ? 1 - point.x : point.x) * imageWidth,
    y: imageTop + point.y * imageHeight
  }))

  // A drawn piece smaller than a finger grows around its center.
  const bounds = getBounds(outline)
  const grow = Math.max(
    1,
    ROOM_FURNITURE_MIN_TAP_TARGET_PT / Math.max(1e-6, bounds.right - bounds.left),
    ROOM_FURNITURE_MIN_TAP_TARGET_PT / Math.max(1e-6, bounds.bottom - bounds.top)
  )
  if (grow > 1) {
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    outline = outline.map((point) => ({
      x: centerX + (point.x - centerX) * grow,
      y: centerY + (point.y - centerY) * grow
    }))
  }
  outline = outline.map((point) => ({
    x: Math.min(boxWidth, Math.max(0, point.x)),
    y: Math.min(boxHeight, Math.max(0, point.y))
  }))
  const target = getBounds(outline)
  return {
    left: target.left,
    top: target.top,
    width: target.right - target.left,
    height: target.bottom - target.top,
    outline
  }
}

/** Whether a point in px inside the item's box lands on the drawn seat. */
export function isRoomFurnitureTapOnSeat(
  target: RoomFurnitureTapTarget,
  x: number,
  y: number
): boolean {
  if (x < target.left || x > target.left + target.width || y < target.top || y > target.top + target.height) {
    return false
  }
  return isPointInOutline(target.outline, x, y)
}

/** Whether a point (same units as the outline) lies inside or on a drawn outline. */
export function isPointInOutline(
  outline: readonly RoomFurnitureOutlinePoint[],
  x: number,
  y: number
): boolean {
  let inside = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const a = outline[index]!
    const b = outline[previous]!
    // On an edge counts as inside.
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (Math.abs(cross) < 1e-9 &&
      x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) &&
      y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) {
      return true
    }
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function getBounds(points: readonly RoomFurnitureOutlinePoint[]) {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y))
  }
}
