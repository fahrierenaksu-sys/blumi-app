import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomWorldMovementFrame,
  getRoomWorldMovementFramePose,
  type RoomWorldMovementSegment
} from "../../roomWorld/roomWorldRuntime"
import {
  startMiniRoomMovementRun,
  type MiniRoomPathAnimator
} from "./miniRoomMovementRun"

const SEGMENTS: RoomWorldMovementSegment[] = [
  { from: { x: 0.1, y: 0.7 }, to: { x: 0.3, y: 0.7 }, facing: "right", distance: 0.2, durationMs: 380, isFinal: false },
  { from: { x: 0.3, y: 0.7 }, to: { x: 0.3, y: 0.55 }, facing: "back", distance: 0.15, durationMs: 285, isFinal: true }
]

/** The UI thread: it holds the whole path and reports each finished segment. */
function createFakeAnimator() {
  const paths: { segments: readonly RoomWorldMovementSegment[]; report: (index: number) => void }[] = []
  let finished = 0
  let cancelled = 0
  const animator: MiniRoomPathAnimator = {
    animate: (segments, report) => { paths.push({ segments, report }); finished = 0 },
    cancel: () => { cancelled += 1 }
  }
  return {
    animator,
    paths,
    cancelledCount: () => cancelled,
    /** One segment ends on the UI thread; JS hears about it afterwards. */
    finishNext: () => { const path = paths.at(-1); if (path) path.report(finished++) }
  }
}

/** The pose the former requestAnimationFrame loop committed on a segment's last frame. */
function legacyCompletionPose(segment: RoomWorldMovementSegment, arrival: { facing: "left"; motion: "sitting" }) {
  const startedAt = 1_000
  const frame = getRoomWorldMovementFrame({ segment, startedAt, now: startedAt + segment.durationMs + 7 })
  return getRoomWorldMovementFramePose({ frame, segment, arrival })
}

test("a movement commits React state only at segment starts and ends, never per frame", () => {
  const fake = createFakeAnimator()
  const commits: [string, unknown][] = []
  const arrival = { facing: "left" as const, motion: "sitting" as const }
  startMiniRoomMovementRun({
    segments: SEGMENTS,
    arrival,
    animator: fake.animator,
    onSegmentStart: (pose) => commits.push(["start", pose]),
    onSegmentEnd: (pose) => commits.push(["end", pose]),
    onArrival: () => commits.push(["arrival", null])
  })

  // The whole path is handed to the UI thread at once, with every segment's exact from, to and duration.
  assert.equal(fake.paths.length, 1)
  assert.equal(fake.paths[0]?.segments, SEGMENTS)
  assert.deepEqual(commits, [["start", { x: 0.1, y: 0.7, facing: "right", motion: "walking" }]])

  fake.finishNext()
  fake.finishNext()
  assert.equal(fake.paths.length, 1, "a corner never hands the UI thread a new animation")

  assert.deepEqual(commits, [
    ["start", { x: 0.1, y: 0.7, facing: "right", motion: "walking" }],
    ["end", legacyCompletionPose(SEGMENTS[0]!, arrival)],
    ["start", { x: 0.3, y: 0.7, facing: "back", motion: "walking" }],
    ["end", legacyCompletionPose(SEGMENTS[1]!, arrival)],
    ["arrival", null]
  ])
  // Non-final ends keep walking in the segment's direction; the final end takes the arrival pose.
  assert.deepEqual(commits[1]?.[1], { x: 0.3, y: 0.7, facing: "right", motion: "walking" })
  assert.deepEqual(commits[3]?.[1], { x: 0.3, y: 0.55, facing: "left", motion: "sitting" })
})

test("a cancelled movement stops the UI animation and ignores a late segment completion", () => {
  const fake = createFakeAnimator()
  const commits: string[] = []
  const run = startMiniRoomMovementRun({
    segments: SEGMENTS,
    arrival: { facing: "right", motion: "idle" },
    animator: fake.animator,
    onSegmentStart: () => commits.push("start"),
    onSegmentEnd: () => commits.push("end"),
    onArrival: () => commits.push("arrival")
  })
  run.cancel()
  run.cancel()
  assert.equal(fake.cancelledCount(), 1)
  fake.finishNext()
  assert.deepEqual(commits, ["start"], "nothing is committed after cancellation")
  assert.equal(fake.paths.length, 1, "no further animation starts")
})

test("arrival is reported once and cancelling after arrival does not touch the animator", () => {
  const fake = createFakeAnimator()
  let arrivals = 0
  const run = startMiniRoomMovementRun({
    segments: [{ ...SEGMENTS[1]!, from: { x: 0.2, y: 0.6 } }],
    arrival: { facing: "front", motion: "idle" },
    animator: fake.animator,
    onSegmentStart: () => undefined,
    onSegmentEnd: () => undefined,
    onArrival: () => { arrivals += 1 }
  })
  fake.finishNext()
  run.cancel()
  assert.equal(arrivals, 1)
  assert.equal(fake.cancelledCount(), 0)
})

test("the walk turns each corner without waiting for JS; poses catch up in order", () => {
  const fake = createFakeAnimator()
  const commits: [string, string][] = []
  const path: RoomWorldMovementSegment[] = [
    SEGMENTS[0]!,
    { ...SEGMENTS[1]!, isFinal: false },
    { from: { x: 0.3, y: 0.55 }, to: { x: 0.2, y: 0.55 }, facing: "left", distance: 0.1, durationMs: 190, isFinal: true }
  ]
  startMiniRoomMovementRun({
    segments: path,
    arrival: { facing: "front", motion: "idle" },
    animator: fake.animator,
    onSegmentStart: (pose) => commits.push(["start", pose.facing]),
    onSegmentEnd: (pose) => commits.push(["end", pose.facing]),
    onArrival: () => commits.push(["arrival", ""])
  })
  // The JS thread was busy while the UI thread walked the first two
  // segments: the reports arrive late, but the walk itself never paused.
  fake.paths[0]!.report(1)
  assert.deepEqual(commits, [
    ["start", "right"], ["end", "right"], ["start", "back"], ["end", "back"], ["start", "left"]
  ], "a late report still commits every corner's direction, in order")
  fake.paths[0]!.report(1)
  assert.equal(commits.length, 5, "a repeated report commits nothing new")
  fake.paths[0]!.report(2)
  assert.deepEqual(commits.slice(5), [["end", "front"], ["arrival", ""]])
  assert.equal(fake.paths.length, 1, "one animation for the whole path")
})
