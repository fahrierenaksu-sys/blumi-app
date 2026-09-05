export interface RoomStudioModuleFrameInput {
  anchor: { x: number; y: number }
  normalizedWidth: number
  sourceWidth: number
  sourceHeight: number
  stageWidth: number
  stageHeight: number
}

export interface RoomStudioModuleFrame {
  left: number
  top: number
  width: number
  height: number
  anchorX: number
  anchorY: number
}

export function resolveRoomStudioModuleFrame(
  input: RoomStudioModuleFrameInput
): RoomStudioModuleFrame {
  const values = [
    input.anchor.x,
    input.anchor.y,
    input.normalizedWidth,
    input.sourceWidth,
    input.sourceHeight,
    input.stageWidth,
    input.stageHeight
  ]
  if (
    values.some((value) => !Number.isFinite(value) || value <= 0) ||
    input.anchor.x > 1 || input.anchor.y > 1
  ) {
    throw new Error("room_studio_render_geometry_invalid")
  }
  const width = round(input.stageWidth * input.normalizedWidth)
  const height = round(width * input.sourceHeight / input.sourceWidth)
  const anchorX = round(input.stageWidth * input.anchor.x)
  const anchorY = round(input.stageHeight * input.anchor.y)
  return {
    left: round(anchorX - width / 2),
    top: round(anchorY - height),
    width,
    height,
    anchorX,
    anchorY
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
