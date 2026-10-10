/**
 * The live-canvas budget (plan 2.2): at most one live 2.5D canvas for the focused screen, two in a MiniRoom, none
 * anywhere else. Everything without a grant shows the identical baked still. Pure (no React): the store is
 * created once for the app (`AVATAR_LIVE_BUDGET`) and read through `useAvatarLiveSlot`.
 *
 * Only callers that are focused AND shown request a slot (a mounted pager page that is not shown does not), and
 * they release it on blur or unmount. The newest request wins: the screen the user just opened gets the canvas,
 * and an older holder drops back to its still. Requests of another scope than the newest one get nothing.
 */
export type AvatarLiveScope = "screen" | "miniRoom"

export const AVATAR_LIVE_LIMITS: Readonly<Record<AvatarLiveScope, number>> = { screen: 1, miniRoom: 2 }

export interface AvatarLiveBudget {
  /** Asks for a live canvas; returns the token to release it with. */
  request: (scope: AvatarLiveScope) => number
  release: (token: number) => void
  isGranted: (token: number) => boolean
  /** Number of live canvases granted right now. */
  grantedCount: () => number
  subscribe: (listener: () => void) => () => void
}

interface LiveRequest {
  readonly token: number
  readonly scope: AvatarLiveScope
}

/** Which tokens hold a canvas: the newest request's scope, newest first, up to that scope's limit. */
export function grantAvatarLiveSlots(
  requests: readonly LiveRequest[],
  limits: Readonly<Record<AvatarLiveScope, number>> = AVATAR_LIVE_LIMITS
): ReadonlySet<number> {
  const newest = requests[requests.length - 1]
  if (!newest) return new Set()
  const sameScope = requests.filter((request) => request.scope === newest.scope)
  return new Set(sameScope.slice(-Math.max(0, limits[newest.scope])).map((request) => request.token))
}

export function createAvatarLiveBudget(limits: Readonly<Record<AvatarLiveScope, number>> = AVATAR_LIVE_LIMITS): AvatarLiveBudget {
  let requests: readonly LiveRequest[] = []
  let granted: ReadonlySet<number> = new Set()
  let nextToken = 1
  const listeners = new Set<() => void>()
  const update = (next: readonly LiveRequest[]) => {
    requests = next
    const nextGranted = grantAvatarLiveSlots(requests, limits)
    const changed = nextGranted.size !== granted.size || [...nextGranted].some((token) => !granted.has(token))
    granted = nextGranted
    if (changed) listeners.forEach((listener) => listener())
  }
  return {
    request: (scope) => {
      const token = nextToken++
      update([...requests, { token, scope }])
      return token
    },
    release: (token) => {
      if (requests.some((request) => request.token === token)) update(requests.filter((request) => request.token !== token))
    },
    isGranted: (token) => granted.has(token),
    grantedCount: () => granted.size,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** The app's one budget. */
export const AVATAR_LIVE_BUDGET = createAvatarLiveBudget()
