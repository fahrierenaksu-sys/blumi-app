import { useCallback, useMemo } from "react"
import {
  cancelAnimation,
  ReduceMotion,
  useAnimatedReaction,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { runOnUISync, scheduleOnRN } from "react-native-worklets"
import type { RoomWorldPoint } from "./roomWorldGeometry"
import {
  getMyRoomAvatarDepthIndex,
  MY_ROOM_WALK_EASING,
  type MyRoomAvatarDepthNeighbour,
  type MyRoomWalkStep
} from "./myRoomAvatarWalkModel"

export interface MyRoomAvatarWalk {
  /** Live avatar point in room coordinates, written only on the UI thread while walking. */
  x: SharedValue<number>
  y: SharedValue<number>
  /** Walks the steps on the UI thread and reports each finished step on JS. */
  start(steps: readonly MyRoomWalkStep[], onStepEnd: (index: number) => void): void
  /** Stops a walk where the avatar is and returns that exact point. */
  stop(): RoomWorldPoint
  /** Places the avatar without animation. */
  place(point: RoomWorldPoint): void
}

/**
 * Tap-to-walk for My Room: every frame of a walk runs on the UI thread with
 * shared values. JS hears about a walk only at step boundaries and when the
 * avatar passes in front of or behind another render item, so React renders a
 * handful of times per walk instead of once per frame.
 *
 * Walking ignores Reduce Motion (`ReduceMotion.Never`), as the previous
 * requestAnimationFrame walk did: the avatar still has to travel the path.
 */
export function useMyRoomAvatarWalk(input: {
  initial: RoomWorldPoint
  depthNeighbours: readonly MyRoomAvatarDepthNeighbour[]
  /** Set while the avatar's depth is pinned (it still owns a seat). */
  fixedDepth: number | undefined
  /** Called on JS with the live point when the avatar's render-order index changes. */
  onDepthIndexChange: (x: number, y: number) => void
}): MyRoomAvatarWalk {
  const { depthNeighbours, fixedDepth, onDepthIndexChange } = input
  const x = useSharedValue(input.initial.x)
  const y = useSharedValue(input.initial.y)

  useAnimatedReaction(
    () => getMyRoomAvatarDepthIndex(depthNeighbours, fixedDepth ?? y.value),
    (index, previous) => {
      if (previous !== null && index !== previous) scheduleOnRN(onDepthIndexChange, x.value, y.value)
    },
    [depthNeighbours, fixedDepth, onDepthIndexChange, x, y]
  )

  const start = useCallback((steps: readonly MyRoomWalkStep[], onStepEnd: (index: number) => void): void => {
    if (steps.length === 0) return
    const config = (durationMs: number) => ({
      duration: durationMs,
      easing: MY_ROOM_WALK_EASING,
      reduceMotion: ReduceMotion.Never
    })
    x.value = withSequence(
      ReduceMotion.Never,
      ...steps.map((step) => withTiming(step.x, config(step.durationMs)))
    )
    y.value = withSequence(
      ReduceMotion.Never,
      ...steps.map((step, index) => withTiming(step.y, config(step.durationMs), (finished) => {
        "worklet"
        if (finished) scheduleOnRN(onStepEnd, index)
      }))
    )
  }, [x, y])

  const stop = useCallback((): RoomWorldPoint => runOnUISync(() => {
    "worklet"
    cancelAnimation(x)
    cancelAnimation(y)
    return { x: x.value, y: y.value }
  }), [x, y])

  const place = useCallback((point: RoomWorldPoint): void => {
    x.value = point.x
    y.value = point.y
  }, [x, y])

  return useMemo(() => ({ x, y, start, stop, place }), [place, start, stop, x, y])
}
