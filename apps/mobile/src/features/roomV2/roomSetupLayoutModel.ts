export const ROOM_SETUP_TASK_CARD_MIN_HEIGHT = Object.freeze({
  compact: 152,
  regular: 172,
  readyCompact: 132,
  readyRegular: 148
})

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function getRoomSetupStageHeight(
  compact: boolean,
  viewportHeight = compact ? 852 : 956
): number {
  if (viewportHeight < 700) {
    return clamp(Math.round(viewportHeight * 0.53), 344, 360)
  }

  return compact
    ? clamp(Math.round(viewportHeight * 0.46), 376, 404)
    : clamp(Math.round(viewportHeight * 0.49), 436, 500)
}

export function getRoomSetupTaskCardMinHeight(
  compact: boolean,
  ready = false
): number {
  if (ready) {
    return compact
      ? ROOM_SETUP_TASK_CARD_MIN_HEIGHT.readyCompact
      : ROOM_SETUP_TASK_CARD_MIN_HEIGHT.readyRegular
  }
  return compact
    ? ROOM_SETUP_TASK_CARD_MIN_HEIGHT.compact
    : ROOM_SETUP_TASK_CARD_MIN_HEIGHT.regular
}
