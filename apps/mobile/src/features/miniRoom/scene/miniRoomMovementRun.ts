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
 * Moves one avatar's on-screen position along a segment. The implementation
 * runs on the UI thread (Reanimated shared values, see
 * miniRoomAvatarPositions.ts); tests inject a fake. `onComplete` is called
 * once, on the JS thread, only when the segment finished without being
 * cancelled.
 */
export interface MiniRoomSegmentAnimator {
  animate(segment: RoomWorldMovementSegment, onComplete: () => void): void
  cancel(): void
}

export interface MiniRoomMovementRunInput {
  segments: readonly RoomWorldMovementSegment[]
  arrival: {
    facing: AvatarFacing
    motion: RoomWorldAvatarRuntimeMotion
  }
  animator: MiniRoomSegmentAnimator
  /** Commits the walking pose (direction change) when a segment starts. */
  onSegmentStart: (pose: RoomWorldAvatarRuntimePose) => void
  /** Commits the pose a segment ends on; for the final one, the arrival pose. */
  onSegmentEnd: (pose: RoomWorldAvatarRuntimePose, segment: RoomWorldMovementSegment) => void
  /** Called once after the final segment's end pose is committed. */
  onArrival: () => void
}

export interface MiniRoomMovementRun {
  cancel(): void
}

/**
 * Walks a movement plan segment by segment. Per-frame positions live on the
 * UI thread; React state is committed only at segment starts (direction and
 * pose) and segment ends (position checkpoint, arrival pose). The committed
 * end pose is the same one the former per-frame loop produced on the frame
 * a segment completed.
 */
export function startMiniRoomMovementRun(input: MiniRoomMovementRunInput): MiniRoomMovementRun {
  let active = true

  const runSegment = (index: number): void => {
    const segment = input.segments[index]
    if (!segment) return
    input.onSegmentStart(getRoomWorldMovementSegmentStartPose(segment))
    input.animator.animate(segment, () => {
      if (!active) return
      const frame = getRoomWorldMovementFrame({
        segment,
        startedAt: 0,
        now: segment.durationMs
      })
      input.onSegmentEnd(
        getRoomWorldMovementFramePose({ frame, segment, arrival: input.arrival }),
        segment
      )
      if (!segment.isFinal) {
        runSegment(index + 1)
        return
      }
      active = false
      input.onArrival()
    })
  }

  runSegment(0)

  return {
    cancel(): void {
      if (!active) return
      active = false
      input.animator.cancel()
    }
  }
}
