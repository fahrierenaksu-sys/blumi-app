/** Present visible artwork, not its transparent source canvas. No pixels are edited. */
export function getShopThumbnailLayout(bounds: readonly number[] | undefined, width: number, height: number) {
  if (!bounds || bounds.length !== 6 || width <= 12 || height <= 12) return undefined
  const [canvasWidth, canvasHeight, x, y, visibleWidth, visibleHeight] = bounds
  if (!bounds.every(Number.isFinite) || visibleWidth <= 0 || visibleHeight <= 0) return undefined
  const scale = Math.min((width - 12) / visibleWidth, (height - 12) / visibleHeight)
  return {
    width: canvasWidth * scale,
    height: canvasHeight * scale,
    left: (width - visibleWidth * scale) / 2 - x * scale,
    top: (height - visibleHeight * scale) / 2 - y * scale
  }
}
