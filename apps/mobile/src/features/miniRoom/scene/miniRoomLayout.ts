/** MiniRoom-only framing. World coordinates and the room shell remain unchanged. */
export interface MiniRoomLayoutInput {
  windowWidth: number
  windowHeight: number
  safeTop: number
  safeBottom: number
  keyboardVisible: boolean
  keyboardInset: number
  fontScale: number
  composerLines?: number
  /** Native measured recent-message strip, capped at two lines. */
  recentMessageHeight?: number
  /** Native measured newest two history rows including their separator. */
  recentHistoryRowsHeight?: number
  roomAspectRatio: number
}
export type MiniRoomPanelMode = "history" | "typing"
export interface MiniRoomCameraFrame { left: number; top: number; width: number; height: number }
export interface MiniRoomLayout {
  panelMode: MiniRoomPanelMode
  historyVisible: boolean
  headerTop: number
  headerBottom: number
  contextTop: number
  horizontalInset: number
  panelMargin: number
  panelBottom: number
  panelHeight: number
  historyHeight: number
  composerMaxInputHeight: number
  composerInputHeight: number
  camera: MiniRoomCameraFrame
}
export const MINI_ROOM_HEADER_ROW_HEIGHT = 44
export const MINI_ROOM_INPUT_LINE_HEIGHT = 20
export const MINI_ROOM_INPUT_VERTICAL_PADDING = 12
export const MINI_ROOM_INPUT_MAX_LINES = 4
export const MINI_ROOM_MAX_TEXT_SCALE = 1.35
const HISTORY_BASE = 135
const HISTORY_READING_GAIN = 20
const HISTORY_MAX_GAIN = 28
const FLOOR_GAP = 20

export function resolveMiniRoomLayout(input: MiniRoomLayoutInput): MiniRoomLayout {
  "worklet"
  const scale = clamp(input.fontScale, 1, MINI_ROOM_MAX_TEXT_SCALE)
  const typing = input.keyboardVisible || input.keyboardInset > 0
  const panelMode = typing ? "typing" : "history"
  const headerTop = input.safeTop + 8
  const headerBottom = headerTop + MINI_ROOM_HEADER_ROW_HEIGHT
  const panelBottom = typing ? Math.max(0, input.keyboardInset) : input.safeBottom + 12
  const lineHeight = Math.ceil(MINI_ROOM_INPUT_LINE_HEIGHT * scale)
  const composerMaxInputHeight = Math.round(92 * scale)
  const lines = clamp(Math.round(input.composerLines ?? 1), 1, MINI_ROOM_INPUT_MAX_LINES)
  const composerHeight = Math.min(composerMaxInputHeight, Math.max(44, lineHeight * lines + 24))
  const composerExtra = composerHeight - 44
  const recentHeight = clamp(input.recentMessageHeight ?? 39, 39, Math.ceil(32 * scale) + 23)
  const historyBase = Math.round(HISTORY_BASE * scale)
  // Small reading gains use the existing gap; message length never zooms the resting room.
  const typingPanelHeight = 102 + composerExtra + recentHeight - 39
  const framingPanelHeight = typing ? typingPanelHeight + 6 : 220 + composerExtra
  const sceneTop = input.safeTop + (typing ? 73 : 130)
  const sceneBottom = input.windowHeight - panelBottom - framingPanelHeight - FLOOR_GAP
  const aspect = input.roomAspectRatio > 0 ? input.roomAspectRatio : 1
  const cameraWidth = Math.min(input.windowWidth * 1.4, Math.max(input.windowWidth * 1.06, (sceneBottom - sceneTop) * aspect))
  const cameraHeight = cameraWidth / aspect
  const cameraTop = Math.min(
    Math.max(input.safeTop + 60, sceneTop + (sceneBottom - sceneTop - cameraHeight) * 0.55),
    sceneBottom - cameraHeight
  )
  const camera = { left: (input.windowWidth - cameraWidth) / 2, top: cameraTop, width: cameraWidth, height: cameraHeight }
  const historyChrome = 97 + composerExtra
  const maxHistory = Math.max(0, Math.floor(input.windowHeight - panelBottom - historyChrome - cameraTop - cameraHeight - FLOOR_GAP))
  const readingHeight = Math.min(historyBase + HISTORY_READING_GAIN, maxHistory)
  const requested = input.recentHistoryRowsHeight ?? 0
  const historyHeight = typing ? 0 : Math.max(0,
    requested > readingHeight && requested <= Math.min(historyBase + HISTORY_MAX_GAIN, maxHistory)
      ? requested : readingHeight
  )
  return {
    panelMode, historyVisible: !typing, headerTop, headerBottom,
    contextTop: input.safeTop + 73,
    horizontalInset: 16, panelMargin: typing ? 0 : 13,
    panelBottom, panelHeight: typing ? typingPanelHeight : historyChrome + historyHeight,
    historyHeight, composerMaxInputHeight, composerInputHeight: composerHeight, camera
  }
}
/** A stable world canvas: draft/strip/history growth changes only its transform. */
export function resolveMiniRoomRestCamera(input: MiniRoomLayoutInput): MiniRoomCameraFrame {
  "worklet"
  return resolveMiniRoomLayout({ ...input, keyboardVisible: false, keyboardInset: 0, composerLines: 1 }).camera
}
export function resolveComposerLineCount(input: { contentHeight: number; fontScale: number }): number {
  const line = Math.ceil(MINI_ROOM_INPUT_LINE_HEIGHT * clamp(input.fontScale, 1, MINI_ROOM_MAX_TEXT_SCALE))
  // Native reports the capped visible height, including a partly visible last
  // line. Reserve that line too so the room stays clear of the actual input.
  return clamp(Math.ceil((Math.round(input.contentHeight) - MINI_ROOM_INPUT_VERTICAL_PADDING * 2) / line), 1, MINI_ROOM_INPUT_MAX_LINES)
}
function clamp(value: number, minimum: number, maximum: number): number {
  "worklet"
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum
}
