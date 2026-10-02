import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { scheduleOnUI } from "react-native-worklets"
import { animateTo, resolveMotion } from "../../../ui/motion"
import type { MiniRoomCameraFrame } from "./miniRoomAvatarStageModel"
import { resolveMiniRoomLayout, type MiniRoomLayout, type MiniRoomLayoutInput, type MiniRoomPanelMode } from "./miniRoomLayout"
import { resolveMiniRoomMorphFrame, resolveMiniRoomOpeningProgress, resolveMiniRoomSettlingProgress, resolveMiniRoomTransitionDuration, resolveMiniRoomTransitionTarget, shouldDeferMiniRoomLayout, type MiniRoomTransitionFrame } from "./miniRoomTransitionModel"
import { MINI_ROOM_DOCK_STEP_MS } from "./miniRoomReducedMotion"
import type { MiniRoomKeyboardState } from "./useMiniRoomKeyboard"

/**
 * ROOM-15: the canvas keeps its layout. Room transform, dock position, height
 * and content morph share ONE UI-thread clock. The keyboard edge leads the
 * opening; camera and dock top settle together with guaranteed floor clearance.
 * Closing never expands the history at the still-raised keyboard position.
 * The clock follows UIKit's keyboard duration on purpose (see
 * MINI_ROOM_DOCK_STEP_MS); Reduce Motion lands the pose at once and
 * crossfades the content with the ui/motion `crossfade` token.
 */
export function useMiniRoomCameraTransform(input: {
  rest: MiniRoomCameraFrame
  layout: MiniRoomLayout
  layoutInput: MiniRoomLayoutInput
  keyboardInset: number
  keyboardDurationMs: number
  reduceMotion: boolean
}) {
  const { rest, layout, layoutInput, keyboardInset, keyboardDurationMs, reduceMotion } = input
  const target = useMemo(() => resolveMiniRoomTransitionTarget(rest, layout), [rest, layout])
  const origin = useSharedValue(target)
  const destination = useSharedValue(target)
  const clock = useSharedValue(1)
  const timing = useSharedValue({ opening: false, keyboardFraction: 1 })
  const composerClearance = layout.composerInputHeight + 18
  // Under Reduce Motion the pose lands at once, but the history and recent
  // text still crossfade (house rule: movement snaps, opacity fades).
  const contentFade = useSharedValue(target.progress)
  const contentFadesAlone = useSharedValue(false)
  const transition = useDerivedValue(() => {
    const time = clock.value
    const opening = timing.value.opening
    const roomProgress = opening ? resolveMiniRoomOpeningProgress(time) : resolveMiniRoomSettlingProgress(time)
    const keyboardProgress = opening
      ? resolveMiniRoomOpeningProgress(time / timing.value.keyboardFraction) : roomProgress
    return resolveMiniRoomMorphFrame(origin.value, destination.value, roomProgress, keyboardProgress, composerClearance)
  })
  /** The progress the dock's content opacities follow. */
  const contentProgress = useDerivedValue(() =>
    contentFadesAlone.value ? contentFade.value : transition.value.progress)
  const previousKeyboard = useRef({ mode: layout.panelMode, inset: keyboardInset })
  const previousTarget = useRef(target)
  const actualTarget = useRef(target)
  const keyboardIntent = useRef<MiniRoomPanelMode | null>(null)
  const previousReduceMotion = useRef(reduceMotion)
  const knownKeyboardInset = useRef(0)
  const focusFallback = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (focusFallback.current !== null) clearTimeout(focusFallback.current)
  }, [])

  const animatePose = useCallback((next: MiniRoomTransitionFrame, durationMs: number, force = false) => {
    if (!force && Object.keys(next).every((key) => {
      const field = key as keyof MiniRoomTransitionFrame
      return next[field] === previousTarget.current[field]
    })) return
    const opening = next.progress > previousTarget.current.progress
    previousTarget.current = next
    // Keep the input fast; let the room's last few points settle more slowly.
    const totalDurationMs = opening && durationMs > 0 ? Math.max(durationMs, 320) : durationMs
    const crossfade = resolveMotion(true).crossfade
    scheduleOnUI((nextPose: MiniRoomTransitionFrame, duration: number, keyboardDuration: number, isOpening: boolean) => {
      "worklet"
      if (duration === 0) {
        contentFade.value = contentProgress.value
        contentFade.value = animateTo(nextPose.progress, crossfade)
      }
      contentFadesAlone.value = duration === 0
      origin.value = transition.value
      destination.value = nextPose
      timing.value = { opening: isOpening, keyboardFraction: duration > 0 ? keyboardDuration / duration : 1 }
      clock.value = 0
      clock.value = duration === 0 ? 1 : withTiming(1, {
        duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never
      })
    }, next, totalDurationMs, durationMs, opening)
  }, [clock, contentFade, contentFadesAlone, contentProgress, destination, origin, timing, transition])

  const animateKeyboard = useCallback((frame: MiniRoomKeyboardState, source: "native" | "intent" = "native") => {
    const nextLayout = resolveMiniRoomLayout({ ...layoutInput,
      keyboardVisible: frame.visible, keyboardInset: frame.inset })
    // An old native frame or text measurement must not reverse a newer tap.
    if (source === "native" && keyboardIntent.current !== null && keyboardIntent.current !== nextLayout.panelMode) return
    if (focusFallback.current !== null) {
      clearTimeout(focusFallback.current)
      focusFallback.current = null
    }
    if (source === "intent") {
      keyboardIntent.current = nextLayout.panelMode === layout.panelMode ? null : nextLayout.panelMode
      if (keyboardIntent.current !== null) {
        // Hardware focus / missing confirmation: return to the latest actual
        // layout, including measurements received while the intent was pending.
        focusFallback.current = setTimeout(() => {
          focusFallback.current = null
          keyboardIntent.current = null
          animatePose(actualTarget.current, reduceMotion ? 0 : MINI_ROOM_DOCK_STEP_MS)
        }, 450)
      }
    }
    if (frame.inset > 0) knownKeyboardInset.current = frame.inset
    const opening = nextLayout.panelMode === "typing" && previousKeyboard.current.mode !== "typing"
    previousKeyboard.current = { mode: nextLayout.panelMode, inset: frame.inset }
    animatePose(resolveMiniRoomTransitionTarget(rest, nextLayout), resolveMiniRoomTransitionDuration({
      keyboardChanged: true, keyboardDurationMs: frame.durationMs, reduceMotion, opening
    }))
  }, [animatePose, layout.panelMode, layoutInput, reduceMotion, rest])

  const prepareKeyboardOpen = useCallback(() => {
    // Use a measured previous frame only. First focus waits for keyboardWillShow.
    if (layoutInput.keyboardVisible || knownKeyboardInset.current <= 0) return
    animateKeyboard({
      visible: true, inset: knownKeyboardInset.current, durationMs: keyboardDurationMs
    }, "intent")
  }, [animateKeyboard, keyboardDurationMs, layoutInput.keyboardVisible])

  useLayoutEffect(() => {
    actualTarget.current = target
    const accessibilityChanged = previousReduceMotion.current !== reduceMotion
    previousReduceMotion.current = reduceMotion
    // Keep the tap's direction through late measurements until React has also
    // committed the matching native frame (not just until its event arrives).
    if (shouldDeferMiniRoomLayout({ intent: keyboardIntent.current,
      actual: layout.panelMode, accessibilityChanged })) return
    if (keyboardIntent.current === layout.panelMode) keyboardIntent.current = null
    const previous = previousKeyboard.current
    const keyboardChanged = previous.mode !== layout.panelMode || previous.inset !== keyboardInset
    previousKeyboard.current = { mode: layout.panelMode, inset: keyboardInset }
    const changed = Object.keys(target).some((key) => {
      const field = key as keyof MiniRoomTransitionFrame
      return target[field] !== previousTarget.current[field]
    })
    if (!changed && !accessibilityChanged) return
    const durationMs = resolveMiniRoomTransitionDuration({ keyboardChanged, keyboardDurationMs, reduceMotion,
      opening: layout.panelMode === "typing" && previous.mode !== "typing" })
    animatePose(target, durationMs, accessibilityChanged)
  }, [animatePose, keyboardDurationMs, keyboardInset, layout.panelMode, layoutInput.keyboardVisible, reduceMotion, target])

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: transition.value.cameraX }, { translateY: transition.value.cameraY }, { scale: transition.value.cameraScale }]
  }))
  return { cameraStyle, transition, contentProgress, animateKeyboard, prepareKeyboardOpen }
}
