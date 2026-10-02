/**
 * Pure rules for native sheets (no React Native imports).
 *
 * iOS presents every bottom sheet as a native-stack `formSheet` route
 * (UISheetPresentationController: detents, grabber, system dimming, swipe and
 * tap-outside dismissal, the background receding at the large detent).
 * Android keeps the app's own `SwipeDismissSheet` inside a React Native
 * `Modal`: the bottom bar draws above navigator content there, so a route
 * would sit under it.
 */

export const NATIVE_SHEET_ROUTE_NAME = "NativeSheet" as const

export const NATIVE_SHEET_KINDS = [
  "discoverFilters",
  "report",
  "countryPicker",
  "inboxConversationActions"
] as const

export type NativeSheetKind = (typeof NATIVE_SHEET_KINDS)[number]

export interface NativeSheetRouteParams {
  sheet: NativeSheetKind
  requestId: string
}

export type NativeSheetPlatform = "ios" | "android" | string

export function shouldPresentAsNativeSheet(platform: NativeSheetPlatform): boolean {
  return platform === "ios"
}

/** `fitToContents` sizes the sheet to its content; fractions are of the screen. */
const SHEET_DETENTS: Record<NativeSheetKind, number[] | "fitToContents"> = {
  discoverFilters: "fitToContents",
  report: "fitToContents",
  // A long searchable list: opens at about two thirds, scrolling expands it.
  countryPicker: [0.66, 1],
  inboxConversationActions: "fitToContents"
}

export interface NativeSheetScreenOptions {
  headerShown: false
  presentation: "formSheet"
  sheetAllowedDetents: number[] | "fitToContents"
  sheetGrabberVisible: true
  sheetCornerRadius: number
  sheetExpandsWhenScrolledToEdge: boolean
  /** Reduce Motion: the sheet crossfades in and out instead of sliding. */
  animation: "default" | "fade"
  gestureEnabled: true
  contentStyle: { backgroundColor: string }
}

export function getNativeSheetScreenOptions(input: {
  kind: NativeSheetKind | undefined
  reduceMotion: boolean
  backgroundColor: string
  cornerRadius: number
}): NativeSheetScreenOptions {
  const detents = input.kind ? SHEET_DETENTS[input.kind] : "fitToContents"
  return {
    headerShown: false,
    presentation: "formSheet",
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: input.cornerRadius,
    sheetExpandsWhenScrolledToEdge: detents !== "fitToContents",
    animation: input.reduceMotion ? "fade" : "default",
    gestureEnabled: true,
    contentStyle: { backgroundColor: input.backgroundColor }
  }
}

export function isNativeSheetKind(value: unknown): value is NativeSheetKind {
  return typeof value === "string" && (NATIVE_SHEET_KINDS as readonly string[]).includes(value)
}

interface RouteLike {
  key: string
  name: string
}

interface StackStateLike {
  index: number
  routes: readonly RouteLike[]
}

/**
 * The route a sheet sits on: the focused route, skipping sheets on top. The
 * bottom bar and other root chrome follow this route, so opening a sheet over
 * a tab does not hide the tab bar behind it.
 */
export function getRouteBeneathSheets<R extends RouteLike>(
  state: { index: number; routes: readonly R[] } | undefined
): R | undefined {
  if (!state) return undefined
  for (let index = Math.min(state.index, state.routes.length - 1); index >= 0; index -= 1) {
    const route = state.routes[index]
    if (route && route.name !== NATIVE_SHEET_ROUTE_NAME) return route
  }
  return undefined
}

/**
 * True when `routeKey` is focused, or only native sheets sit above it. A sheet
 * is part of the screen it opened from: chat stays "open" (read state,
 * alert suppression) while its report sheet is up.
 */
export function isFocusedBeneathSheets(
  state: StackStateLike | undefined,
  routeKey: string
): boolean {
  return getRouteBeneathSheets(state)?.key === routeKey
}
