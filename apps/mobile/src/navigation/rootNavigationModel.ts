import type { ChatLocale } from "../features/chat/chatRoomInviteModel"
import type { OnboardingRoute } from "../features/session/onboardingFlowModel"
import type { SessionEntryRoute } from "../features/session/sessionRouting"
import type { BottomNavKey } from "../ui/bottomNav"
import type { RootStackParamList } from "./RootNavigator"

/*
 * One transition rule for the root stack; every route opens and closes the
 * same way, by button or by swipe:
 * - Main tabs (MAIN_TAB_SCREEN_OPTIONS): no transition; the bottom bar owns
 *   the selection motion.
 * - Places (onboarding, auth, MiniRoom): the 240 ms fade.
 *   animationMatchesGesture makes an iOS edge swipe-back play the same fade
 *   instead of the native slide.
 * - Drill-in details and editors (profile, match, You, profile edit,
 *   settings, legal, the avatar wardrobe, the room editor, QA studios): the
 *   native push from the right with the UIKit curve; the Back button and the
 *   edge swipe both close it with the native pop. Owner decision 2026-10-02:
 *   the avatar wardrobe and the room editor slide in again; their bottom
 *   panel still rises softly once the push starts (ui/bottomPanelEntrance).
 * - The chat thread: simple_push. Its swipe works anywhere on screen, and
 *   iOS can only run that full-screen gesture as a simple push (the native
 *   push curve is not available to it), so it opens with simple_push too.
 * - Bottom sheets: native form sheets (nativeSheets).
 * Reduce Motion turns every transition off.
 */

/**
 * Keep every root-level route on the same transition. The default native-stack
 * push/pop slides two independently measured screens across one another; on
 * first paint that overlap reads as a brief vertical jump, especially for
 * scroll-heavy onboarding and room screens. Individual routes may still opt
 * out (for example the pre-auth handoff uses `animation: "none"`).
 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "fade",
  // Keep a visible transition cue without leaving every route change feeling
  // like a loading delay. Reduced Motion still disables the animation below.
  animationDuration: 240,
  // iOS otherwise closes a faded route's swipe-back with the native slide;
  // the swipe now closes it the way it opened.
  animationMatchesGesture: true
} as const

/**
 * The four bottom-navigation destinations live in one native stack for now.
 * Tab changes are immediate; the custom bottom bar owns the short selection
 * motion. A full-screen native fade kept the whole page translucent during
 * rapid taps and delayed the next interaction until its transition completed.
 */
export const MAIN_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "none",
  gestureEnabled: false
} as const

/**
 * Detail screens pushed over the main tabs (profile, match, settings, legal,
 * the avatar wardrobe, the room editor) use the platform push. iOS closes an
 * edge swipe-back with the native slide, so the push makes open, the Back
 * button and the swipe agree. Detail screens keep the edge-only swipe: the
 * room editor drags furniture across its canvas.
 */
export const DETAIL_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "default"
} as const

/**
 * The chat thread alone may be dismissed by a swipe anywhere on screen; its
 * bubbles own no horizontal gesture. iOS always runs that full-screen
 * gesture as a simple push, so the thread also opens with the simple push
 * and open and close match.
 */
export const CHAT_THREAD_SCREEN_OPTIONS = {
  ...DETAIL_SCREEN_OPTIONS,
  animation: "simple_push",
  fullScreenGestureEnabled: true
} as const

export function getDetailScreenOptions(reduceMotion: boolean) {
  return reduceMotion
    ? { ...DETAIL_SCREEN_OPTIONS, animation: "none" as const }
    : DETAIL_SCREEN_OPTIONS
}

export function getChatThreadScreenOptions(reduceMotion: boolean) {
  return reduceMotion
    ? { ...CHAT_THREAD_SCREEN_OPTIONS, animation: "none" as const }
    : CHAT_THREAD_SCREEN_OPTIONS
}

/** Avoid rebuilding the native-stack state when the focused tab is tapped again. */
export function shouldDispatchMainTabNavigation(
  currentRouteName: string | undefined,
  destination: string
): boolean {
  return currentRouteName !== destination
}

/** Override any native-stack fade only when the OS requests less motion. */
export function getReducedMotionScreenOptions(reduceMotion: boolean):
  { animation: "none" } | Record<string, never> {
  return reduceMotion ? { animation: "none" } : {}
}

/** Use a registered route when an explicit back action has no stack history. */
export function goBackOrFallback(
  navigation: {
    canGoBack: () => boolean
    goBack: () => void
  },
  fallback: () => void
): void {
  if (navigation.canGoBack()) {
    navigation.goBack()
  } else {
    fallback()
  }
}

export function getBottomNavKeyForRoute(
  routeName: string | undefined
): BottomNavKey | null {
  if (routeName === "Lobby") return "discover"
  if (routeName === "Inbox") return "chats"
  if (routeName === "MyRoom") return "myroom"
  if (routeName === "CosmeticShop") return "shop"
  return null
}

/** Native-stack transitionStart is emitted before a gesture pop updates JS navigation state. */
export function shouldRevealMyRoomNavDuringClosing(input: {
  platform: "ios" | "android"
  currentRouteName: string | undefined
  editorRouteKey: string
  closing: boolean
  reduceMotion: boolean
  stack: { index: number; routes: readonly { key: string; name: string }[] } | undefined
}): boolean {
  // Android's installed native-stack does not emit gestureCancel, so an
  // interrupted close could otherwise leave the visual-only nav preview shown.
  if (input.platform !== "ios" || input.reduceMotion || !input.closing || input.currentRouteName !== "MyRoomEditor") return false
  const { stack } = input
  if (!stack || stack.index < 1) return false
  return stack.routes[stack.index]?.key === input.editorRouteKey &&
    stack.routes[stack.index]?.name === "MyRoomEditor" &&
    stack.routes[stack.index - 1]?.name === "MyRoom"
}

export function shouldClearMyRoomNavPreviewOnTransitionEnd(input: {
  closing: boolean
  editorRouteKey: string
  previewedEditorRouteKey: string | null
  currentRouteKey: string | undefined
}): boolean {
  if (input.previewedEditorRouteKey !== input.editorRouteKey) return false
  return input.closing
    ? input.currentRouteKey !== undefined && input.currentRouteKey !== input.editorRouteKey
    : input.currentRouteKey === input.editorRouteKey
}

export function shouldClearMyRoomNavPreviewOnRouteChange(input: {
  routeName: string | undefined
  routeKey: string | undefined
  previewedEditorRouteKey: string | null
}): boolean {
  return input.routeName !== undefined && input.previewedEditorRouteKey !== null &&
    (input.routeName !== "MyRoomEditor" || input.routeKey !== input.previewedEditorRouteKey)
}

export function getBottomNavRoutePresentation(
  routeName: string | undefined,
  revealMyRoomReturn = false
): {
  mounted: boolean
  visible: boolean
  currentKey: BottomNavKey | null
} {
  const currentKey = getBottomNavKeyForRoute(routeName)
  if (routeName === "MyRoomEditor" && revealMyRoomReturn) {
    return { mounted: true, visible: true, currentKey: "myroom" }
  }
  return {
    // This helper is used only inside the signed-in Main navigator. Keep its
    // small native animated shell mounted on nested screens too, so a push to
    // You/Settings/ProfileEdit cannot discard the selected-pill/press state
    // before the user returns to a main tab.
    mounted: routeName !== undefined,
    visible: currentKey !== null,
    currentKey
  }
}

export function shouldShowMyRoomNavPreview(input: {
  routeName: string | undefined
  routeKey: string | undefined
  previewedEditorRouteKey: string | undefined
}): boolean {
  return input.routeName === "MyRoomEditor" &&
    input.routeKey !== undefined &&
    input.previewedEditorRouteKey === input.routeKey
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

export function createPostMatchChatNavigationState(
  params: RootStackParamList["ChatThread"]
) {
  return {
    index: 1,
    routes: [
      { name: "Inbox" as const },
      { name: "ChatThread" as const, params }
    ]
  }
}
