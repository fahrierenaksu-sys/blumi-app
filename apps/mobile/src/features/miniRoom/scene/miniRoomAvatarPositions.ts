import {
  cancelAnimation,
  makeMutable,
  ReduceMotion,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import {
  easeRoomWorldMovement,
  type RoomWorldMovementSegment
} from "../../roomWorld/roomWorldRuntime"
import type { MiniRoomPathAnimator } from "./miniRoomMovementRun"
import type { RoomPoint } from "./miniRoomSceneTypes"

/** An avatar's live room position (0..1 room units), animated on the UI thread. */
export interface MiniRoomAvatarPosition {
  x: SharedValue<number>
  y: SharedValue<number>
}

/**
 * The RoomWorld walk curve for one segment (ROOM-02): linear at the walk's
 * one speed, ramped only at the start of the first and the end of the last
 * segment. Same function as the JS movement frame, so both phones and both
 * threads agree.
 */
export function createMiniRoomMovementEasing(segment: RoomWorldMovementSegment): (progress: number) => number {
  const rampIn = segment.rampIn ?? 0
  const rampOut = segment.rampOut ?? 0
  return (progress: number) => {
    "worklet"
    return easeRoomWorldMovement(progress, rampIn, rampOut)
  }
}

export function createMiniRoomAvatarPosition(point: RoomPoint): MiniRoomAvatarPosition {
  return { x: makeMutable(point.x), y: makeMutable(point.y) }
}

/** Stops any walk and places the avatar at `point` (scene reset, respawn). */
export function snapMiniRoomAvatarPosition(position: MiniRoomAvatarPosition, point: RoomPoint): void {
  cancelAnimation(position.x)
  cancelAnimation(position.y)
  position.x.value = point.x
  position.y.value = point.y
}

/** Reads the live position synchronously (a retarget starts where the avatar is). */
export function readMiniRoomAvatarPosition(position: MiniRoomAvatarPosition): RoomPoint {
  return { x: position.x.value, y: position.y.value }
}

/**
 * The end-of-segment callback for one step of the path: it reports the step
 * to the JS thread and returns at once, so the sequence goes straight on to
 * the next segment. Declared before the animator whose worklets capture it.
 */
function createMiniRoomSegmentEndCallback(
  report: (index: number) => void,
  index: number
): (finished?: boolean) => void {
  return (finished?: boolean) => {
    "worklet"
    if (finished) scheduleOnRN(report, index)
  }
}

function createMiniRoomSegmentTimingConfig(segment: RoomWorldMovementSegment) {
  return {
    duration: segment.durationMs,
    easing: createMiniRoomMovementEasing(segment),
    reduceMotion: ReduceMotion.Never
  }
}

/**
 * Animates a whole path as one withSequence per axis on the UI thread: a
 * corner is just the next step of the sequence, never a round trip through
 * JS. Each finished segment is reported to JS (facing, pose) without the
 * walk waiting for it. Walking is state-essential spatial feedback, so it
 * ignores the system Reduce Motion setting exactly as the former JS loop did
 * (miniRoomReducedMotion.ts).
 */
export function createMiniRoomPathAnimator(position: MiniRoomAvatarPosition): MiniRoomPathAnimator {
  let generation = 0
  return {
    animate(segments, onSegmentEnd) {
      generation += 1
      const token = generation
      const first = segments[0]
      if (!first) return
      // A replaced or cancelled path never reports again.
      const report = (index: number): void => {
        if (token === generation) onSegmentEnd(index)
      }
      const xSteps = segments.map((segment, index) =>
        withTiming(segment.to.x, createMiniRoomSegmentTimingConfig(segment),
          createMiniRoomSegmentEndCallback(report, index)))
      const ySteps = segments.map((segment) =>
        withTiming(segment.to.y, createMiniRoomSegmentTimingConfig(segment)))
      position.x.value = first.from.x
      position.y.value = first.from.y
      position.x.value = withSequence(ReduceMotion.Never, ...xSteps)
      position.y.value = withSequence(ReduceMotion.Never, ...ySteps)
    },
    cancel() {
      generation += 1
      cancelAnimation(position.x)
      cancelAnimation(position.y)
    }
  }
}
