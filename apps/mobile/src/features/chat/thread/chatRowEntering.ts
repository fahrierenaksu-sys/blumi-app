import {
  Easing,
  ReduceMotion,
  withTiming,
  type EntryExitAnimationFunction
} from "react-native-reanimated"
import { CHAT_ROW_ENTRANCE, chatRowEntranceFrame } from "./chatRowEntranceMotion"

/**
 * The entrance of every new timeline row (chatRowEntranceMotion): a short
 * fade while it rises a few points, on the UI thread. Reanimated's own
 * reduce-motion switch is pinned off; Reduce Motion means no entrance.
 */
export const CHAT_ROW_ENTERING: EntryExitAnimationFunction = () => {
  "worklet"
  const start = chatRowEntranceFrame(0)
  const rest = chatRowEntranceFrame(1)
  const timing = {
    duration: CHAT_ROW_ENTRANCE.durationMs,
    easing: Easing.out(Easing.cubic),
    reduceMotion: ReduceMotion.Never
  }
  return {
    initialValues: { opacity: start.opacity, transform: [{ translateY: start.translateY }] },
    animations: {
      opacity: withTiming(rest.opacity, timing),
      transform: [{ translateY: withTiming(rest.translateY, timing) }]
    }
  }
}
