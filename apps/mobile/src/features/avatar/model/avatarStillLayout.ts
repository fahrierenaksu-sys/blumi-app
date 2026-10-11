import type { AvatarStillRect, AvatarStillResolved } from "@blumi/domain"

/** The crop a still shows: the whole figure, down to the hips, or the head and shoulders. */
export type AvatarStillCrop = "full" | "half" | "bust"

export interface AvatarStillFrame {
  readonly asset: string
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface AvatarStillLayout {
  /** Points per still pixel. */
  readonly scale: number
  readonly frames: readonly AvatarStillFrame[]
  /** Where the still's ground point (the soles) lands in the box, points; full product only. */
  readonly ground: { readonly x: number; readonly y: number } | null
  /** The drawn standing height in points (full product only). */
  readonly figureHeight: number | null
}

/**
 * Places the still layers in a box: the crop window is fitted inside it (contain) and centred, every layer at its
 * baked rect. Pure, so the live canvas (AvatarHero) anchors its figure on exactly the same ground point and height.
 */
export function layoutAvatarStill(
  still: AvatarStillResolved,
  window: AvatarStillRect,
  box: { readonly width: number; readonly height: number },
  body?: { readonly ground: readonly [number, number]; readonly sheetHeight: number }
): AvatarStillLayout {
  const placed = placeStillLayers(still.layers, window, box)
  const { scale, offsetX, offsetY } = placed
  return {
    scale,
    frames: placed.frames,
    ground: body && still.product === "full" ? { x: offsetX + body.ground[0] * scale, y: offsetY + body.ground[1] * scale } : null,
    figureHeight: body && still.product === "full" ? body.sheetHeight * scale : null
  }
}

/** Fits a window inside a box (contain), centred, and places each layer at its baked rect in the window's space. */
export function placeStillLayers(
  layers: readonly { readonly asset: string; readonly rect: AvatarStillRect }[],
  [wx, wy, ww, wh]: AvatarStillRect,
  box: { readonly width: number; readonly height: number }
): { readonly scale: number; readonly offsetX: number; readonly offsetY: number; readonly frames: readonly AvatarStillFrame[] } {
  const scale = Math.min(box.width / ww, box.height / wh)
  const offsetX = (box.width - ww * scale) / 2 - wx * scale
  const offsetY = (box.height - wh * scale) / 2 - wy * scale
  return {
    scale,
    offsetX,
    offsetY,
    frames: layers.map(({ asset, rect: [x, y, w, h] }) => ({
      asset,
      left: offsetX + x * scale,
      top: offsetY + y * scale,
      width: w * scale,
      height: h * scale
    }))
  }
}

/** The window of a crop: full and half use the full layers, the bust its own 256 px layers. */
export function avatarStillWindow(still: AvatarStillResolved, crop: AvatarStillCrop): AvatarStillRect {
  return crop === "bust" && still.product === "bust" ? still.windows.full : still.windows[crop]
}
