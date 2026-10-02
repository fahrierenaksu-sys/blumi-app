import { useEffect, useState } from "react"
import { Keyboard, Platform } from "react-native"
import { useKeyboardHandler } from "react-native-keyboard-controller"
import { useSharedValue, type SharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateTo, resolveMotion } from "../../../ui/motion"
import { resolveMiniRoomKeyboardFrame } from "./miniRoomTransitionModel"

export interface MiniRoomKeyboard {
  /** A software keyboard is up or on its way up. Changes once per show/hide. */
  visible: boolean
  /** 0 closed → 1 open: where the keyboard is, every frame, on the UI thread. */
  progress: SharedValue<number>
  /** The fully open keyboard's height in points (0 where the window resizes). */
  openHeight: SharedValue<number>
}

/**
 * iOS: react-native-keyboard-controller reports the keyboard's real position
 * every frame on the UI thread, including interactive drags and reversals, so
 * the room camera, the chat paper and the composer ride the keyboard itself
 * instead of a separate timing that starts when a JS event arrives. React
 * hears only the discrete show/hide. Under Reduce Motion the scene lands at
 * its next pose the moment the keyboard starts (no travel); the content
 * crossfade lives in useMiniRoomCameraTransform.
 */
function useMiniRoomKeyboardIos(reduceMotion: boolean): MiniRoomKeyboard {
  const progress = useSharedValue(0)
  const openHeight = useSharedValue(0)
  const shown = useSharedValue(false)
  const [visible, setVisible] = useState(false)
  useKeyboardHandler({
    onStart: (event) => {
      "worklet"
      const opening = event.height > 0
      if (opening) openHeight.value = event.height
      if (reduceMotion) progress.value = opening ? 1 : 0
      if (shown.value !== opening) {
        shown.value = opening
        scheduleOnRN(setVisible, opening)
      }
    },
    onMove: (event) => {
      "worklet"
      if (reduceMotion) return
      const frame = resolveMiniRoomKeyboardFrame(event, openHeight.value)
      progress.value = frame.progress
      openHeight.value = frame.openHeight
    },
    onInteractive: (event) => {
      "worklet"
      if (reduceMotion) return
      const frame = resolveMiniRoomKeyboardFrame(event, openHeight.value)
      progress.value = frame.progress
      openHeight.value = frame.openHeight
    },
    onEnd: (event) => {
      "worklet"
      const frame = resolveMiniRoomKeyboardFrame(event, openHeight.value)
      progress.value = frame.progress
      openHeight.value = frame.openHeight
      const open = frame.progress > 0
      if (shown.value !== open) {
        shown.value = open
        scheduleOnRN(setVisible, open)
      }
    }
  }, [reduceMotion])
  return { visible, progress, openHeight }
}

/**
 * Android keeps the app-wide window resize (no keyboard provider is mounted
 * there, see ui/keyboard.tsx): the window is already above the keyboard, so
 * the open pose needs no inset and the scene eases between its two poses on
 * the `smooth` token (instant under Reduce Motion).
 */
function useMiniRoomKeyboardAndroid(reduceMotion: boolean): MiniRoomKeyboard {
  const progress = useSharedValue(0)
  const openHeight = useSharedValue(0)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const smooth = resolveMotion(reduceMotion).smooth
    const show = Keyboard.addListener("keyboardDidShow", () => {
      setVisible(true)
      progress.value = animateTo(1, smooth)
    })
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setVisible(false)
      progress.value = animateTo(0, smooth)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [progress, reduceMotion])
  return { visible, progress, openHeight }
}

export const useMiniRoomKeyboard = Platform.OS === "ios" ? useMiniRoomKeyboardIos : useMiniRoomKeyboardAndroid
