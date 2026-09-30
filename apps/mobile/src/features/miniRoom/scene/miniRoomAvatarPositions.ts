import {
  cancelAnimation,
  Easing,
  makeMutable,
  ReduceMotion,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import type { MiniRoomSegmentAnimator } from "./miniRoomMovementRun"
import type { RoomPoint } from "./miniRoomSceneTypes"

/** An avatar's live room position (0..1 room units), animated on the UI thread. */
export interface MiniRoomAvatarPosition {
  x: SharedValue<number>
  y: SharedValue<number>
}

/**
 * Same curve as roomWorldRuntime's easeOutRoomWorldMovement: 1 - (1 - t)^3.
 */
export const MINI_ROOM_MOVEMENT_EASING = Easing.out(Easing.cubic)

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
 * Animates one segment with withTiming on the UI thread. Walking is
 * state-essential spatial feedback, so it ignores the system Reduce Motion
 * setting exactly as the former JS loop did (miniRoomReducedMotion.ts).
 */
export function createMiniRoomSegmentAnimator(position: MiniRoomAvatarPosition): MiniRoomSegmentAnimator {
  let generation = 0
  return {
    animate(segment, onComplete) {
      generation += 1
      const token = generation
      const finish = (): void => {
        if (token === generation) onComplete()
      }
      const config = {
        duration: segment.durationMs,
        easing: MINI_ROOM_MOVEMENT_EASING,
        reduceMotion: ReduceMotion.Never
      }
      position.x.value = segment.from.x
      position.y.value = segment.from.y
      position.x.value = withTiming(segment.to.x, config, (finished) => {
        "worklet"
        if (finished) scheduleOnRN(finish)
      })
      position.y.value = withTiming(segment.to.y, config)
    },
    cancel() {
      generation += 1
      cancelAnimation(position.x)
      cancelAnimation(position.y)
    }
  }
}
