/**
 * The policy that turns an outside deep-link URL into navigation state. Kept
 * free of runtime imports so it runs under plain Node.
 */

type LinkRoute = { name: string; params?: object; state?: LinkState }
type LinkState = { routes: readonly LinkRoute[] }
export type GetStateFromPath<Options, State> = (path: string, options?: Options) => State | undefined

export type LinkScreens = Readonly<Record<string, string>>

/** The only params a URL may set: the `:segments` of each route's own path. */
function linkParamAllowList(screens: LinkScreens): ReadonlyMap<string, readonly string[]> {
  return new Map(Object.entries(screens).map(([routeName, pattern]) => [
    routeName,
    pattern
      .split("/")
      .filter((segment) => segment.startsWith(":"))
      .map((segment) => segment.slice(1))
  ]))
}

/** Query and hash never reach navigation: app commands are in-app only. */
export function stripLinkQueryAndHash(path: string): string {
  return path.split(/[?#]/)[0]
}

function pickAllowedParams(
  allowList: ReadonlyMap<string, readonly string[]>,
  routeName: string,
  params: object | undefined
): object | undefined {
  const allowed = allowList.get(routeName) ?? []
  const source = (params ?? {}) as Record<string, unknown>
  const kept = Object.fromEntries(
    allowed
      .map((key) => [key, source[key]] as const)
      .filter((entry): entry is readonly [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "")
  )
  return Object.keys(kept).length > 0 ? kept : undefined
}

function sanitizeLinkState<State extends LinkState>(
  allowList: ReadonlyMap<string, readonly string[]>,
  state: State
): State {
  const routes = state.routes.map((route): LinkRoute => {
    const params = pickAllowedParams(allowList, route.name, route.params)
    const nested = route.state ? sanitizeLinkState(allowList, route.state) : undefined
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
  defaultGetStateFromPath: GetStateFromPath<Options, State>,
  screens: LinkScreens
): GetStateFromPath<Options, State> {
  const allowList = linkParamAllowList(screens)
  return (path, options) => {
    const state = defaultGetStateFromPath(stripLinkQueryAndHash(path), options)
    return state ? sanitizeLinkState(allowList, state) : state
  }
}
