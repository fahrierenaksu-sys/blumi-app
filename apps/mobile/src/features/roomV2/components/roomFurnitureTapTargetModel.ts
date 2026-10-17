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
  // The blush chair's room-camera back layers (2.5D layered furniture).
  room_v2_chair_blush_layered_r0_back: {
    aspect: 193 / 156,
    points: [
      { x: 0.374, y: 0.016 }, { x: 0.552, y: 0.016 }, { x: 0.715, y: 0.178 }, { x: 0.715, y: 0.798 },
      { x: 0.541, y: 0.972 }, { x: 0.245, y: 0.972 }, { x: 0.016, y: 0.743 }, { x: 0.016, y: 0.373 }
    ]
  },
  room_v2_chair_blush_layered_r1_back: {
    aspect: 175 / 156,
    points: [
      { x: 0.187, y: 0.003 }, { x: 0.404, y: 0.003 }, { x: 0.787, y: 0.386 }, { x: 0.787, y: 0.75 },
      { x: 0.579, y: 0.959 }, { x: 0.195, y: 0.959 }, { x: 0.007, y: 0.771 }, { x: 0.007, y: 0.183 }
    ]
  },
  room_v2_chair_blush_layered_r2_back: {
    aspect: 177 / 137,
    points: [
      { x: 0.125, y: 0.026 }, { x: 0.419, y: 0.026 }, { x: 0.784, y: 0.392 }, { x: 0.784, y: 0.764 },
      { x: 0.589, y: 0.959 }, { x: 0.268, y: 0.959 }, { x: 0.018, y: 0.709 }, { x: 0.018, y: 0.133 }
    ]
  },
  room_v2_chair_blush_layered_r3_back: {
    aspect: 192 / 137,
    points: [
      { x: 0.381, y: 0.026 }, { x: 0.61, y: 0.026 }, { x: 0.713, y: 0.129 }, { x: 0.713, y: 0.723 },
      { x: 0.47, y: 0.966 }, { x: 0.196, y: 0.966 }, { x: 0.016, y: 0.786 }, { x: 0.016, y: 0.391 }
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
  // room_v3_bed_blumi_starter: room-camera back layers (convex hull of each back layer's drawn pixels, a few px out)
  room_v3_bed_blumi_starter_layered_r0_back: {
    aspect: 558 / 394,
    points: [
      { x: 0.008, y: 0.162 }, { x: 0.012, y: 0.152 }, { x: 0.021, y: 0.142 }, { x: 0.262, y: 0.014 },
      { x: 0.268, y: 0.011 }, { x: 0.293, y: 0.011 }, { x: 0.299, y: 0.013 }, { x: 0.302, y: 0.016 },
      { x: 0.851, y: 0.471 }, { x: 0.857, y: 0.479 }, { x: 0.858, y: 0.484 }, { x: 0.86, y: 0.639 },
      { x: 0.86, y: 0.816 }, { x: 0.858, y: 0.84 }, { x: 0.856, y: 0.845 }, { x: 0.849, y: 0.855 },
      { x: 0.845, y: 0.858 }, { x: 0.604, y: 0.986 }, { x: 0.596, y: 0.989 }, { x: 0.586, y: 0.989 },
      { x: 0.576, y: 0.986 }, { x: 0.027, y: 0.698 }, { x: 0.024, y: 0.696 }, { x: 0.018, y: 0.69 },
      { x: 0.013, y: 0.678 }, { x: 0.008, y: 0.219 }
    ]
  },
  room_v3_bed_blumi_starter_layered_r1_back: {
    aspect: 558 / 331,
    points: [
      { x: 0.008, y: 0.194 }, { x: 0.01, y: 0.185 }, { x: 0.019, y: 0.17 }, { x: 0.022, y: 0.167 },
      { x: 0.028, y: 0.164 }, { x: 0.588, y: 0.014 }, { x: 0.595, y: 0.014 }, { x: 0.601, y: 0.017 },
      { x: 0.842, y: 0.17 }, { x: 0.851, y: 0.176 }, { x: 0.856, y: 0.186 }, { x: 0.858, y: 0.192 },
      { x: 0.86, y: 0.376 }, { x: 0.86, y: 0.588 }, { x: 0.858, y: 0.615 }, { x: 0.855, y: 0.627 },
      { x: 0.849, y: 0.634 }, { x: 0.842, y: 0.64 }, { x: 0.293, y: 0.984 }, { x: 0.284, y: 0.987 },
      { x: 0.277, y: 0.987 }, { x: 0.269, y: 0.984 }, { x: 0.264, y: 0.981 }, { x: 0.028, y: 0.83 },
      { x: 0.024, y: 0.827 }, { x: 0.019, y: 0.821 }, { x: 0.015, y: 0.815 }, { x: 0.013, y: 0.809 },
      { x: 0.008, y: 0.262 }
    ]
  },
  room_v3_bed_blumi_starter_layered_r2_back: {
    aspect: 592 / 331,
    points: [
      { x: 0.007, y: 0.376 }, { x: 0.009, y: 0.192 }, { x: 0.011, y: 0.186 }, { x: 0.014, y: 0.18 },
      { x: 0.021, y: 0.174 }, { x: 0.029, y: 0.167 }, { x: 0.252, y: 0.017 }, { x: 0.257, y: 0.014 },
      { x: 0.264, y: 0.014 }, { x: 0.792, y: 0.165 }, { x: 0.797, y: 0.168 }, { x: 0.8, y: 0.171 },
      { x: 0.809, y: 0.186 }, { x: 0.81, y: 0.195 }, { x: 0.811, y: 0.263 }, { x: 0.805, y: 0.809 },
      { x: 0.803, y: 0.815 }, { x: 0.798, y: 0.824 }, { x: 0.791, y: 0.83 }, { x: 0.566, y: 0.983 },
      { x: 0.557, y: 0.986 }, { x: 0.55, y: 0.987 }, { x: 0.542, y: 0.984 }, { x: 0.024, y: 0.641 },
      { x: 0.017, y: 0.634 }, { x: 0.01, y: 0.622 }, { x: 0.009, y: 0.616 }, { x: 0.007, y: 0.588 }
    ]
  },
  room_v3_bed_blumi_starter_layered_r3_back: {
    aspect: 592 / 394,
    points: [
      { x: 0.007, y: 0.639 }, { x: 0.008, y: 0.484 }, { x: 0.01, y: 0.479 }, { x: 0.015, y: 0.471 },
      { x: 0.533, y: 0.016 }, { x: 0.536, y: 0.013 }, { x: 0.541, y: 0.011 }, { x: 0.565, y: 0.011 },
      { x: 0.57, y: 0.014 }, { x: 0.798, y: 0.142 }, { x: 0.806, y: 0.152 }, { x: 0.81, y: 0.162 },
      { x: 0.81, y: 0.219 }, { x: 0.806, y: 0.68 }, { x: 0.804, y: 0.685 }, { x: 0.8, y: 0.69 },
      { x: 0.795, y: 0.696 }, { x: 0.792, y: 0.698 }, { x: 0.274, y: 0.986 }, { x: 0.266, y: 0.989 },
      { x: 0.255, y: 0.989 }, { x: 0.248, y: 0.986 }, { x: 0.021, y: 0.858 }, { x: 0.016, y: 0.853 },
      { x: 0.011, y: 0.845 }, { x: 0.009, y: 0.84 }, { x: 0.007, y: 0.816 }
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
