import assert from "node:assert/strict"
import test from "node:test"
import {
  MINI_ROOM_INPUT_LINE_HEIGHT,
  MINI_ROOM_INPUT_MAX_LINES,
  MINI_ROOM_INPUT_VERTICAL_PADDING,
  resolveComposerLineCount,
  resolveKeyboardInset,
  resolveMiniRoomLayout,
  type MiniRoomLayout,
  type MiniRoomLayoutInput
} from "./miniRoomLayout"

const ROOM_ASPECT = 1254 / 714

const iphone17: MiniRoomLayoutInput = {
  windowWidth: 402,
  windowHeight: 874,
  safeTop: 62,
  safeBottom: 34,
  keyboardVisible: false,
  keyboardInset: 0,
  chatExpanded: true,
  fontScale: 1,
  roomAspectRatio: ROOM_ASPECT
}

const iphoneSe: MiniRoomLayoutInput = {
  ...iphone17,
  windowWidth: 375,
  windowHeight: 667,
  safeTop: 20,
  safeBottom: 0
}

function withKeyboard(input: MiniRoomLayoutInput, inset: number): MiniRoomLayoutInput {
  return { ...input, keyboardVisible: true, keyboardInset: inset }
}

function panelTop(input: MiniRoomLayoutInput, layout: MiniRoomLayout): number {
  return input.windowHeight - layout.panelBottom - layout.panelHeight
}

function cameraBottom(layout: MiniRoomLayout): number {
  return layout.camera.top + layout.camera.height
}

test("the default shared room opens with chat history between a balanced room and the composer", () => {
  const layout = resolveMiniRoomLayout(iphone17)

  assert.equal(layout.panelMode, "history")
  assert.equal(layout.historyVisible, true)
  assert.ok(layout.historyHeight > 0)
  assert.equal(layout.panelBottom, 34, "the panel rests on the home-indicator safe area")
  assert.ok(layout.headerTop >= iphone17.safeTop, "the header clears the status bar")
  // The room is wider than the phone and centred horizontally.
  assert.ok(layout.camera.width > iphone17.windowWidth)
  assert.equal(layout.camera.left, Math.round((iphone17.windowWidth - layout.camera.width) / 2))
  assert.ok(layout.camera.top >= layout.headerBottom + 12, "room stays below the header")
  assert.ok(cameraBottom(layout) <= panelTop(iphone17, layout) - 22, "room is clearly separated from chat")
})

test("an open keyboard hides history, compacts the header and keeps the room scale", () => {
  const closed = resolveMiniRoomLayout(iphone17)
  const input = withKeyboard(iphone17, 336)
  const open = resolveMiniRoomLayout(input)

  assert.equal(open.panelMode, "typing")
  assert.equal(open.historyVisible, false)
  assert.equal(open.historyHeight, 0)
  assert.ok(open.headerTop < closed.headerTop)
  // The keyboard replaces the safe-area inset instead of stacking on it.
  assert.equal(open.panelBottom, 336)
  assert.equal(open.camera.width, closed.camera.width, "no zoom-out when the room still fits")
  assert.ok(open.camera.top < closed.camera.top, "the room is raised above the composer")
  assert.ok(cameraBottom(open) <= panelTop(input, open))
  assert.ok(open.camera.top >= open.headerBottom)
})

test("closing the keyboard restores the previous history and room framing exactly", () => {
  const before = resolveMiniRoomLayout(iphone17)
  resolveMiniRoomLayout(withKeyboard(iphone17, 336))
  assert.deepEqual(resolveMiniRoomLayout({ ...iphone17 }), before)

  const collapsed = { ...iphone17, chatExpanded: false }
  const collapsedBefore = resolveMiniRoomLayout(collapsed)
  assert.equal(resolveMiniRoomLayout(withKeyboard(collapsed, 336)).panelMode, "typing")
  assert.deepEqual(resolveMiniRoomLayout(collapsed), collapsedBefore)
})

test("the panel follows the measured keyboard height, including suggestions and taller layouts", () => {
  for (const inset of [291, 336, 346, 390]) {
    const input = withKeyboard(iphone17, inset)
    const layout = resolveMiniRoomLayout(input)
    assert.equal(layout.panelBottom, inset)
    assert.ok(cameraBottom(layout) <= panelTop(input, layout), `room floor clears the composer at ${inset}`)
    assert.ok(layout.camera.width >= Math.round(402 * 1.12), `room is not a thumbnail at ${inset}`)
  }
})

test("a keyboard that does not overlap the window (Android resize) adds no bottom space", () => {
  const layout = resolveMiniRoomLayout(withKeyboard(iphone17, 0))
  assert.equal(layout.panelMode, "typing")
  assert.equal(layout.panelBottom, 0)
})

test("the small supported phone keeps a readable room with the keyboard open", () => {
  const input = withKeyboard(iphoneSe, 260)
  const layout = resolveMiniRoomLayout(input)

  assert.ok(layout.camera.width >= Math.round(375 * 1.12))
  assert.ok(cameraBottom(layout) <= panelTop(input, layout))
  assert.ok(layout.camera.top >= layout.headerBottom)

  // A much taller keyboard limits the zoom-out; the ceiling slides under the
  // glass header while the floor and avatars stay above the composer.
  const tallInput = withKeyboard(iphoneSe, 320)
  const tall = resolveMiniRoomLayout(tallInput)
  assert.ok(tall.camera.width >= tallInput.windowWidth && tall.camera.width <= layout.camera.width)
  assert.ok(cameraBottom(tall) <= panelTop(tallInput, tall))
})

test("collapsing chat keeps only the compact composer and gives the room more space", () => {
  const expanded = resolveMiniRoomLayout(iphone17)
  const collapsed = resolveMiniRoomLayout({ ...iphone17, chatExpanded: false })

  assert.equal(collapsed.panelMode, "compact")
  assert.equal(collapsed.historyVisible, false)
  assert.ok(collapsed.panelHeight < expanded.panelHeight)
  assert.ok(collapsed.camera.top >= expanded.camera.top)
  assert.equal(collapsed.camera.width, expanded.camera.width)
})

test("large text grows history and the composer within bounds without shrinking the room to a preview", () => {
  const regular = resolveMiniRoomLayout(iphone17)
  const large = resolveMiniRoomLayout({ ...iphone17, fontScale: 2.2 })

  assert.ok(large.historyHeight > regular.historyHeight)
  assert.ok(large.composerMaxInputHeight > regular.composerMaxInputHeight)
  assert.equal(large.camera.width, regular.camera.width)

  const smallLarge = resolveMiniRoomLayout({ ...iphoneSe, fontScale: 1.35 })
  const band = panelTop(iphoneSe, smallLarge) - 22 - (smallLarge.headerBottom + 12)
  assert.ok(band >= 230 || smallLarge.historyHeight === 96, "history gives way before the room")
})

test("the composer grows to four lines before scrolling inside itself", () => {
  const layout = resolveMiniRoomLayout(iphone17)
  assert.equal(
    layout.composerMaxInputHeight,
    MINI_ROOM_INPUT_LINE_HEIGHT * MINI_ROOM_INPUT_MAX_LINES + MINI_ROOM_INPUT_VERTICAL_PADDING * 2
  )
})

test("every mode keeps the room's aspect ratio so world coordinates never move", () => {
  const modes = [
    iphone17,
    { ...iphone17, chatExpanded: false },
    withKeyboard(iphone17, 336),
    withKeyboard(iphoneSe, 320),
    { ...iphoneSe, windowWidth: 350 }
  ]
  for (const input of modes) {
    const { camera } = resolveMiniRoomLayout(input)
    assert.ok(Math.abs(camera.width / camera.height - ROOM_ASPECT) < 0.01)
  }
})

test("keyboard inset is the real overlap of the reported keyboard frame", () => {
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: 538, keyboardHeight: 336 }), 336)
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: 874, keyboardHeight: 336 }), 0)
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: 1210, keyboardHeight: 336 }), 0)
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: undefined, keyboardHeight: 291 }), 291)
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: 400, keyboardHeight: 336 }), 336)
  assert.equal(resolveKeyboardInset({ windowHeight: 874, keyboardScreenY: Number.NaN, keyboardHeight: undefined }), 0)
})

test("a wrapped message lifts the room with the growing composer instead of covering it", () => {
  const oneLine = withKeyboard(iphone17, 336)
  const threeLines = { ...oneLine, composerLines: 3 }
  const single = resolveMiniRoomLayout(oneLine)
  const wrapped = resolveMiniRoomLayout(threeLines)

  const fourLines = resolveMiniRoomLayout({ ...oneLine, composerLines: 4 })
  assert.ok(single.panelHeight < wrapped.panelHeight, "the panel grows with the text")
  assert.ok(wrapped.panelHeight < fourLines.panelHeight)
  assert.ok(cameraBottom(wrapped) <= panelTop(threeLines, wrapped), "floor stays above the taller composer")
  // Beyond four lines the input scrolls inside itself; the panel stops growing.
  assert.equal(
    resolveMiniRoomLayout({ ...oneLine, composerLines: 9 }).panelHeight,
    resolveMiniRoomLayout({ ...oneLine, composerLines: 4 }).panelHeight
  )
  // Sending clears the text: back to one line and the previous framing.
  assert.deepEqual(resolveMiniRoomLayout({ ...oneLine, composerLines: 1 }), single)
})

test("the composer line count follows the reported text height", () => {
  assert.equal(resolveComposerLineCount({ contentHeight: 37, fontScale: 1 }), 1)
  assert.equal(resolveComposerLineCount({ contentHeight: 18 + 19 * 2, fontScale: 1 }), 2)
  assert.equal(resolveComposerLineCount({ contentHeight: 18 + 19 * 3, fontScale: 1 }), 3)
  assert.equal(resolveComposerLineCount({ contentHeight: 18 + 19 * 12, fontScale: 1 }), 4)
  assert.equal(resolveComposerLineCount({ contentHeight: 0, fontScale: 1 }), 1)
  assert.equal(resolveComposerLineCount({ contentHeight: 18 + 26 * 2, fontScale: 1.35 }), 2)
})
