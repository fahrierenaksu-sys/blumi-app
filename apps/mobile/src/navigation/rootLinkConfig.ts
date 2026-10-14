/**
 * Root deep-link path config and the policy that turns an outside URL into
 * navigation state. Kept free of runtime imports so it runs under plain Node.
 */

export const ROOT_LINK_SCREENS = {
  Lobby: "discover",
  Inbox: "inbox",
  ChatThread: "chat/:threadId",
  ProfilePreview: "profile/:userId",
  Settings: "settings",
  MyRoom: "room",
  MyRoomEditor: "room/edit",
  WardrobeV2: "wardrobe",
  CosmeticShop: "shop"
} as const

type LinkRoute = { name: string; params?: object; state?: LinkState }
type LinkState = { routes: ReadonlyArray<LinkRoute> }
export type GetStateFromPath<Options, State> = (path: string, options?: Options) => State | undefined

type RootLinkRouteName = keyof typeof ROOT_LINK_SCREENS

/** The only params a URL may set: the `:segments` of each route's own path. */
const LINK_PARAM_ALLOW_LIST: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  (Object.keys(ROOT_LINK_SCREENS) as RootLinkRouteName[]).map((routeName) => [
    routeName,
    ROOT_LINK_SCREENS[routeName]
      .split("/")
      .filter((segment) => segment.startsWith(":"))
      .map((segment) => segment.slice(1))
  ])
)

/** Query and hash never reach navigation: app commands are in-app only. */
export function stripLinkQueryAndHash(path: string): string {
  return path.split(/[?#]/)[0]
}

function pickAllowedParams(routeName: string, params: object | undefined): object | undefined {
  const allowed = LINK_PARAM_ALLOW_LIST[routeName] ?? []
  const source = (params ?? {}) as Record<string, unknown>
  const kept = Object.fromEntries(
    allowed
      .map((key) => [key, source[key]] as const)
      .filter((entry): entry is readonly [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "")
  )
  return Object.keys(kept).length > 0 ? kept : undefined
}

function sanitizeLinkState<State extends LinkState>(state: State): State {
  const routes = state.routes.map((route): LinkRoute => {
    const params = pickAllowedParams(route.name, route.params)
    const nested = route.state ? sanitizeLinkState(route.state) : undefined
    return {
      ...route,
      params,
      ...(nested ? { state: nested } : {})
    }
  })
  return { ...state, routes }
}

/**
 * Wraps the default path parser so an outside URL can only open a screen with
 * its own path ids. Every query key (invite request/accept, like/pass,
 * profile payload, focus ids) is dropped, and params of the wrong type never
 * reach a screen.
 */
export function createSafeGetStateFromPath<Options, State extends LinkState>(
  defaultGetStateFromPath: GetStateFromPath<Options, State>
): GetStateFromPath<Options, State> {
  return (path, options) => {
    const state = defaultGetStateFromPath(stripLinkQueryAndHash(path), options)
    return state ? sanitizeLinkState(state) : state
  }
}
