import { useCallback, useMemo, useState } from "react"
import { Gesture } from "react-native-gesture-handler"
import { useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import type { RoomEditorDragGhostValues } from "../../roomV2/editor/useRoomEditorDragGestures"

/** The bed card must travel this far before it becomes a drag (a tap places it). */
export const ROOM_SETUP_DRAG_MIN_DISTANCE = 8
const LIFTED_SCALE = 1.06
const DROP_FADE_MS = 160

export interface RoomSetupBedDragHandlers {
  /** The card was picked up (show the ghost, select the bed). */
  onLift: () => void
  /** The finger let go at a window point; place or explain (commits once). */
  onDrop: (pageX: number, pageY: number) => void
  /** A tap on the card: place at the default spot. */
  onTap: () => void
}

/**
 * First-room bed drag (ROOMSETUP-1, ONB-11). The ghost under the finger is
 * moved by shared values on the UI thread; React and room persistence hear
 * about the drag only when it starts and when it ends, never per move.
 */
export function useRoomSetupBedDrag(input: {
  enabled: boolean
  reduceMotion: boolean
  handlers: RoomSetupBedDragHandlers
}) {
  const { enabled, reduceMotion, handlers } = input
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0)
  const overlayOrigin = useSharedValue({ x: 0, y: 0 })
  const ghostValues: RoomEditorDragGhostValues = useMemo(
    () => ({ x, y, scale, opacity, overlayOrigin }),
    [opacity, overlayOrigin, scale, x, y]
  )
  // The ghost image mounts on the first lift and then stays mounted (hidden
  // by opacity), so a drop can fade out instead of being cut off.
  const [ghostSession, setGhostSession] = useState<number | null>(null)
  const { onLift, onDrop, onTap } = handlers

  const lift = useCallback(() => {
    setGhostSession((session) => (session ?? 0) + 1)
    onLift()
  }, [onLift])
  const drop = useCallback((pageX: number, pageY: number) => {
    onDrop(pageX, pageY)
  }, [onDrop])

  /**
   * Moving the placed bed: the renderer reports touches on the JS thread, so
   * these write shared values directly (no React render, no room write).
   */
  const showGhostAt = useCallback((pageX: number, pageY: number) => {
    x.value = pageX
    y.value = pageY
    opacity.value = 1
  }, [opacity, x, y])
  const liftGhostAt = useCallback((pageX: number, pageY: number) => {
    x.value = pageX
    y.value = pageY
    opacity.value = 1
    scale.value = reduceMotion ? 1 : withSpring(LIFTED_SCALE, { dampingRatio: 0.7, duration: 280 })
    setGhostSession((session) => (session ?? 0) + 1)
  }, [opacity, reduceMotion, scale, x, y])
  const releaseGhost = useCallback(() => {
    opacity.value = withTiming(0, { duration: reduceMotion ? 0 : DROP_FADE_MS })
    scale.value = reduceMotion ? 1 : withTiming(1, { duration: DROP_FADE_MS })
  }, [opacity, reduceMotion, scale])

  const cardGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled)
      .minDistance(ROOM_SETUP_DRAG_MIN_DISTANCE)
      .shouldCancelWhenOutside(false)
      .maxPointers(1)
      .onStart((event) => {
        "worklet"
        x.value = event.absoluteX
        y.value = event.absoluteY
        opacity.value = 1
        scale.value = reduceMotion ? 1 : withSpring(LIFTED_SCALE, { dampingRatio: 0.7, duration: 280 })
        scheduleOnRN(lift)
      })
      .onUpdate((event) => {
        "worklet"
        x.value = event.absoluteX
        y.value = event.absoluteY
      })
      .onEnd((event, success) => {
        "worklet"
        opacity.value = withTiming(0, { duration: reduceMotion ? 0 : DROP_FADE_MS })
        scale.value = reduceMotion ? 1 : withTiming(1, { duration: DROP_FADE_MS })
        if (success) scheduleOnRN(drop, event.absoluteX, event.absoluteY)
      })
    const tap = Gesture.Tap()
      .enabled(enabled)
      .onEnd((_event, success) => {
        "worklet"
        if (success) scheduleOnRN(onTap)
      })
    return Gesture.Exclusive(pan, tap)
  }, [drop, enabled, lift, onTap, opacity, reduceMotion, scale, x, y])

  return { cardGesture, ghostValues, ghostSession, liftGhostAt, showGhostAt, releaseGhost }
}
