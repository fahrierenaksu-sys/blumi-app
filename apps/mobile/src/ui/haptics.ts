/**
 * Haptic feedback helpers — wraps expo-haptics for native
 * iOS Taptic Engine / Android vibration support.
 */

import { Platform } from "react-native"
import * as Haptics from "expo-haptics"

/** Light tap for button presses, tab switches */
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
