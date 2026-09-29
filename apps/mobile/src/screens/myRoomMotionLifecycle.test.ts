import assert from "node:assert/strict"
import test from "node:test"
import {
  cancelMyRoomMotionTasks,
  createMyRoomMotionLifecycle,
  resolveMyRoomPoseAfterBlur,
  scheduleMyRoomMotionCallback
} from "./myRoomMotionLifecycle"

type FakeTask = {
  callback: () => void
  cancelled: boolean
}

function createFakeScheduler() {
  const frames: FakeTask[] = []
  const timers: FakeTask[] = []
  return {
    frames,
    timers,
    requestFrame(callback: () => void): number {
      frames.push({ callback, cancelled: false })
      return frames.length - 1
    },
    cancelFrame(handle: number): void {
      const task = frames[handle]
      if (task) task.cancelled = true
    },
    setTimer(callback: () => void): number {
      timers.push({ callback, cancelled: false })
      return timers.length - 1
    },
    clearTimer(handle: number): void {
      const task = timers[handle]
      if (task) task.cancelled = true
    }
  }
}

test("blur invalidates escaped movement frames and transient timers; focus does not resume them", () => {
  const lifecycle = createMyRoomMotionLifecycle()
  const scheduler = createFakeScheduler()
  let completions = 0
  lifecycle.focus()
  const generation = lifecycle.begin()

  scheduleMyRoomMotionCallback(
    lifecycle,
    generation,
    scheduler.requestFrame,
    () => { completions += 1 }
  )
  scheduleMyRoomMotionCallback(
    lifecycle,
    generation,
    scheduler.setTimer,
    () => { completions += 1 }
  )
  scheduleMyRoomMotionCallback(
    lifecycle,
    generation,
    scheduler.setTimer,
    () => { completions += 1 }
  )

  lifecycle.blur()
  const refs = {
    animationFrame: { current: 0 as number | null },
    transientPoseTimer: { current: 0 as number | null },
    movementFeedbackTimer: { current: 1 as number | null }
  }
  cancelMyRoomMotionTasks({
    refs,
    cancelFrame: scheduler.cancelFrame,
    clearTimer: scheduler.clearTimer
  })
  lifecycle.blur()
  cancelMyRoomMotionTasks({
    refs,
    cancelFrame: scheduler.cancelFrame,
    clearTimer: scheduler.clearTimer
  })
  scheduler.frames[0]!.callback()
  scheduler.timers[0]!.callback()
  scheduler.timers[1]!.callback()
  lifecycle.focus()

  assert.equal(scheduler.frames[0]?.cancelled, true)
  assert.equal(scheduler.timers[0]?.cancelled, true)
  assert.equal(scheduler.timers[1]?.cancelled, true)
  assert.equal(refs.animationFrame.current, null)
  assert.equal(refs.transientPoseTimer.current, null)
  assert.equal(refs.movementFeedbackTimer.current, null)
  assert.equal(completions, 0, "stale callbacks must not update pose or run completion effects")
  assert.equal(scheduler.frames.length, 1, "focus alone must not schedule the old walk again")
  assert.equal(scheduler.timers.length, 2, "focus alone must not reschedule transient work")

  const resumedGeneration = lifecycle.begin()
  scheduleMyRoomMotionCallback(
    lifecycle,
    resumedGeneration,
    scheduler.requestFrame,
    () => { completions += 1 }
  )
  scheduler.frames[1]!.callback()
  assert.equal(completions, 1, "a new focused action remains functional")
})

test("blur rests a walking pose at its latest point but preserves an existing seat", () => {
  const walkingPose = {
    x: 0.73,
    y: 0.41,
    direction: "left" as const,
    state: "walking" as const
  }
  assert.deepEqual(resolveMyRoomPoseAfterBlur(walkingPose), {
    ...walkingPose,
    state: "idle"
  })

  const seatedPose = { ...walkingPose, state: "sitting" as const }
  assert.equal(resolveMyRoomPoseAfterBlur(seatedPose), seatedPose)
})
