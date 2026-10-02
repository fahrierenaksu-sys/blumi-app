import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomRestCamera } from "./miniRoomLayout"
import {
  applyMiniRoomPoseOffset, clampMiniRoomFollow, MINI_ROOM_FOLLOW_MARGIN, MINI_ROOM_PAPER_CAP, resolveMiniRoomContentDrift,
  resolveMiniRoomContentOpacity, resolveMiniRoomFollowTarget, resolveMiniRoomKeyboardFrame, resolveMiniRoomPaperGeometry,
  resolveMiniRoomPose, resolveMiniRoomPoseEndpoints, resolveMiniRoomPoseOffset, resolveMiniRoomTextWidths,
  type MiniRoomPoseInput, type MiniRoomTransitionFrame
} from "./miniRoomTransitionModel"

const phone: MiniRoomPoseInput = {
  windowWidth: 414, windowHeight: 896, safeTop: 44, safeBottom: 34, fontScale: 1, roomAspectRatio: 1254 / 714
}
const devices: MiniRoomPoseInput[] = [phone,
  { ...phone, windowWidth: 430, windowHeight: 932, safeTop: 59 },
  { ...phone, windowWidth: 402, windowHeight: 874, safeTop: 62 },
  { ...phone, windowWidth: 375, windowHeight: 667, safeTop: 20, safeBottom: 0 }
]
const keyboards = [260, 302, 335, 390]
const keys = (frame: MiniRoomTransitionFrame) => Object.keys(frame) as (keyof MiniRoomTransitionFrame)[]
const near = (a: number, b: number, epsilon = 1e-6) => Math.abs(a - b) <= epsilon

function* cases() {
  for (const device of devices) for (const keyboardHeight of keyboards) for (const composerLines of [1, 2, 4]) {
    yield { input: { ...device, composerLines, recentMessageHeight: 55 }, keyboardHeight }
  }
}

test("every frame of the keyboard keeps the paper under the room floor and the composer above the keyboard", () => {
  for (const { input, keyboardHeight } of cases()) {
    const rest = resolveMiniRoomRestCamera({ ...input, keyboardVisible: false, keyboardInset: 0 })
    const endpoints = resolveMiniRoomPoseEndpoints(input, keyboardHeight)
    for (let i = 0; i <= 100; i++) {
      const progress = i / 100
      const pose = resolveMiniRoomPose(endpoints, progress)
      const floor = rest.top + rest.height / 2 + pose.cameraY + rest.height * pose.cameraScale / 2
      const paperTop = input.windowHeight - pose.bottom - pose.height
      assert.ok(paperTop - floor >= 19.99, `floor clearance at ${progress}`)
      // The keyboard's top is progress × its height: the paper never sits under it.
      assert.ok(pose.bottom >= progress * keyboardHeight - 1e-9, `composer above the keyboard at ${progress}`)
      assert.equal(pose.cameraX, 0)
    }
  }
})

test("the pose is monotonic and continuous in the keyboard's progress, with exact resting endpoints", () => {
  for (const { input, keyboardHeight } of cases()) {
    const endpoints = resolveMiniRoomPoseEndpoints(input, keyboardHeight)
    assert.deepEqual(resolveMiniRoomPose(endpoints, 0), endpoints.closed)
    assert.deepEqual(resolveMiniRoomPose(endpoints, 1), endpoints.open)
    assert.deepEqual(resolveMiniRoomPose(endpoints, -3), endpoints.closed, "overshoot clamps")
    assert.deepEqual(resolveMiniRoomPose(endpoints, Number.NaN), endpoints.closed)
    let previous = resolveMiniRoomPose(endpoints, 0)
    for (let i = 1; i <= 200; i++) {
      const pose = resolveMiniRoomPose(endpoints, i / 200)
      for (const key of keys(pose)) {
        const direction = Math.sign(endpoints.open[key] - endpoints.closed[key])
        assert.ok(direction * (pose[key] - previous[key]) >= -1e-9, `${key} never turns back`)
        // A 1/200 step of the keyboard moves nothing by more than 1/200 of its travel.
        assert.ok(Math.abs(pose[key] - previous[key]) <= Math.abs(endpoints.open[key] - endpoints.closed[key]) / 200 + 1e-9)
      }
      previous = pose
    }
  }
})

test("a reversal mid-way follows the keyboard back from where it is: the pose depends only on progress", () => {
  const endpoints = resolveMiniRoomPoseEndpoints(phone, 336)
  // Opening to 60 %, then the floor is tapped and the keyboard goes back down.
  const path = [0, 0.2, 0.45, 0.6, 0.52, 0.3, 0.1, 0]
  let previous = resolveMiniRoomPose(endpoints, path[0]!)
  for (const progress of path.slice(1)) {
    const pose = resolveMiniRoomPose(endpoints, progress)
    assert.deepEqual(pose, resolveMiniRoomPose(endpoints, progress), "no hidden clock or history")
    for (const key of keys(pose)) {
      assert.ok(Math.abs(pose[key] - previous[key]) <= Math.abs(endpoints.open[key] - endpoints.closed[key]) * 0.25 + 1e-9,
        "each step moves only as far as the keyboard did")
    }
    previous = pose
  }
  assert.deepEqual(previous, endpoints.closed, "it lands exactly at rest")
})

test("floor tap while typing: the resting paper is the same whatever keyboard was open, and the room never zooms per tap", () => {
  const closedFor = keyboards.map((height) => resolveMiniRoomPoseEndpoints(phone, height).closed)
  for (const closed of closedFor) assert.deepEqual(closed, closedFor[0], "one stable resting pose")
  const closed = closedFor[0]!
  const width = phone.windowWidth
  // A target inside the safe frame: nothing moves.
  for (const pointX of [0.3, 0.5, 0.7]) {
    assert.equal(resolveMiniRoomFollowTarget({ pointX, frame: closed, windowWidth: width, current: 0 }), 0)
  }
  // Near the left edge: pan right just enough to bring it to the safe frame's edge.
  const pan = resolveMiniRoomFollowTarget({ pointX: 0.12, frame: closed, windowWidth: width, current: 0 })
  assert.ok(pan > 0)
  const screenX = width / 2 + pan + (0.12 - 0.5) * closed.roomWidth * closed.cameraScale
  assert.ok(near(screenX, width * MINI_ROOM_FOLLOW_MARGIN, 1e-6) || pan === clampMiniRoomFollow(1e9, closed, width))
  // Never past the room's own edge.
  const far = resolveMiniRoomFollowTarget({ pointX: 0, frame: closed, windowWidth: width, current: 0 })
  assert.equal(far, clampMiniRoomFollow(far + 500, closed, width))
  assert.ok(closed.roomWidth * closed.cameraScale / 2 - far >= width / 2 - 1e-9, "the room still covers the left edge")
  // A second tap at the same place (already inside after the pan) changes nothing.
  assert.equal(resolveMiniRoomFollowTarget({ pointX: 0.12, frame: closed, windowWidth: width, current: pan }), pan)
})

test("a change that is not the keyboard settles from the visible pose without a jump", () => {
  const before = resolveMiniRoomPoseEndpoints({ ...phone, composerLines: 1 }, 336)
  const after = resolveMiniRoomPoseEndpoints({ ...phone, composerLines: 3 }, 336)
  const offset = resolveMiniRoomPoseOffset(before, after)
  for (const progress of [0, 0.4, 1]) {
    const start = resolveMiniRoomPose(applyMiniRoomPoseOffset(after, offset, 1), progress)
    const visible = resolveMiniRoomPose(before, progress)
    for (const key of keys(start)) {
      if (key === "restHeight") continue
      assert.ok(near(start[key], visible[key]), `${key} starts where it was`)
    }
    assert.deepEqual(resolveMiniRoomPose(applyMiniRoomPoseOffset(after, offset, 0), progress), resolveMiniRoomPose(after, progress))
  }
  // The transcript's anchor is its laid-out height at once (it is laid out once, not animated).
  assert.equal(applyMiniRoomPoseOffset(after, offset, 1).closed.restHeight, after.closed.restHeight)
})

test("keyboard frames: progress and the open height come from the real frame", () => {
  assert.deepEqual(resolveMiniRoomKeyboardFrame({ height: 168, progress: 0.5 }, 0), { progress: 0.5, openHeight: 336 })
  assert.deepEqual(resolveMiniRoomKeyboardFrame({ height: 336, progress: 1 }, 300), { progress: 1, openHeight: 336 })
  // The suggestion bar grows the open keyboard: the open height follows.
  assert.deepEqual(resolveMiniRoomKeyboardFrame({ height: 380, progress: 1 }, 336), { progress: 1, openHeight: 380 })
  // A closed frame keeps the last known height for the next opening.
  assert.deepEqual(resolveMiniRoomKeyboardFrame({ height: 0, progress: 0 }, 336), { progress: 0, openHeight: 336 })
  assert.deepEqual(resolveMiniRoomKeyboardFrame({ height: Number.NaN, progress: Number.NaN }, 336), { progress: 0, openHeight: 336 })
  assert.equal(resolveMiniRoomKeyboardFrame({ height: 400, progress: 1.4 }, 336).progress, 1)
})

test("the paper's pieces always cover exactly the pose's sheet, with the design's widths at rest", () => {
  for (const { input, keyboardHeight } of cases()) {
    const endpoints = resolveMiniRoomPoseEndpoints(input, keyboardHeight)
    for (let i = 0; i <= 20; i++) {
      const pose = resolveMiniRoomPose(endpoints, i / 20)
      const paper = resolveMiniRoomPaperGeometry(pose, input.windowWidth)
      assert.equal(paper.bottomCapUp, pose.bottom)
      assert.ok(near(paper.topCapUp + MINI_ROOM_PAPER_CAP, pose.bottom + pose.height), "top edge")
      const bodyBottom = paper.bodyUp
      const bodyTop = paper.bodyUp + paper.bodyScaleY * 100
      assert.ok(bodyBottom <= pose.bottom + MINI_ROOM_PAPER_CAP && bodyTop >= paper.topCapUp, "no gap between pieces")
      assert.ok(paper.bodyScaleY > 0)
      const width = input.windowWidth - 2 * pose.margin
      assert.ok(near(paper.fullScaleX * input.windowWidth, width))
      assert.ok(near(paper.restScaleX * (input.windowWidth - 26), width))
      assert.ok(paper.openOpacity >= 0 && paper.openOpacity <= 1)
    }
    const rest = resolveMiniRoomPaperGeometry(endpoints.closed, input.windowWidth)
    assert.equal(rest.restScaleX, 1, "the resting sheet is drawn at its own size")
    assert.equal(rest.openOpacity, 0)
    const open = resolveMiniRoomPaperGeometry(endpoints.open, input.windowWidth)
    assert.equal(open.fullScaleX, 1)
    assert.equal(open.openOpacity, 1)
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

test("the history and recent layers drift only while they fade, and never under Reduce Motion", () => {
  // A readable layer sits exactly at rest: the drift never moves the owner's layout.
  assert.equal(resolveMiniRoomContentDrift(0, false).history, 0)
  assert.equal(resolveMiniRoomContentDrift(1, false).recent, 0)
  let previous = resolveMiniRoomContentDrift(0, false)
  for (let i = 1; i <= 100; i++) {
    const drift = resolveMiniRoomContentDrift(i / 100, false)
    const opacity = resolveMiniRoomContentOpacity(i / 100)
    if (opacity.history === 1) assert.equal(drift.history, 0)
    if (opacity.recent === 1) assert.equal(drift.recent, 0)
    assert.ok(drift.history >= previous.history, "history keeps settling away as it leaves")
    assert.ok(drift.recent <= previous.recent, "recent keeps rising into place as it arrives")
    previous = drift
  }
  assert.ok(resolveMiniRoomContentDrift(0.5, false).history > 0, "the handoff moves at all")
  for (let i = 0; i <= 10; i++) {
    assert.deepEqual(resolveMiniRoomContentDrift(i / 10, true), { history: 0, recent: 0 })
  }
})

test("text keeps its settled width through every frame, with identical endpoint spacing", () => {
  for (const windowWidth of [375, 402, 414, 430]) {
    const text = resolveMiniRoomTextWidths(windowWidth)
    // Resting paper has 13-point margins plus 16-point history padding.
    assert.equal(text.history + 2 * 16, windowWidth - 2 * 13)
    // The recent strip has 17-point padding in the full-width typing paper.
    assert.equal(text.recent + 2 * 17, windowWidth)
    // Include the paper's 1-point inner inset; composer wrapping changes once per
    // confirmed mode instead of at every changing margin along the animation.
    assert.equal(text.historyComposer + 2 * 9 + 2, windowWidth - 2 * 13)
    assert.equal(text.typingComposer + 2 * 13 + 2, windowWidth)
    for (let i = 0; i <= 100; i++) {
      const animatedPaperWidth = windowWidth - 2 * 13 * (1 - i / 100)
      assert.ok(text.history + 2 * 16 <= animatedPaperWidth)
    }
  }
})
