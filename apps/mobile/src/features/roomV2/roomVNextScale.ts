import {
  ROOM_FLOOR_DEPTH_UNITS_PER_CM as ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM,
  ROOM_STAGE_UNITS_PER_CM as ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM
} from "./roomV2FurnitureGeometry"

export { ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM, ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM }

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
