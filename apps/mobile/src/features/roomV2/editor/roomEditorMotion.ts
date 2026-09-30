import {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion
} from "react-native-reanimated"

/**
 * Short UI-thread transitions for the dock and the selection capsule. The
 * screen passes them only when the shared Reduce Motion preference allows
 * motion, so Reanimated's own check is switched off.
 */
export const ROOM_EDITOR_DOCK_LAYOUT = LinearTransition
  .duration(240)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.Never)
export const ROOM_EDITOR_FADE_IN = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)
export const ROOM_EDITOR_FADE_OUT = FadeOut.duration(120).reduceMotion(ReduceMotion.Never)
