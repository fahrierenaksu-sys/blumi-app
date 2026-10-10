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
  },
  // The blush chair's room-camera back layers (2.5D layered furniture).
  room_v2_chair_blush_layered_r0_back: {
    aspect: 305 / 246,
    points: [
      { x: 0.372, y: 0.02 }, { x: 0.556, y: 0.02 }, { x: 0.717, y: 0.181 }, { x: 0.717, y: 0.799 },
      { x: 0.544, y: 0.971 }, { x: 0.241, y: 0.971 }, { x: 0.018, y: 0.748 }, { x: 0.018, y: 0.374 }
    ]
  },
  room_v2_chair_blush_layered_r1_back: {
    aspect: 277 / 246,
    points: [
      { x: 0.15, y: 0.049 }, { x: 0.443, y: 0.049 }, { x: 0.784, y: 0.391 }, { x: 0.784, y: 0.748 },
      { x: 0.574, y: 0.959 }, { x: 0.196, y: 0.959 }, { x: 0.006, y: 0.769 }, { x: 0.006, y: 0.192 }
    ]
  },
  room_v2_chair_blush_layered_r2_back: {
    aspect: 280 / 216,
    points: [
      { x: 0.125, y: 0.029 }, { x: 0.418, y: 0.029 }, { x: 0.78, y: 0.391 }, { x: 0.78, y: 0.772 },
      { x: 0.586, y: 0.966 }, { x: 0.273, y: 0.966 }, { x: 0.02, y: 0.714 }, { x: 0.02, y: 0.134 }
    ]
  },
  room_v2_chair_blush_layered_r3_back: {
    aspect: 304 / 217,
    points: [
      { x: 0.38, y: 0.029 }, { x: 0.61, y: 0.029 }, { x: 0.712, y: 0.131 }, { x: 0.712, y: 0.723 },
      { x: 0.473, y: 0.962 }, { x: 0.194, y: 0.962 }, { x: 0.015, y: 0.782 }, { x: 0.015, y: 0.394 }
    ]
  },
  // The pilot sofa's room-camera back layers (2.5D layered furniture).
  room_v3_sofa_japon_cream_layered_r0_back: {
    aspect: 424 / 338,
    points: [
      { x: 0.257, y: 0.014 }, { x: 0.529, y: 0.014 }, { x: 0.788, y: 0.273 }, { x: 0.788, y: 0.854 },
      { x: 0.656, y: 0.986 }, { x: 0.241, y: 0.986 }, { x: 0.009, y: 0.754 }, { x: 0.009, y: 0.262 }
    ]
  },
  room_v3_sofa_japon_cream_layered_r1_back: {
    aspect: 424 / 338,
    points: [
      { x: 0.268, y: 0.014 }, { x: 0.54, y: 0.014 }, { x: 0.788, y: 0.262 }, { x: 0.788, y: 0.756 },
      { x: 0.558, y: 0.986 }, { x: 0.143, y: 0.986 }, { x: 0.009, y: 0.852 }, { x: 0.009, y: 0.273 }
    ]
  },
  room_v3_sofa_japon_cream_layered_r2_back: {
    aspect: 424 / 317,
    points: [
      { x: 0.132, y: 0.015 }, { x: 0.487, y: 0.015 }, { x: 0.788, y: 0.317 }, { x: 0.788, y: 0.844 },
      { x: 0.648, y: 0.985 }, { x: 0.255, y: 0.985 }, { x: 0.009, y: 0.738 }, { x: 0.009, y: 0.138 }
    ]
  },
  room_v3_sofa_japon_cream_layered_r3_back: {
    aspect: 424 / 317,
    points: [
      { x: 0.31, y: 0.015 }, { x: 0.665, y: 0.015 }, { x: 0.788, y: 0.138 }, { x: 0.788, y: 0.74 },
      { x: 0.543, y: 0.985 }, { x: 0.151, y: 0.985 }, { x: 0.009, y: 0.842 }, { x: 0.009, y: 0.317 }
    ]
  },
  // The seat art of the Japon armchair and bed, the Oyun bed and tea set; room_v3_armchair_japon_cream: room-camera back layers (2.5D layered furniture)
  room_v3_armchair_japon_cream_layered_r0_back: {
    aspect: 360 / 305,
    points: [
      { x: 0.224, y: 0.016 }, { x: 0.576, y: 0.016 }, { x: 0.749, y: 0.22 }, { x: 0.749, y: 0.809 },
      { x: 0.601, y: 0.984 }, { x: 0.18, y: 0.984 }, { x: 0.012, y: 0.786 }, { x: 0.012, y: 0.266 }
    ]
  },
  room_v3_armchair_japon_cream_layered_r1_back: {
    aspect: 360 / 305,
    points: [
      { x: 0.185, y: 0.016 }, { x: 0.537, y: 0.016 }, { x: 0.749, y: 0.266 }, { x: 0.749, y: 0.786 },
      { x: 0.582, y: 0.984 }, { x: 0.16, y: 0.984 }, { x: 0.012, y: 0.809 }, { x: 0.012, y: 0.22 }
    ]
  },
  room_v3_armchair_japon_cream_layered_r2_back: {
    aspect: 360 / 282,
    points: [
      { x: 0.154, y: 0.018 }, { x: 0.563, y: 0.018 }, { x: 0.749, y: 0.256 }, { x: 0.749, y: 0.794 },
      { x: 0.602, y: 0.982 }, { x: 0.179, y: 0.982 }, { x: 0.012, y: 0.769 }, { x: 0.012, y: 0.199 }
    ]
  },
  room_v3_armchair_japon_cream_layered_r3_back: {
    aspect: 360 / 282,
    points: [
      { x: 0.198, y: 0.018 }, { x: 0.607, y: 0.018 }, { x: 0.749, y: 0.199 }, { x: 0.749, y: 0.769 },
      { x: 0.582, y: 0.982 }, { x: 0.159, y: 0.982 }, { x: 0.012, y: 0.794 }, { x: 0.012, y: 0.256 }
    ]
  },
  // room_v3_bed_japon_sakura: room-camera back layers (2.5D layered furniture)
  room_v3_bed_japon_sakura_layered_r0_back: {
    aspect: 623 / 390,
    points: [
      { x: 0.152, y: 0.011 }, { x: 0.617, y: 0.011 }, { x: 0.902, y: 0.466 }, { x: 0.902, y: 0.749 },
      { x: 0.752, y: 0.989 }, { x: 0.205, y: 0.989 }, { x: 0.003, y: 0.667 }, { x: 0.003, y: 0.248 }
    ]
  },
  room_v3_bed_japon_sakura_layered_r1_back: {
    aspect: 623 / 330,
    points: [
      { x: 0.12, y: 0.014 }, { x: 0.761, y: 0.014 }, { x: 0.902, y: 0.281 }, { x: 0.902, y: 0.609 },
      { x: 0.713, y: 0.968 }, { x: 0.141, y: 0.968 }, { x: 0.003, y: 0.706 }, { x: 0.003, y: 0.236 }
    ]
  },
  room_v3_bed_japon_sakura_layered_r2_back: {
    aspect: 647 / 330,
    points: [
      { x: 0.138, y: 0.014 }, { x: 0.756, y: 0.014 }, { x: 0.869, y: 0.236 }, { x: 0.869, y: 0.707 },
      { x: 0.736, y: 0.968 }, { x: 0.185, y: 0.968 }, { x: 0.002, y: 0.61 }, { x: 0.002, y: 0.281 }
    ]
  },
  room_v3_bed_japon_sakura_layered_r3_back: {
    aspect: 647 / 390,
    points: [
      { x: 0.277, y: 0.011 }, { x: 0.726, y: 0.011 }, { x: 0.869, y: 0.248 }, { x: 0.869, y: 0.667 },
      { x: 0.675, y: 0.989 }, { x: 0.147, y: 0.989 }, { x: 0.002, y: 0.749 }, { x: 0.002, y: 0.466 }
    ]
  },
  // room_v3_bed_oyun_gingham: room-camera back layers (2.5D layered furniture)
  room_v3_bed_oyun_gingham_layered_r0_back: {
    aspect: 555 / 382,
    points: [
      { x: 0.149, y: 0.012 }, { x: 0.555, y: 0.012 }, { x: 0.93, y: 0.557 }, { x: 0.93, y: 0.765 },
      { x: 0.778, y: 0.985 }, { x: 0.207, y: 0.985 }, { x: 0.005, y: 0.692 }, { x: 0.005, y: 0.222 }
    ]
  },
  room_v3_bed_oyun_gingham_layered_r1_back: {
    aspect: 553 / 305,
    points: [
      { x: 0.083, y: 0.018 }, { x: 0.756, y: 0.018 }, { x: 0.937, y: 0.346 }, { x: 0.937, y: 0.576 },
      { x: 0.713, y: 0.982 }, { x: 0.15, y: 0.982 }, { x: 0.005, y: 0.72 }, { x: 0.005, y: 0.159 }
    ]
  },
  room_v3_bed_oyun_gingham_layered_r2_back: {
    aspect: 608 / 305,
    points: [
      { x: 0.165, y: 0.018 }, { x: 0.782, y: 0.018 }, { x: 0.85, y: 0.152 }, { x: 0.85, y: 0.717 },
      { x: 0.716, y: 0.982 }, { x: 0.203, y: 0.982 }, { x: 0.004, y: 0.585 }, { x: 0.004, y: 0.339 }
    ]
  },
  room_v3_bed_oyun_gingham_layered_r3_back: {
    aspect: 609 / 385,
    points: [
      { x: 0.349, y: 0.012 }, { x: 0.715, y: 0.012 }, { x: 0.852, y: 0.228 }, { x: 0.852, y: 0.694 },
      { x: 0.668, y: 0.985 }, { x: 0.148, y: 0.985 }, { x: 0.004, y: 0.757 }, { x: 0.004, y: 0.558 }
    ]
  },
  // room_v3_teaset_oyun_flower: room-camera back layers (2.5D layered furniture)
  room_v3_teaset_oyun_flower_layered_r0_back: {
    aspect: 498 / 363,
    points: [
      { x: 0.262, y: 0.013 }, { x: 0.73, y: 0.013 }, { x: 0.824, y: 0.143 }, { x: 0.824, y: 0.659 },
      { x: 0.595, y: 0.973 }, { x: 0.083, y: 0.973 }, { x: 0.007, y: 0.868 }, { x: 0.007, y: 0.363 }
    ]
  },
  room_v3_teaset_oyun_flower_layered_r1_back: {
    aspect: 458 / 354,
    points: [
      { x: 0.068, y: 0.014 }, { x: 0.47, y: 0.014 }, { x: 0.878, y: 0.542 }, { x: 0.878, y: 0.853 },
      { x: 0.782, y: 0.978 }, { x: 0.262, y: 0.978 }, { x: 0.009, y: 0.65 }, { x: 0.009, y: 0.09 }
    ]
  },
  room_v3_teaset_oyun_flower_layered_r2_back: {
    aspect: 505 / 339,
    points: [
      { x: 0.274, y: 0.015 }, { x: 0.752, y: 0.015 }, { x: 0.813, y: 0.107 }, { x: 0.813, y: 0.61 },
      { x: 0.565, y: 0.979 }, { x: 0.058, y: 0.979 }, { x: 0.007, y: 0.902 }, { x: 0.007, y: 0.413 }
    ]
  },
  room_v3_teaset_oyun_flower_layered_r3_back: {
    aspect: 505 / 360,
    points: [
      { x: 0.149, y: 0.014 }, { x: 0.56, y: 0.014 }, { x: 0.797, y: 0.347 }, { x: 0.797, y: 0.878 },
      { x: 0.722, y: 0.984 }, { x: 0.235, y: 0.984 }, { x: 0.007, y: 0.664 }, { x: 0.007, y: 0.214 }
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
