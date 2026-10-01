/**
 * Haptic feedback helpers — wraps expo-haptics for native
 * iOS Taptic Engine / Android vibration support.
 *
 * Haptic map (one meaning per pattern; keep new call sites on this map):
 * - Choosing among options (gender, category, cycling a look, picking up
 *   a piece to drag, segmented controls)    → hapticSelection, once per change
 * - Threshold crossing (Discover card drag) → hapticSelection, once per
 *   crossing; re-arms when the drag returns inside the threshold.
 * - Primary button / CTA press               → hapticLight
 * - Like / pass commit                      → hapticLight
 * - Placing / dropping a piece (valid)      → hapticLight
 * - Mic toggle                              → hapticLight
 * - Partner joins the shared room           → hapticLight, once per partner
 * - Tab tap                                 → hapticSelection
 * - Match                                   → hapticSuccess
 * - A real, server-confirmed save or sign-in (not "Done" without changes)
 *                                           → hapticSuccess
 * - Report / block submitted                → hapticSuccess
 * - Failed action, rejected code, invalid drop → hapticError
 * - Long-press lift of a placed object       → hapticMedium
 * - Physical intro beats (globe impact)      → hapticMedium / hapticLight
 *
 * One action plays one haptic: never pair a selection tick with an impact
 * for the same tap (SYS-12).
 *
 * Haptics are not motion: Reduce Motion does not silence them. Web is a
 * no-op; the Simulator has no Taptic Engine, so feel is checked on a device.
 */

import { Platform } from "react-native"
import * as Haptics from "expo-haptics"

/** Selection tick for tab taps and crossing a drag threshold */
export function hapticSelection(): void {
  if (Platform.OS === "web") return
  void Haptics.selectionAsync()
}

/** Light tap for button presses, like/pass commit, mic toggle */
export function hapticLight(): void {
  if (Platform.OS === "web") return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

/** Medium tap for card transitions, filter apply */
export function hapticMedium(): void {
  if (Platform.OS === "web") return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

/** Strong pulse for important actions — invite sent, save */
export function hapticStrong(): void {
  if (Platform.OS === "web") return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
}

/** Success burst for matches, unlocks */
export function hapticSuccess(): void {
  if (Platform.OS === "web") return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

/** Error buzz for failed actions */
export function hapticError(): void {
  if (Platform.OS === "web") return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
}
