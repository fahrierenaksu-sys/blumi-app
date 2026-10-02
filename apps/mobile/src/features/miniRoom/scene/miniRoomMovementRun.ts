import {
  getRoomWorldMovementFrame,
  getRoomWorldMovementFramePose,
  getRoomWorldMovementSegmentStartPose,
  type RoomWorldAvatarRuntimeMotion,
  type RoomWorldAvatarRuntimePose,
  type RoomWorldMovementSegment
} from "../../roomWorld/roomWorldRuntime"
import type { AvatarFacing } from "./miniRoomSceneTypes"

/**
 * Moves one avatar's on-screen position along a whole path. The
 * implementation plays every segment back to back on the UI thread (one
 * Reanimated sequence, see miniRoomAvatarPositions.ts), so the next segment
 * never waits for the JS thread; tests inject a fake. `onSegmentEnd(index)`
 * is reported on the JS thread after each segment that finished without
 * being cancelled, in order.
 */
export interface MiniRoomPathAnimator {
  animate(segments: readonly RoomWorldMovementSegment[], onSegmentEnd: (index: number) => void): void
  cancel(): void
}

export interface MiniRoomMovementRunInput {
  segments: readonly RoomWorldMovementSegment[]
  arrival: {
    facing: AvatarFacing
    motion: RoomWorldAvatarRuntimeMotion
  }
  animator: MiniRoomPathAnimator
  /** Commits the walking pose (direction change) when a segment starts. */
  onSegmentStart: (pose: RoomWorldAvatarRuntimePose, segment: RoomWorldMovementSegment, index: number) => void
  /** Commits the pose a segment ends on; for the final one, the arrival pose. */
  onSegmentEnd: (pose: RoomWorldAvatarRuntimePose, segment: RoomWorldMovementSegment) => void
  /** Called once after the final segment's end pose is committed. */
  onArrival: () => void
}

export interface MiniRoomMovementRun {
  cancel(): void
}

/**
 * Walks a movement plan. The UI thread plays the whole path at once; React
 * state follows it, committed only when a segment ends (position checkpoint,
 * the next segment's direction, or the arrival pose). The committed end pose
 * is the same one the former per-frame loop produced on the frame a segment
 * completed.
 */
export function startMiniRoomMovementRun(input: MiniRoomMovementRunInput): MiniRoomMovementRun {
  const { segments } = input
  let active = segments.length > 0
  // The next segment whose end JS has not committed yet.
  let pending = 0

  const commitSegmentEnd = (index: number): void => {
    const segment = segments[index]!
    const frame = getRoomWorldMovementFrame({ segment, startedAt: 0, now: segment.durationMs })
    input.onSegmentEnd(getRoomWorldMovementFramePose({ frame, segment, arrival: input.arrival }), segment)
    const next = segments[index + 1]
    if (next && !segment.isFinal) {
      input.onSegmentStart(getRoomWorldMovementSegmentStartPose(next), next, index + 1)
      return
    }
    active = false
    input.onArrival()
  }

  const first = segments[0]
  if (first) {
    input.onSegmentStart(getRoomWorldMovementSegmentStartPose(first), first, 0)
    input.animator.animate(segments, (index) => {
      // Reports arrive in order; one that skips ahead still commits every
      // segment before it, so the poses never jump past a corner.
      while (active && pending <= index && pending < segments.length) {
        commitSegmentEnd(pending)
        pending += 1
      }
    })
  }

  return {
    cancel(): void {
      if (!active) return
      active = false
      input.animator.cancel()
    }
  }
}
