/** The canonical avatar is 170 cm tall in the 0.30 normalized room stage. */
export const ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM = 0.3 / 170
export const ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM = 0.075 / 100

/**
 * Converts a physical extent into the square sprite canvas required by the
 * authored alpha envelope. This keeps the visible prop, not its transparent
 * padding, aligned with the shell's physical scale.
 */
export function getRoomVNextCalibratedRenderSize(input: {
  physicalWidthCm: number
  physicalDepthCm: number
  physicalHeightCm: number
  renderClass: "upright" | "floor_plane"
  bodyAlphaWidthRatio: number
  bodyAlphaHeightRatio: number
}): { width: number; height: number } {
  if (!Number.isFinite(input.physicalWidthCm) || input.physicalWidthCm <= 0 ||
      !Number.isFinite(input.physicalDepthCm) || input.physicalDepthCm <= 0 ||
      !Number.isFinite(input.physicalHeightCm) || input.physicalHeightCm <= 0) {
    throw new Error("Room VNext physical extent must be positive.")
  }
  if (!Number.isFinite(input.bodyAlphaWidthRatio) || input.bodyAlphaWidthRatio <= 0 || input.bodyAlphaWidthRatio > 1 ||
      !Number.isFinite(input.bodyAlphaHeightRatio) || input.bodyAlphaHeightRatio <= 0 || input.bodyAlphaHeightRatio > 1) {
    throw new Error("Room VNext body alpha ratios must be within (0, 1].")
  }
  if (input.renderClass === "floor_plane") {
    return {
      width: Number(
        ((input.physicalWidthCm * ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM) / input.bodyAlphaWidthRatio).toFixed(4)
      ),
      height: Number(
        ((input.physicalDepthCm * ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM) / input.bodyAlphaHeightRatio).toFixed(4)
      )
    }
  }
  const size = Number(
    ((input.physicalHeightCm * ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM) / input.bodyAlphaHeightRatio).toFixed(4)
  )
  return { width: size, height: size }
}
