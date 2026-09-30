import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomWorldMovementFrame,
  getRoomWorldMovementFramePose,
  type RoomWorldMovementSegment
} from "../../roomWorld/roomWorldRuntime"
import {
  startMiniRoomMovementRun,
  type MiniRoomSegmentAnimator
} from "./miniRoomMovementRun"

const SEGMENTS: RoomWorldMovementSegment[] = [
  { from: { x: 0.1, y: 0.7 }, to: { x: 0.3, y: 0.7 }, facing: "right", distance: 0.2, durationMs: 380, isFinal: false },
  { from: { x: 0.3, y: 0.7 }, to: { x: 0.3, y: 0.55 }, facing: "back", distance: 0.15, durationMs: 285, isFinal: true }
]

function createFakeAnimator() {
  const pending: { segment: RoomWorldMovementSegment; complete: () => void }[] = []
  let cancelled = 0
  const animator: MiniRoomSegmentAnimator = {
    animate: (segment, complete) => { pending.push({ segment, complete }) },
    cancel: () => { cancelled += 1 }
  }
  return {
    animator,
    pending,
    cancelledCount: () => cancelled,
    finishNext: () => pending.shift()?.complete()
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

  // The first segment is handed to the UI thread with its exact from, to and duration.
  assert.equal(fake.pending.length, 1)
  assert.equal(fake.pending[0]?.segment, SEGMENTS[0])
  assert.deepEqual(commits, [["start", { x: 0.1, y: 0.7, facing: "right", motion: "walking" }]])

  fake.finishNext()
  assert.equal(fake.pending[0]?.segment, SEGMENTS[1], "the next segment starts when the previous one ends")
  fake.finishNext()

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
  assert.equal(fake.pending.length, 0, "no further segment starts")
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
