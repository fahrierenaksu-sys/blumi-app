import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"

/**
 * Short UI-thread fades for the selection capsule. The screen passes them
 * only when the shared Reduce Motion preference allows motion, so
 * Reanimated's own check is switched off. The dock's entrance and glide (and
 * the room's glide above it) come from the shared bottom panel entrance in
 * ui/bottomPanelEntrance, which the avatar wardrobe panel uses too.
 */
export const ROOM_EDITOR_FADE_IN = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)
export const ROOM_EDITOR_FADE_OUT = FadeOut.duration(120).reduceMotion(ReduceMotion.Never)
