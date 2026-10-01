/**
 * Ambient (decorative) motion rules shared by the UI layer. Pure, so the
 * decisions are tested in node.
 */

export type SoftBlobVariant = "lobby" | "bootstrap" | "register" | "miniRoom" | "premiumMesh" | "homeLiquid"

/** Variants drawn from images or gradients only: their blobs never render. */
const STATIC_VARIANTS: ReadonlySet<SoftBlobVariant> = new Set(["register", "homeLiquid", "premiumMesh"])

/**
 * The 16 s blob drift runs only where blobs are drawn, on the visible screen
 * (focused page or route) of a foreground app, and never under Reduce Motion
 * (SYS-10, MQ-2).
 */
export function shouldRunSoftBlobLoop(input: {
  variant: SoftBlobVariant
  animated: boolean
  reduceMotion: boolean
  screenFocused: boolean
  appActive: boolean
}): boolean {
  return input.animated &&
    !input.reduceMotion &&
    !STATIC_VARIANTS.has(input.variant) &&
    input.screenFocused &&
    input.appActive
}

/**
 * Pulse progress (0..1 between minScale and maxScale) at which the scale is
 * exactly 1, so a bounded pulse rests at full size instead of shrunk (SYS-9).
 */
export function getPulseRestProgress(minScale: number, maxScale: number): number {
  if (!(maxScale > minScale)) return 0
  return Math.max(0, Math.min(1, (1 - minScale) / (maxScale - minScale)))
}
