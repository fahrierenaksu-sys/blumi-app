/**
 * Haptic feedback helpers — wraps expo-haptics for native
 * iOS Taptic Engine / Android vibration support.
 *
 * Haptic map (one meaning per pattern; keep new call sites on this map):
 * - Threshold crossing (Discover card drag) → hapticSelection, once per
 *   crossing; re-arms when the drag returns inside the threshold.
 * - Like / pass commit                      → hapticLight
 * - Match                                   → hapticSuccess
 * - Mic toggle                              → hapticLight
 * - Partner joins the shared room           → hapticLight, once per partner
 * - Tab tap                                 → hapticSelection
 * - Report / block submitted                → hapticSuccess
 * - Failed action                           → hapticError
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
