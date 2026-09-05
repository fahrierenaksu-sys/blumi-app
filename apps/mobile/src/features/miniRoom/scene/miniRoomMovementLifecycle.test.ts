import assert from "node:assert/strict"
import test from "node:test"
import {
  cancelActiveMiniRoomMovement,
  cancelPendingMiniRoomMovementCompletion,
  scheduleMiniRoomMovementCompletion
} from "./miniRoomMovementLifecycle"

test("scene reset cancels the active movement frame and clears the shared ref", () => {
  const frameRef: { current: number | null } = { current: 41 }
  const cancelled: number[] = []

  cancelActiveMiniRoomMovement(frameRef, (frame) => cancelled.push(frame))

  assert.deepEqual(cancelled, [41])
  assert.equal(frameRef.current, null)
})

test("rerender during walking cannot leave the old frame alive after reset", () => {
  const frameRef: { current: number | null } = { current: 8 }
  const cancelled: number[] = []
  const cancel = (frame: number) => cancelled.push(frame)

  // A render keeps the same ref while the active tick advances its frame id.
  frameRef.current = 9
  cancelActiveMiniRoomMovement(frameRef, cancel)
  cancelActiveMiniRoomMovement(frameRef, cancel)

  assert.deepEqual(cancelled, [9])
  assert.equal(frameRef.current, null)
})

test("a new movement cancels the previous completion timeout", () => {
  const timeoutRef = { current: null as number | null }
  const callbacks = new Map<number, () => void>()
  const cleared: number[] = []
  let nextTimer = 1
  let completionCount = 0
  const setTimer = (callback: () => void): number => {
    const timer = nextTimer++
    callbacks.set(timer, callback)
    return timer
  }
  const clearTimer = (timer: number): void => {
    cleared.push(timer)
    callbacks.delete(timer)
  }

  scheduleMiniRoomMovementCompletion(
    timeoutRef,
    setTimer,
    clearTimer,
    () => { completionCount += 1 },
    180
  )
  const staleCallback = callbacks.get(1)
  scheduleMiniRoomMovementCompletion(
    timeoutRef,
    setTimer,
    clearTimer,
    () => { completionCount += 1 },
    180
  )

  staleCallback?.()
  assert.deepEqual(cleared, [1])
  assert.equal(completionCount, 0)
  assert.equal(timeoutRef.current, 2)

  callbacks.get(2)?.()
  assert.equal(completionCount, 1)
  assert.equal(timeoutRef.current, null)
})

test("reset or unmount cancels the pending completion timeout", () => {
  const timeoutRef = { current: 19 as number | null }
  const cleared: number[] = []

  cancelPendingMiniRoomMovementCompletion(
    timeoutRef,
    (timer) => cleared.push(timer)
  )
  cancelPendingMiniRoomMovementCompletion(
    timeoutRef,
    (timer) => cleared.push(timer)
  )

  assert.equal(timeoutRef.current, null)
  assert.deepEqual(cleared, [19])
})
