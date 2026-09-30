/**
 * Shared-room screen layout: header, room camera and chat panel, resolved from
 * the real window, safe area, keyboard overlap and text size. Pure so the
 * keyboard and framing rules are proven by node tests.
 *
 * The camera only frames the room: furniture, hotspots and avatars keep their
 * normalised world coordinates inside it, so a layout change never moves them
 * in the room.
 */

export interface MiniRoomLayoutInput {
  windowWidth: number
  windowHeight: number
  safeTop: number
  safeBottom: number
  /** A keyboard is on screen (it may not overlap the window, e.g. Android resize). */
  keyboardVisible: boolean
  /** Measured keyboard overlap with the bottom of the window, in points. */
  keyboardInset: number
  /** The user's history toggle; the keyboard hides history without changing it. */
  chatExpanded: boolean
  fontScale: number
  /** Lines the composer currently shows (1–4); the panel grows upward with it. */
  composerLines?: number
  /** Room shell canvas width / height. */
  roomAspectRatio: number
}

export type MiniRoomPanelMode = "history" | "compact" | "typing"

export interface MiniRoomCameraFrame {
  left: number
  top: number
  width: number
  height: number
}

export interface MiniRoomLayout {
  panelMode: MiniRoomPanelMode
  historyVisible: boolean
  headerTop: number
  headerBottom: number
  horizontalInset: number
  panelMargin: number
  /** Distance from the window bottom to the panel: keyboard or safe area, never both. */
  panelBottom: number
  panelHeight: number
  historyHeight: number
  composerMaxInputHeight: number
  camera: MiniRoomCameraFrame
}

export const MINI_ROOM_HEADER_ROW_HEIGHT = 42
export const MINI_ROOM_INPUT_LINE_HEIGHT = 19
export const MINI_ROOM_INPUT_VERTICAL_PADDING = 9
export const MINI_ROOM_INPUT_MAX_LINES = 4
/** Text scale the composer and history budget for; larger sizes scroll inside. */
export const MINI_ROOM_MAX_TEXT_SCALE = 1.35

const NARROW_WIDTH = 375
const HEADER_GAP = 8
const HEADER_GAP_TYPING = 2
const MIN_BOTTOM_GAP = 12
const COMPOSER_MIN_ROW = 38
const COMPOSER_BOX_CHROME = 10
const PANEL_BORDER = 2
const PANEL_PADDING: Record<MiniRoomPanelMode, { top: number; bottom: number }> = {
  history: { top: 11, bottom: 9 },
  compact: { top: 7, bottom: 7 },
  typing: { top: 7, bottom: 9 }
}
const HISTORY_HEIGHT_RATIO = 0.165
const MIN_HISTORY_HEIGHT = 96
const MAX_HISTORY_HEIGHT = 148
const MAX_SCALED_HISTORY_HEIGHT = 176
/** Room band never shrinks below this to make room for chat history. */
const MIN_ROOM_BAND = 230
const ROOM_HEADROOM = 12
const ROOM_GAP_ABOVE_PANEL: Record<MiniRoomPanelMode, number> = {
  history: 22,
  compact: 34,
  typing: 6
}
/** Approved design framing: the room is wider than the phone, corners soft-cropped. */
const PREFERRED_CAMERA_WIDTH = { regular: 1.4, narrow: 1.45 }
/** The room may shrink to fit only this far; below it the top slides under the glass header. */
const MIN_CAMERA_WIDTH = 1.12
/** Share of free vertical space above the room; it sits slightly nearer the chat. */
const FREE_SPACE_ABOVE = 0.6

export function resolveMiniRoomLayout(input: MiniRoomLayoutInput): MiniRoomLayout {
  const narrow = input.windowWidth < NARROW_WIDTH
  const textScale = clampNumber(input.fontScale, 1, MINI_ROOM_MAX_TEXT_SCALE)
  const keyboardInset = Math.max(0, Math.round(input.keyboardInset))
  const typing = input.keyboardVisible || keyboardInset > 0
  const panelMode: MiniRoomPanelMode = typing
    ? "typing"
    : input.chatExpanded ? "history" : "compact"

  const headerTop = input.safeTop + (typing ? HEADER_GAP_TYPING : HEADER_GAP)
  const headerBottom = headerTop + MINI_ROOM_HEADER_ROW_HEIGHT
  const panelBottom = typing ? keyboardInset : Math.max(input.safeBottom, MIN_BOTTOM_GAP)

  const lineHeight = Math.ceil(MINI_ROOM_INPUT_LINE_HEIGHT * textScale)
  const composerLines = clampNumber(Math.round(input.composerLines ?? 1), 1, MINI_ROOM_INPUT_MAX_LINES)
  const inputRow = Math.max(
    COMPOSER_MIN_ROW,
    lineHeight * composerLines + MINI_ROOM_INPUT_VERTICAL_PADDING * 2
  )
  const composerBox = inputRow + (panelMode === "compact" ? 0 : COMPOSER_BOX_CHROME)
  const padding = PANEL_PADDING[panelMode]
  const panelChrome = padding.top + padding.bottom + PANEL_BORDER + composerBox

  const historyHeight = panelMode === "history"
    ? resolveHistoryHeight({
      windowHeight: input.windowHeight,
      textScale,
      spaceAbovePanelChrome: input.windowHeight - panelBottom - panelChrome - headerBottom
    })
    : 0
  const panelHeight = panelChrome + historyHeight
  const panelTop = input.windowHeight - panelBottom - panelHeight

  return {
    panelMode,
    historyVisible: panelMode === "history",
    headerTop,
    headerBottom,
    horizontalInset: narrow ? 12 : 16,
    panelMargin: narrow ? 10 : panelMode === "compact" ? 15 : 13,
    panelBottom,
    panelHeight,
    historyHeight,
    composerMaxInputHeight: lineHeight * MINI_ROOM_INPUT_MAX_LINES + MINI_ROOM_INPUT_VERTICAL_PADDING * 2,
    camera: resolveCameraFrame({
      windowWidth: input.windowWidth,
      aspectRatio: input.roomAspectRatio > 0 ? input.roomAspectRatio : 1,
      preferredWidthRatio: narrow ? PREFERRED_CAMERA_WIDTH.narrow : PREFERRED_CAMERA_WIDTH.regular,
      bandTop: headerBottom + ROOM_HEADROOM,
      bandBottom: panelTop - ROOM_GAP_ABOVE_PANEL[panelMode]
    })
  }
}

function resolveHistoryHeight(input: {
  windowHeight: number
  textScale: number
  spaceAbovePanelChrome: number
}): number {
  const base = clampNumber(
    Math.round(input.windowHeight * HISTORY_HEIGHT_RATIO),
    MIN_HISTORY_HEIGHT,
    MAX_HISTORY_HEIGHT
  )
  const scaled = Math.min(MAX_SCALED_HISTORY_HEIGHT, Math.round(base * Math.min(input.textScale, 1.25)))
  // Keep the room from turning into a thumbnail: history gives way first.
  const roomSafe = input.spaceAbovePanelChrome - MIN_ROOM_BAND - ROOM_HEADROOM - ROOM_GAP_ABOVE_PANEL.history
  return Math.max(MIN_HISTORY_HEIGHT, Math.min(scaled, Math.floor(roomSafe)))
}

function resolveCameraFrame(input: {
  windowWidth: number
  aspectRatio: number
  preferredWidthRatio: number
  bandTop: number
  bandBottom: number
}): MiniRoomCameraFrame {
  const band = Math.max(0, input.bandBottom - input.bandTop)
  const preferredWidth = input.windowWidth * input.preferredWidthRatio
  const minimumWidth = input.windowWidth * MIN_CAMERA_WIDTH
  const fittedWidth = band * input.aspectRatio
  const width = Math.round(Math.max(minimumWidth, Math.min(preferredWidth, fittedWidth)))
  const height = Math.round(width / input.aspectRatio)
  const freeSpace = band - height
  // With free space the room is balanced in the band; without it the floor
  // stays clear of the chat and only the ceiling slides under the header.
  const top = freeSpace >= 0
    ? input.bandTop + Math.round(freeSpace * FREE_SPACE_ABOVE)
    : input.bandBottom - height
  return {
    left: Math.round((input.windowWidth - width) / 2),
    top: Math.round(top),
    width,
    height
  }
}

/**
 * Lines shown by the composer, from the text height it reports. Changes only
 * when a line is added or removed, so typing does not re-layout the screen.
 */
export function resolveComposerLineCount(input: { contentHeight: number; fontScale: number }): number {
  const lineHeight = Math.ceil(MINI_ROOM_INPUT_LINE_HEIGHT * clampNumber(input.fontScale, 1, MINI_ROOM_MAX_TEXT_SCALE))
  const textHeight = input.contentHeight - MINI_ROOM_INPUT_VERTICAL_PADDING * 2
  return clampNumber(Math.round(textHeight / lineHeight), 1, MINI_ROOM_INPUT_MAX_LINES)
}

/**
 * The keyboard's real overlap with the window, from its reported end frame.
 * A frame that ends below the window (hidden) gives 0.
 */
export function resolveKeyboardInset(input: {
  windowHeight: number
  keyboardScreenY: number | undefined
  keyboardHeight: number | undefined
}): number {
  const height = Number.isFinite(input.keyboardHeight) ? Math.max(0, input.keyboardHeight ?? 0) : 0
  if (!Number.isFinite(input.keyboardScreenY)) return Math.round(height)
  const overlap = input.windowHeight - (input.keyboardScreenY ?? input.windowHeight)
  return Math.round(clampNumber(overlap, 0, height > 0 ? height : input.windowHeight))
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}
