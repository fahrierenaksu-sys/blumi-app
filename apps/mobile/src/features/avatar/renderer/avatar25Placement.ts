/**
 * Where the 2.5D figure sits in the room avatar box. The avatarV2 art (256×384 canvas) draws the figure from
 * y≈76 to the soles at y≈343: 69.5% of the box tall with the feet at 89.3%. The 2.5D figure is 16% larger
 * (owner: lab CHAR_SCALE, now 1.35 from lab39 avatar_motion.json via rig25.json `motion.charScale`) on the
 * same foot line.
 */
export const AVATAR25_FOOT_LINE_BOX = 343 / 384
export const AVATAR25_AVATAR_V2_FIGURE_BOX = (343 - 76) / 384
/** The canvas extends this many box heights past each side of the box, so nothing clips. */
const OVERHANG = 0.45

/**
 * `calibratedFigureHeightPx` (the room calibration): her height comes from the room's one world scale
 * and her soles stand on the box's floor point (its bottom), the point walking, depth and taps use. `footLiftPx`
 * is how far that is below the avatarV2 foot line, for placements authored against that line (the seat).
 */
export function getAvatar25BoxPlacement(boxHeightPx: number, charScale: number, calibratedFigureHeightPx?: number) {
  const calibrated = calibratedFigureHeightPx !== undefined && calibratedFigureHeightPx > 0
  const figureHeightPx = calibrated ? calibratedFigureHeightPx : boxHeightPx * AVATAR25_AVATAR_V2_FIGURE_BOX * charScale
  const footLine = calibrated ? 1 : AVATAR25_FOOT_LINE_BOX
  // a calibrated figure may stand taller than the box allows for: the canvas still holds it whole
  const pad = calibrated
    ? Math.max(boxHeightPx * OVERHANG, figureHeightPx * 1.25 - boxHeightPx * footLine)
    : boxHeightPx * OVERHANG
  // canvas: box inset by -pad on every side (box width is unknown here, so horizontal anchor stays centred)
  const canvasHeight = boxHeightPx + pad * 2
  return {
    figureHeightPx,
    footLiftPx: boxHeightPx * (footLine - AVATAR25_FOOT_LINE_BOX),
    anchorX: 0.5,
    anchorY: (pad + boxHeightPx * footLine) / canvasHeight,
    overhangStyle: { top: -pad, bottom: -pad, left: -pad, right: -pad }
  }
}
