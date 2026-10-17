/**
 * The live-canvas budget (plan 2.2): at most one live 2.5D canvas for the focused screen, two in a MiniRoom, none
 * anywhere else. Everything without a grant shows the identical baked still. Pure (no React): the store is
 * created once for the app (`AVATAR_LIVE_BUDGET`) and read through `useAvatarLiveSlot`.
 *
 * Callers that are focused AND shown request a slot and release it on unmount. The newest focused request wins:
 * the screen the user just opened gets the canvas, and an older holder drops back to its still. Requests of
 * another scope than the newest focused one get nothing.
 *
 * A room avatar may also keep a paused canvas while its screen is in the background (a pager page not shown):
 * those background requests never take a focused caller's slot, and at most `AVATAR_LIVE_BACKGROUND_LIMIT` of
 * them hold one, only in the "screen" scope (a MiniRoom on top takes every canvas). Coming back, the avatar is
 * drawn on the first frame instead of being rebuilt.
 */
export type AvatarLiveScope = "screen" | "miniRoom"

export const AVATAR_LIVE_LIMITS: Readonly<Record<AvatarLiveScope, number>> = { screen: 1, miniRoom: 2 }
/** Paused background canvases kept besides the focused ones ("screen" scope only). */
export const AVATAR_LIVE_BACKGROUND_LIMIT = 1

export interface AvatarLiveBudget {
  /** Asks for a live canvas (`background`: a paused one for a screen not shown); returns the token to release it with. */
  request: (scope: AvatarLiveScope, background?: boolean) => number
  release: (token: number) => void
  isGranted: (token: number) => boolean
  /** Number of live canvases granted right now. */
  grantedCount: () => number
  subscribe: (listener: () => void) => () => void
}

interface LiveRequest {
  readonly token: number
  readonly scope: AvatarLiveScope
  readonly background?: boolean
}

/**
 * Which tokens hold a canvas: in the newest focused request's scope (else the newest request's), the focused
 * requests newest first up to that scope's limit, then in the "screen" scope up to
 * `backgroundLimit` background ones, newest first.
 */
export function grantAvatarLiveSlots(
  requests: readonly LiveRequest[],
  limits: Readonly<Record<AvatarLiveScope, number>> = AVATAR_LIVE_LIMITS,
  backgroundLimit: number = AVATAR_LIVE_BACKGROUND_LIMIT
): ReadonlySet<number> {
  const focused = requests.filter((request) => !request.background)
  const newest = focused[focused.length - 1] ?? requests[requests.length - 1]
  if (!newest) return new Set()
  const scope = newest.scope
  const granted = focused.filter((request) => request.scope === scope).slice(-Math.max(0, limits[scope]))
  const background = scope === "screen"
    ? requests.filter((request) => request.background && request.scope === scope).slice(-Math.max(0, backgroundLimit))
    : []
  return new Set([...granted, ...background].map((request) => request.token))
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
    request: (scope, background = false) => {
      const token = nextToken++
      update([...requests, { token, scope, background }])
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
