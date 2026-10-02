import { Easing, FadeInDown, ReduceMotion } from "react-native-reanimated"

/**
 * The soft entrance shared by the bottom panels of the room editor (its
 * inventory dock) and the avatar wardrobe: when the screen opens, the panel
 * rises a short way from below while it fades in. It is a Reanimated layout
 * animation, so it runs on the UI thread with no React render per frame.
 *
 * Callers pass the shared Reduce Motion preference (useReducedMotion); under
 * Reduce Motion there is no entering animation at all and the panel simply
 * appears in place. Reanimated's own Reduce Motion check is switched off so
 * the shared store is the only switch.
 */
export const BOTTOM_PANEL_ENTRANCE_DISTANCE = 28
export const BOTTOM_PANEL_ENTRANCE_MS = 380

const BOTTOM_PANEL_ENTERING = FadeInDown
  .duration(BOTTOM_PANEL_ENTRANCE_MS)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateY: BOTTOM_PANEL_ENTRANCE_DISTANCE }] })
  .reduceMotion(ReduceMotion.Never)

export function getBottomPanelEntering(reduceMotion: boolean): typeof BOTTOM_PANEL_ENTERING | undefined {
  return reduceMotion ? undefined : BOTTOM_PANEL_ENTERING
}
