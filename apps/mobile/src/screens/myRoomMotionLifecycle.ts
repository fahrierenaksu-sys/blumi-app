import type { RoomV2AvatarMotionState } from "../features/roomV2/roomV2.types"

export interface MyRoomMotionLifecycle {
  focus(): void
  blur(): void
  begin(): number
  currentGeneration(): number
  isFocused(): boolean
  isCurrent(generation: number): boolean
}

export interface MyRoomMotionTaskRefs<TTimer> {
  animationFrame: { current: number | null }
  transientPoseTimer: { current: TTimer | null }
  movementFeedbackTimer: { current: TTimer | null }
}

export function cancelMyRoomMotionTasks<TTimer>(input: {
  refs: MyRoomMotionTaskRefs<TTimer>
  cancelFrame: (handle: number) => void
  clearTimer: (handle: TTimer) => void
}): void {
  const { animationFrame, transientPoseTimer, movementFeedbackTimer } = input.refs
  if (animationFrame.current !== null) {
    input.cancelFrame(animationFrame.current)
    animationFrame.current = null
  }
  if (transientPoseTimer.current !== null) {
    input.clearTimer(transientPoseTimer.current)
    transientPoseTimer.current = null
  }
  if (movementFeedbackTimer.current !== null) {
    input.clearTimer(movementFeedbackTimer.current)
    movementFeedbackTimer.current = null
  }
}

/** A focused-screen epoch that makes callbacks from prior walks permanently stale. */
export function createMyRoomMotionLifecycle(): MyRoomMotionLifecycle {
  let focused = false
  let generation = 0

  return {
    focus() {
      focused = true
    },
    blur() {
      if (!focused) return
      focused = false
      generation += 1
    },
    begin() {
      generation += 1
      return generation
    },
    currentGeneration() {
      return generation
    },
    isFocused() {
      return focused
    },
    isCurrent(candidateGeneration) {
      return focused && candidateGeneration === generation
    }
  }
}

/** Re-check focus and generation when scheduled work actually reaches the JS queue. */
export function scheduleMyRoomMotionCallback<THandle>(
  lifecycle: MyRoomMotionLifecycle,
  generation: number,
  schedule: (callback: () => void) => THandle,
  callback: () => void
): THandle | null {
  if (!lifecycle.isCurrent(generation)) return null
  return schedule(() => {
    if (lifecycle.isCurrent(generation)) callback()
  })
}

export function resolveMyRoomPoseAfterBlur<TPose extends {
  state: RoomV2AvatarMotionState
}>(pose: TPose): TPose | (Omit<TPose, "state"> & { state: "idle" }) {
  if (pose.state === "idle" || pose.state === "sitting") return pose
  return { ...pose, state: "idle" }
}
