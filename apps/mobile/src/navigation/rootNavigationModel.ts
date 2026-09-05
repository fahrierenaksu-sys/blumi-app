import type { ChatLocale } from "../features/chat/chatRoomInviteModel"
import type { OnboardingRoute } from "../features/session/onboardingFlowModel"
import type { SessionEntryRoute } from "../features/session/sessionRouting"
import type { BottomNavKey } from "../ui/bottomNav"

/**
 * Keep every root-level route on the same transition. The default native-stack
 * push/pop slides two independently measured screens across one another; on
 * first paint that overlap reads as a brief vertical jump, especially for
 * scroll-heavy onboarding and room screens. Individual routes may still opt
 * out (for example the pre-auth handoff uses `animation: "none"`).
 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "fade"
} as const

/**
 * The four bottom-navigation destinations live in one native stack for now.
 * Keep tab changes non-gesture so a horizontal back swipe cannot expose a
 * second tab underneath the fixed shell while the shared fade is running.
 */
export const MAIN_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "fade",
  gestureEnabled: false
} as const

export function getBottomNavKeyForRoute(
  routeName: string | undefined
): BottomNavKey | null {
  if (routeName === "Lobby") return "discover"
  if (routeName === "Inbox") return "chats"
  if (routeName === "MyRoom") return "myroom"
  if (routeName === "CosmeticShop") return "shop"
  return null
}

export function getOnboardingEntryRoute(
  route: SessionEntryRoute
): OnboardingRoute | null {
  if (
    route === "ProfileSetup" ||
    route === "AvatarSetup" ||
    route === "RoomSetup"
  ) {
    return route
  }
  return null
}

export function getChatLocale(deviceLocale: string | undefined): ChatLocale {
  return deviceLocale?.toLowerCase().startsWith("tr") ? "tr" : "en"
}

export function getLobbyReturnStrategy(
  stackRouteNames: readonly string[]
): "popTo" | "replace" {
  return stackRouteNames.includes("Lobby") ? "popTo" : "replace"
}
