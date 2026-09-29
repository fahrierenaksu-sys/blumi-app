/**
 * One pending in-app deep link, kept in memory only.
 *
 * The root stack registers the linkable screens only for the unrestricted Main
 * session. A `blumi://` link that arrives earlier (cold start while the
 * session restores, AuthEntry, onboarding, a restricted account) would be
 * dropped by React Navigation, so it is held here instead and handed to the
 * container's own linking listener exactly once, when the Main stack of the
 * same signed-in session can route it. The link is bound to its session
 * owner, bounded in size and age, and never persisted.
 *
 * This module has no runtime imports so the model runs under plain Node.
 */

/** A pending link older than this is discarded instead of replayed. */
export const PENDING_DEEP_LINK_TTL_MS = 10 * 60 * 1000
/** Longer links are never kept; no linkable route needs anything close. */
export const MAX_PENDING_DEEP_LINK_URL_LENGTH = 512

export interface DeepLinkOwner {
  userId: string
  sessionId: string
}

export interface DeepLinkRouteContext {
  sessionEntryRoute: string
  isAccountRestricted: boolean
  /** The signed-in session, or null while signed out or restoring. */
  owner: DeepLinkOwner | null
}

export interface DeepLinkMatch {
  routeName: string
}

export interface PendingDeepLink {
  url: string
  routeName: string
  capturedAtMs: number
  /** Null only while captured before any session exists (claimed on sign-in). */
  owner: DeepLinkOwner | null
}

export type DeepLinkListener = (url: string) => void

export interface PendingDeepLinkNavigation {
  isReady: () => boolean
  /** Route names of the currently mounted root navigator. */
  getRouteNames: () => readonly string[] | undefined
}

export interface PendingDeepLinkStoreOptions {
  prefixes: readonly string[]
  screens: Readonly<Record<string, string>>
  now: () => number
  navigation: PendingDeepLinkNavigation
}

export interface PendingDeepLinkStore {
  /** Reports the latest root session state; discards on sign-out or switch. */
  updateContext: (context: DeepLinkRouteContext) => void
  /**
   * Resolves the OS initial URL for the container. The URL is handed to
   * navigation at most once per process; outside Main it becomes pending.
   */
  resolveInitialUrl: (url: string) => string | null
  /** Routes a live link now in Main, otherwise keeps it pending. */
  handleUrl: (url: string) => void
  /** Registers the container's linking listener; returns its detach. */
  attachListener: (listener: DeepLinkListener) => () => void
  /** Replays the pending link once if Main can route it; true when replayed. */
  replay: () => boolean
  peek: () => PendingDeepLink | null
}

const INITIAL_CONTEXT: DeepLinkRouteContext = {
  sessionEntryRoute: "Splash",
  isAccountRestricted: false,
  owner: null
}

/**
 * Matches a link against the root linking config. Only exact segment matches
 * (static segments and non-empty `:params`) are accepted; query and hash are
 * ignored for matching but kept in the replayed URL.
 */
export function matchDeepLinkUrl(
  url: string,
  prefixes: readonly string[],
  screens: Readonly<Record<string, string>>
): DeepLinkMatch | null {
  if (url.length > MAX_PENDING_DEEP_LINK_URL_LENGTH) return null
  const prefix = prefixes.find((candidate) => url.startsWith(candidate))
  if (prefix === undefined) return null
  const path = url.slice(prefix.length).split(/[?#]/)[0].replace(/\/+$/, "")
  if (path === "") return null
  const segments = path.split("/")
  if (segments.some((segment) => segment === "")) return null
  for (const [routeName, pattern] of Object.entries(screens)) {
    const patternSegments = pattern.split("/")
    if (patternSegments.length !== segments.length) continue
    const matches = patternSegments.every((patternSegment, index) => {
      const segment = segments[index]
      if (!patternSegment.startsWith(":")) return patternSegment === segment
      try {
        return decodeURIComponent(segment) !== ""
      } catch {
        return false
      }
    })
    if (matches) return { routeName }
  }
  return null
}

export function isSameDeepLinkOwner(
  left: DeepLinkOwner | null,
  right: DeepLinkOwner | null
): boolean {
  return left !== null &&
    right !== null &&
    left.userId === right.userId &&
    left.sessionId === right.sessionId
}

/** Only the unrestricted Main stack of a signed-in session may route links. */
export function isDeepLinkRoutableContext(context: DeepLinkRouteContext): boolean {
  return context.sessionEntryRoute === "Main" &&
    !context.isAccountRestricted &&
    context.owner !== null
}

/**
 * Binds an unowned link to the first signed-in session and discards a link
 * whose session ended (sign-out) or changed (account or session switch).
 */
export function reconcilePendingDeepLinkOwner(
  pending: PendingDeepLink | null,
  owner: DeepLinkOwner | null
): PendingDeepLink | null {
  if (!pending) return null
  if (pending.owner === null) return owner ? { ...pending, owner } : pending
  return isSameDeepLinkOwner(pending.owner, owner) ? pending : null
}

export function isPendingDeepLinkExpired(pending: PendingDeepLink, nowMs: number): boolean {
  return nowMs - pending.capturedAtMs > PENDING_DEEP_LINK_TTL_MS
}

export function createPendingDeepLinkStore(
  options: PendingDeepLinkStoreOptions
): PendingDeepLinkStore {
  let context = INITIAL_CONTEXT
  let pending: PendingDeepLink | null = null
  let listener: DeepLinkListener | null = null
  let hasResolvedInitialUrl = false

  const capture = (url: string): void => {
    const match = matchDeepLinkUrl(url, options.prefixes, options.screens)
    if (!match) return
    pending = {
      url,
      routeName: match.routeName,
      capturedAtMs: options.now(),
      owner: context.owner
    }
  }

  const replay = (): boolean => {
    if (!pending) return false
    if (isPendingDeepLinkExpired(pending, options.now())) {
      pending = null
      return false
    }
    if (!isDeepLinkRoutableContext(context) || !options.navigation.isReady()) return false
    if (!isSameDeepLinkOwner(pending.owner, context.owner)) {
      pending = null
      return false
    }
    if (!options.navigation.getRouteNames()?.includes(pending.routeName)) return false
    if (!listener) return false
    const { url } = pending
    pending = null
    listener(url)
    return true
  }

  return {
    updateContext(nextContext) {
      context = nextContext
      pending = reconcilePendingDeepLinkOwner(pending, nextContext.owner)
    },
    resolveInitialUrl(url) {
      if (hasResolvedInitialUrl) return null
      hasResolvedInitialUrl = true
      // The container is not ready while it resolves its initial state, so
      // only the session decides whether the link can become that state.
      if (isDeepLinkRoutableContext(context)) {
        pending = null
        return url
      }
      capture(url)
      return null
    },
    handleUrl(url) {
      if (isDeepLinkRoutableContext(context) && options.navigation.isReady() && listener) {
        // A link routed now supersedes any older pending link.
        pending = null
        listener(url)
        return
      }
      capture(url)
    },
    attachListener(nextListener) {
      listener = nextListener
      replay()
      return () => {
        if (listener === nextListener) listener = null
      }
    },
    replay,
    peek: () => pending
  }
}
