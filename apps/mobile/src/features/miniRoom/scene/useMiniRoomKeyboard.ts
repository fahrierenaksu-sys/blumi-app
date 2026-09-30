import { useEffect, useRef, useState } from "react"
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  useWindowDimensions,
  type KeyboardEvent
} from "react-native"
import { resolveKeyboardInset } from "./miniRoomLayout"

export interface MiniRoomKeyboardState {
  visible: boolean
  /** Real overlap of the keyboard with the window bottom, in points. */
  inset: number
}

const HIDDEN: MiniRoomKeyboardState = { visible: false, inset: 0 }

/**
 * The system keyboard's measured frame, updated once per keyboard event (show,
 * hide, suggestion bar or layout change) — never per frame. The layout change
 * rides the keyboard's own native animation curve unless Reduce Motion is on.
 *
 * iOS reports the end frame, so the overlap is exact for every keyboard size.
 * Android keeps its window-resize behaviour: the flag changes, no inset is added.
 */
export function useMiniRoomKeyboard(reduceMotion: boolean): MiniRoomKeyboardState {
  const { height: windowHeight } = useWindowDimensions()
  const [state, setState] = useState<MiniRoomKeyboardState>(HIDDEN)
  const lastRef = useRef<MiniRoomKeyboardState>(HIDDEN)

  useEffect(() => {
    const apply = (next: MiniRoomKeyboardState, event?: KeyboardEvent): void => {
      const last = lastRef.current
      if (last.visible === next.visible && last.inset === next.inset) return
      lastRef.current = next
      if (!reduceMotion && event && event.duration > 0) {
        LayoutAnimation.configureNext({
          duration: event.duration,
          update: { duration: event.duration, type: LayoutAnimation.Types.keyboard }
        })
      }
      setState(next)
    }

    if (Platform.OS === "ios") {
      const frameSubscription = Keyboard.addListener("keyboardWillChangeFrame", (event) => {
        const inset = resolveKeyboardInset({
          windowHeight,
          keyboardScreenY: event.endCoordinates.screenY,
          keyboardHeight: event.endCoordinates.height
        })
        apply(inset > 0 ? { visible: true, inset } : HIDDEN, event)
      })
      const hideSubscription = Keyboard.addListener("keyboardWillHide", (event) => apply(HIDDEN, event))
      return () => {
        frameSubscription.remove()
        hideSubscription.remove()
      }
    }

    const showSubscription = Keyboard.addListener("keyboardDidShow", () => apply({ visible: true, inset: 0 }))
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => apply(HIDDEN))
    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [reduceMotion, windowHeight])

  return state
}
