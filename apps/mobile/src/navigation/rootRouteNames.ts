import type { RootStackParamList } from "./RootNavigator"

/**
 * Every root stack route name, as a closed runtime list. Crash reports may
 * carry exactly one of these as a screen name; anything else is "unknown".
 * Kept free of runtime imports so the crash privacy filter can use it.
 */
export const ROOT_ROUTE_NAMES = [
  "AuthEntry",
  "Register",
  "PreAuthSetup",
  "ProfileSetup",
  "AvatarSetup",
  "RoomSetup",
  "Lobby",
  "ProfilePreview",
  "MiniRoom",
  "MiniRoomRigPreview",
  "RoomDebrief",
  "Inbox",
  "MyRoom",
  "HomeStudio",
  "You",
  "CosmeticShop",
  "ProfileEdit",
  "WardrobeV2",
  "MyRoomEditor",
  "Settings",
  "AccountRestriction",
  "Legal",
  "ChatThread",
  "MatchResult",
  "NativeSheet"
] as const satisfies readonly (keyof RootStackParamList)[]

export type RootRouteName = (typeof ROOT_ROUTE_NAMES)[number]

// Compile-time proof that the list is exhaustive: a route added to
// RootStackParamList without being listed here fails `npm run typecheck`.
type MissingRootRouteNames = Exclude<keyof RootStackParamList, RootRouteName>
const rootRouteNamesAreExhaustive: [MissingRootRouteNames] extends [never] ? true : MissingRootRouteNames = true
void rootRouteNamesAreExhaustive

const rootRouteNameSet: ReadonlySet<string> = new Set(ROOT_ROUTE_NAMES)

export function isRootRouteName(value: unknown): value is RootRouteName {
  return typeof value === "string" && rootRouteNameSet.has(value)
}
