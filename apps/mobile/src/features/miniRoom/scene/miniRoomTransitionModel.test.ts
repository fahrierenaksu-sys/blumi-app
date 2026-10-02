import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomLayout, resolveMiniRoomRestCamera, type MiniRoomLayoutInput } from "./miniRoomLayout"
import {
  resolveMiniRoomContentOpacity, resolveMiniRoomMorphFrame, resolveMiniRoomOpeningProgress, resolveMiniRoomSettlingProgress, resolveMiniRoomTextWidths, resolveMiniRoomTransitionDuration, resolveMiniRoomTransitionTarget, shouldDeferMiniRoomLayout,
  type MiniRoomTransitionFrame
} from "./miniRoomTransitionModel"

const phone: MiniRoomLayoutInput = {
  windowWidth: 414, windowHeight: 896, safeTop: 44, safeBottom: 34,
  keyboardVisible: false, keyboardInset: 0, fontScale: 1, roomAspectRatio: 1254 / 714
}
function mix(from: MiniRoomTransitionFrame, to: MiniRoomTransitionFrame, progress: number): MiniRoomTransitionFrame {
  return Object.fromEntries(Object.keys(from).map((key) => {
    const k = key as keyof MiniRoomTransitionFrame
    return [key, from[k] + (to[k] - from[k]) * progress]
  })) as unknown as MiniRoomTransitionFrame
}

test("every opening and closing frame keeps the dock below the actual transformed room floor", () => {
  for (const dimensions of [phone,
    { ...phone, windowWidth: 430, windowHeight: 932, safeTop: 59 },
    { ...phone, windowWidth: 402, windowHeight: 874, safeTop: 62 },
    { ...phone, windowWidth: 375, windowHeight: 667, safeTop: 20, safeBottom: 0 }
  ]) for (const keyboardInset of [260, 302, 335, 390]) for (const composerLines of [1, 2, 4]) {
    const input = { ...dimensions, composerLines, recentMessageHeight: 55 }
    const rest = resolveMiniRoomRestCamera(input)
    const closed = resolveMiniRoomTransitionTarget(rest, resolveMiniRoomLayout(input))
    const open = resolveMiniRoomTransitionTarget(rest, resolveMiniRoomLayout({ ...input, keyboardVisible: true, keyboardInset }))
    for (let i = 0; i <= 100; i++) {
      const pose = mix(closed, open, i / 100)
      const floor = rest.top + rest.height / 2 + pose.cameraY + rest.height * pose.cameraScale / 2
      const panelTop = input.windowHeight - pose.bottom - pose.height
      assert.ok(panelTop - floor >= 19.99, `floor clearance at frame ${i}`)
      assert.ok(pose.height >= Math.min(open.height, closed.height))
      assert.ok(pose.height <= Math.max(open.height, closed.height))
      assert.equal(pose.cameraX, 0)
    }
    // A reversal starts from the visible pose, including its partially grown panel.
    const interrupted = mix(open, closed, 0.43)
    assert.deepEqual(mix(interrupted, open, 0), interrupted)
    assert.deepEqual(mix(interrupted, open, 1), open)
  }
})

test("history and recent text never have simultaneous readable opacity; context returns late", () => {
  for (let i = 0; i <= 100; i++) {
    const opacity = resolveMiniRoomContentOpacity(i / 100)
    assert.ok(opacity.history === 0 || opacity.recent === 0)
    for (const value of Object.values(opacity)) assert.ok(value >= 0 && value <= 1)
  }
  assert.deepEqual(resolveMiniRoomContentOpacity(0), { history: 1, recent: 0, context: 1 })
  assert.deepEqual(resolveMiniRoomContentOpacity(1), { history: 0, recent: 1, context: 0 })
  assert.equal(resolveMiniRoomContentOpacity(0.4).context, 0)
})

test("opening catches up to UIKit, closing preserves the system duration, Reduce Motion is immediate", () => {
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 350, reduceMotion: false }), 350)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 0, reduceMotion: false }), 280)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: false, keyboardDurationMs: 350, reduceMotion: false }), 180)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 350, reduceMotion: true }), 0)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 350, reduceMotion: false, opening: true }), 200)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 0, reduceMotion: false, opening: true }), 200)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 120, reduceMotion: false, opening: true }), 120)
  assert.equal(resolveMiniRoomTransitionDuration({ keyboardChanged: true, keyboardDurationMs: 350, reduceMotion: true, opening: true }), 0)
})

test("opening clears the composer early and settles without reversing or overshooting", () => {
  assert.equal(resolveMiniRoomOpeningProgress(0), 0)
  assert.equal(resolveMiniRoomOpeningProgress(1), 1)
  assert.equal(resolveMiniRoomOpeningProgress(-1), 0)
  assert.equal(resolveMiniRoomOpeningProgress(2), 1)
  // The old ease-in left the composer under the rising system keyboard.
  assert.ok(resolveMiniRoomOpeningProgress(0.25) >= 0.65)
  let previous = 0
  for (let i = 0; i <= 100; i++) {
    const progress = resolveMiniRoomOpeningProgress(i / 100)
    assert.ok(progress >= previous && progress <= 1)
    previous = progress
  }
  assert.ok(1 - resolveMiniRoomOpeningProgress(0.9) < 0.001)
})

test("keyboard-leading morph keeps the input visible, room floor clear and reversals continuous", () => {
  for (const dimensions of [phone,
    { ...phone, windowWidth: 430, windowHeight: 932, safeTop: 59 },
    { ...phone, windowWidth: 402, windowHeight: 874, safeTop: 62 },
    { ...phone, windowWidth: 375, windowHeight: 667, safeTop: 20, safeBottom: 0 }
  ]) for (const keyboardInset of [260, 302, 335, 390]) for (const composerLines of [1, 2, 4]) {
    const input = { ...dimensions, composerLines, recentMessageHeight: 55 }
    const rest = resolveMiniRoomRestCamera(input)
    const closed = resolveMiniRoomTransitionTarget(rest, resolveMiniRoomLayout(input))
    const openLayout = resolveMiniRoomLayout({ ...input, keyboardVisible: true, keyboardInset })
    const open = resolveMiniRoomTransitionTarget(rest, openLayout)
    const clearance = openLayout.composerInputHeight + 18
    for (let i = 0; i <= 100; i++) {
      const time = i / 100
      const pose = resolveMiniRoomMorphFrame(closed, open,
        resolveMiniRoomOpeningProgress(time), resolveMiniRoomOpeningProgress(time / (200 / 320)), clearance)
      const floor = rest.top + rest.height / 2 + pose.cameraY + rest.height * pose.cameraScale / 2
      const panelTop = input.windowHeight - pose.bottom - pose.height
      assert.ok(panelTop - floor >= 19.99)
      assert.ok(pose.height >= Math.min(clearance, closed.height, open.height) - 0.001)
      assert.ok(pose.height <= Math.max(closed.height, open.height) + 0.001)
      const reversed = resolveMiniRoomMorphFrame(pose, closed, 0, 0, clearance)
      for (const key of Object.keys(pose)) {
        const k = key as keyof MiniRoomTransitionFrame
        assert.ok(Math.abs(reversed[k] - pose[k]) < 0.001)
      }
    }
    assert.deepEqual(resolveMiniRoomMorphFrame(closed, open, 1, 1, clearance), open)
  }
})

test("settling keeps the selected CSS ease curve and exact stationary endpoints", () => {
  assert.equal(resolveMiniRoomSettlingProgress(0), 0)
  assert.equal(resolveMiniRoomSettlingProgress(1), 1)
  assert.ok(Math.abs(resolveMiniRoomSettlingProgress(0.25) - 0.40851) < 0.0001)
  assert.ok(Math.abs(resolveMiniRoomSettlingProgress(0.5) - 0.80240) < 0.0001)
  assert.ok(Math.abs(resolveMiniRoomSettlingProgress(0.75) - 0.96046) < 0.0001)
})

test("text keeps its settled width through every frame, with identical endpoint spacing", () => {
  for (const windowWidth of [375, 402, 414, 430]) {
    const text = resolveMiniRoomTextWidths(windowWidth)
    // Resting paper has 13-point margins plus 16-point history padding.
    assert.equal(text.history + 2 * 16, windowWidth - 2 * 13)
    // The recent strip has 17-point padding in the full-width typing paper.
    assert.equal(text.recent + 2 * 17, windowWidth)
    // Include the paper's 1-point border; composer wrapping changes once per
    // confirmed mode instead of at every changing margin along the animation.
    assert.equal(text.historyComposer + 2 * 9 + 2, windowWidth - 2 * 13)
    assert.equal(text.typingComposer + 2 * 13 + 2, windowWidth)
    for (let i = 0; i <= 100; i++) {
      const animatedPaperWidth = windowWidth - 2 * 13 * (1 - i / 100)
      assert.ok(text.history + 2 * 16 <= animatedPaperWidth)
    }
  }
})

test("late measurements cannot reverse opening or closing; confirmation and hardware fallback release it", () => {
  const pending = { intent: "typing" as const, actual: "history" as const, accessibilityChanged: false }
  assert.equal(shouldDeferMiniRoomLayout(pending), true)
  assert.equal(shouldDeferMiniRoomLayout({ ...pending, actual: "typing" }), false)
  assert.equal(shouldDeferMiniRoomLayout({ ...pending, intent: null }), false)
  assert.equal(shouldDeferMiniRoomLayout({ ...pending, accessibilityChanged: true }), false)
  const closing = { ...pending, intent: "history" as const, actual: "typing" as const }
  assert.equal(shouldDeferMiniRoomLayout(closing), true)
  assert.equal(shouldDeferMiniRoomLayout({ ...closing, actual: "history" }), false)
  assert.equal(shouldDeferMiniRoomLayout({ ...closing, intent: null }), false)
})
