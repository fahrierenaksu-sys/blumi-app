import { useCallback, useMemo } from "react"
import {
  cancelAnimation,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { runOnUISync, scheduleOnRN } from "react-native-worklets"
import type { RoomWorldPoint } from "./roomWorldGeometry"
import {
  getMyRoomAvatarDepthIndex,
  getMyRoomWalkPoint,
  type MyRoomAvatarDepthNeighbour,
  type MyRoomWalkStep
} from "./myRoomAvatarWalkModel"
import { easeRoomWorldMovement } from "./roomWorldRuntime"

export interface MyRoomAvatarWalk {
  /** Live avatar point in room coordinates, written only on the UI thread while walking. */
  x: SharedValue<number>
  y: SharedValue<number>
  /** The current walk's path: its start point, then each step's end. */
  path: SharedValue<readonly RoomWorldPoint[]>
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
  const origin = useSharedValue(input.initial)
  const timeline = useSharedValue<readonly MyRoomWalkStep[]>([])
  const progress = useSharedValue(0)
  const point = useDerivedValue(() => getMyRoomWalkPoint(origin.value, timeline.value, progress.value))
  const x = useDerivedValue(() => point.value.x)
  const y = useDerivedValue(() => point.value.y)
  const path = useDerivedValue((): readonly RoomWorldPoint[] => [origin.value, ...timeline.value])

  useAnimatedReaction(
    () => fixedDepth === undefined
      ? getMyRoomAvatarDepthIndex(depthNeighbours, y.value, x.value, y.value)
      : getMyRoomAvatarDepthIndex(depthNeighbours, fixedDepth),
    (index, previous) => {
      if (previous !== null && index !== previous) scheduleOnRN(onDepthIndexChange, x.value, y.value)
    },
    [depthNeighbours, fixedDepth, onDepthIndexChange, x, y]
  )

  const start = useCallback((steps: readonly MyRoomWalkStep[], onStepEnd: (index: number) => void): void => {
    if (steps.length === 0) return
    runOnUISync(() => {
      "worklet"
      // Capture and cancel atomically; a retarget starts at the rendered point.
      const current = getMyRoomWalkPoint(origin.value, timeline.value, progress.value)
      cancelAnimation(progress)
      origin.value = current
      timeline.value = steps
      progress.value = 0
      progress.value = withSequence(
        ReduceMotion.Never,
        ...steps.map((step, index) => withTiming(index + 1, getMyRoomWalkStepTiming(step), (finished) => {
          "worklet"
          if (finished) scheduleOnRN(onStepEnd, index)
        }))
      )
    })
  }, [origin, progress, timeline])

  const stop = useCallback((): RoomWorldPoint => runOnUISync(() => {
    "worklet"
    const current = getMyRoomWalkPoint(origin.value, timeline.value, progress.value)
    cancelAnimation(progress)
    return current
  }), [origin, progress, timeline])

  const place = useCallback((point: RoomWorldPoint): void => {
    runOnUISync(() => {
      "worklet"
      cancelAnimation(progress)
      origin.value = point
      timeline.value = []
      progress.value = 0
    })
  }, [origin, progress, timeline])

  return useMemo(() => ({ x, y, path, start, stop, place }), [path, place, start, stop, x, y])
}

/**
 * One step's timing: one clock for both axes, with ramps only at the walk's
 * ends. A module-level worklet, never a helper declared inside the walk
 * worklet: the React Compiler hoists such capture-free helpers out of the
 * worklet as plain `_temp` functions, which crash on the UI thread.
 */
function getMyRoomWalkStepTiming(step: MyRoomWalkStep) {
  "worklet"
  const { rampIn, rampOut } = step
  return {
    duration: step.durationMs,
    easing: (fraction: number) => {
      "worklet"
      return easeRoomWorldMovement(fraction, rampIn, rampOut)
    },
    reduceMotion: ReduceMotion.Never
  }
}
