import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomLayout, resolveMiniRoomRestCamera, resolveComposerLineCount, resolveKeyboardInset, type MiniRoomLayoutInput } from "./miniRoomLayout"

const roomAspectRatio = 1254 / 714
const iphone11: MiniRoomLayoutInput = {
  windowWidth: 414, windowHeight: 896, safeTop: 44, safeBottom: 34,
  keyboardVisible: false, keyboardInset: 0, fontScale: 1, roomAspectRatio
}
const phones = [
  iphone11,
  { ...iphone11, windowWidth: 430, windowHeight: 932, safeTop: 59 },
  { ...iphone11, windowWidth: 402, windowHeight: 874, safeTop: 62 },
  { ...iphone11, windowWidth: 375, windowHeight: 667, safeTop: 20, safeBottom: 0 },
  { ...iphone11, windowWidth: 360, windowHeight: 780, safeTop: 24, safeBottom: 24 }
]
const floor = (input: MiniRoomLayoutInput) => {
  const l = resolveMiniRoomLayout(input)
  return input.windowHeight - l.panelBottom - l.panelHeight - (l.camera.top + l.camera.height)
}
test("the only resting state is the selected history with a modest reading gain", () => {
  const l = resolveMiniRoomLayout(iphone11)
  assert.equal(l.panelMode, "history")
  assert.equal(l.historyVisible, true)
  assert.equal(l.historyHeight, 155)
  assert.equal(l.panelMargin, 13)
  assert.equal(l.panelBottom, 46)
  assert.ok(Math.abs(l.camera.width - 414 * 1.4) < 0.01)
  assert.equal(l.camera.left, (414 - l.camera.width) / 2)
})
test("message length spends only bounded free space and never changes the resting camera", () => {
  const baseline = resolveMiniRoomLayout(iphone11)
  const two = resolveMiniRoomLayout({ ...iphone11, recentHistoryRowsHeight: 162 })
  const long = resolveMiniRoomLayout({ ...iphone11, recentHistoryRowsHeight: 1200 })
  assert.equal(two.historyHeight, 162)
  assert.equal(long.historyHeight, baseline.historyHeight)
  assert.deepEqual(two.camera, baseline.camera)
  assert.deepEqual(long.camera, baseline.camera)
  assert.ok(floor({ ...iphone11, recentHistoryRowsHeight: 162 }) >= 20)
})
test("the keyboard has only the typing state and closing restores history exactly", () => {
  const before = resolveMiniRoomLayout(iphone11)
  const open = resolveMiniRoomLayout({ ...iphone11, keyboardVisible: true, keyboardInset: 302 })
  assert.equal(open.panelMode, "typing")
  assert.equal(open.historyVisible, false)
  assert.equal(open.panelMargin, 0)
  assert.equal(open.panelBottom, 302)
  assert.equal(open.historyHeight, 0)
  assert.ok(open.camera.top < before.camera.top)
  assert.deepEqual(resolveMiniRoomLayout(iphone11), before)
})
test("draft and transcript changes cannot relayout the camera's animation canvas", () => {
  for (const phone of phones) {
    const rest = resolveMiniRoomRestCamera(phone)
    for (const composerLines of [1, 2, 4]) for (const keyboardInset of [0, 302, 390]) {
      assert.deepEqual(resolveMiniRoomRestCamera({ ...phone, composerLines, keyboardInset,
        keyboardVisible: keyboardInset > 0, recentMessageHeight: 55, recentHistoryRowsHeight: 900 }), rest)
    }
  }
})
test("two-line recent messages add only sixteen points; longer messages stay capped", () => {
  const base = { ...iphone11, keyboardVisible: true, keyboardInset: 302 }
  const one = resolveMiniRoomLayout({ ...base, recentMessageHeight: 39 })
  const two = resolveMiniRoomLayout({ ...base, recentMessageHeight: 55 })
  const long = resolveMiniRoomLayout({ ...base, recentMessageHeight: 800 })
  assert.equal(two.panelHeight - one.panelHeight, 16)
  assert.equal(long.panelHeight, two.panelHeight)
  assert.ok(floor({ ...base, recentMessageHeight: 55 }) >= 20)
})
test("supported dimensions, keyboard heights and growing drafts keep the room floor clear", () => {
  for (const phone of phones) for (const inset of [0, 260, 302, 335, 390]) for (const lines of [1, 2, 4]) {
    const input = { ...phone, keyboardVisible: inset > 0, keyboardInset: inset, composerLines: lines, recentMessageHeight: 55 }
    const l = resolveMiniRoomLayout(input)
    assert.ok(floor(input) >= 19.99)
    assert.ok(Math.abs(l.camera.width / l.camera.height - roomAspectRatio) < 0.001)
    assert.equal(l.camera.left, (phone.windowWidth - l.camera.width) / 2)
    assert.ok(l.historyHeight <= 163)
  }
})
test("larger text is bounded and the bottom inset never doubles the safe area", () => {
  const large = resolveMiniRoomLayout({ ...iphone11, fontScale: 2.2, keyboardVisible: true, keyboardInset: 335, recentMessageHeight: 500 })
  assert.equal(large.panelBottom, 335)
  assert.ok(large.composerMaxInputHeight > 92)
  assert.ok(floor({ ...iphone11, fontScale: 2.2, keyboardVisible: true, keyboardInset: 335, recentMessageHeight: 500 }) >= 20)
})
test("Android resized windows have no second keyboard offset", () => {
  const l = resolveMiniRoomLayout({ ...iphone11, keyboardVisible: true, keyboardInset: 0 })
  assert.equal(l.panelMode, "typing")
  assert.equal(l.panelBottom, 0)
})
test("drafts grow to the selected input cap then scroll without further layout growth", () => {
  const input = { ...iphone11, keyboardVisible: true, keyboardInset: 302 }
  const one = resolveMiniRoomLayout({ ...input, composerLines: 1 })
  const four = resolveMiniRoomLayout({ ...input, composerLines: 4 })
  assert.equal(one.composerInputHeight, 44)
  assert.equal(four.composerInputHeight, 92)
  assert.equal(four.panelHeight - one.panelHeight, 48)
  assert.equal(resolveMiniRoomLayout({ ...input, composerLines: 30 }).panelHeight, four.panelHeight)
  assert.equal(resolveComposerLineCount({ contentHeight: 44, fontScale: 1 }), 1)
  assert.equal(resolveComposerLineCount({ contentHeight: 64, fontScale: 1 }), 2)
  assert.equal(resolveComposerLineCount({ contentHeight: 92, fontScale: 1 }), 4)
  assert.equal(resolveComposerLineCount({ contentHeight: 64.2, fontScale: 1 }), 2)
  assert.equal(resolveComposerLineCount({ contentHeight: 999, fontScale: 1 }), 4)
})
test("keyboard overlap follows the actual frame, including a dismissed frame", () => {
  assert.equal(resolveKeyboardInset({windowHeight:896,keyboardScreenY:594,keyboardHeight:302}),302)
  assert.equal(resolveKeyboardInset({windowHeight:896,keyboardScreenY:896,keyboardHeight:302}),0)
  assert.equal(resolveKeyboardInset({windowHeight:896,keyboardScreenY:1198,keyboardHeight:302}),0)
  assert.equal(resolveKeyboardInset({windowHeight:896,keyboardScreenY:undefined,keyboardHeight:302}),302)
  assert.equal(resolveKeyboardInset({windowHeight:896,keyboardScreenY:NaN,keyboardHeight:undefined}),0)
})
