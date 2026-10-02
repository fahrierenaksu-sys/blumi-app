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

function parseColor(color: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())
  if (hex) {
    let digits = hex[1]!
    if (digits.length <= 4) digits = digits.split("").map((digit) => digit + digit).join("")
    const value = (index: number) => parseInt(digits.slice(index * 2, index * 2 + 2), 16)
    return [value(0), value(1), value(2), digits.length === 8 ? value(3) / 255 : 1]
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim())
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  }
  return null
}

/**
 * A blob's colour with its view opacity folded into the colour's alpha, or
 * null when the colour cannot be read. A gradient from this colour to
 * transparent draws exactly what the same gradient at that view opacity
 * drew, without the view opacity that makes iOS render the blob offscreen
 * every frame.
 */
export function foldSoftBlobOpacity(color: string, opacity: number): string | null {
  if (opacity === 1) return color
  const parsed = parseColor(color)
  if (!parsed || !(opacity >= 0 && opacity <= 1)) return null
  const [red, green, blue, alpha] = parsed
  const folded = Math.round(alpha * opacity * 1000) / 1000
  return `rgba(${red}, ${green}, ${blue}, ${folded})`
}
