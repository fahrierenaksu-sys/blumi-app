import { DiscoveryDecisionQuotaExhaustedError, DiscoveryRefreshLimitError } from "./discoveryApi"

export type DiscoveryErrorSurface = "load" | "refresh" | "decision"

const DISCOVERY_ERROR_COPY: Record<DiscoveryErrorSurface, string> = {
  load: "We couldn't load Discover. Check your connection and try again.",
  refresh: "We couldn't refresh Discover. Check your connection and try again.",
  decision: "That choice wasn't saved. Check your connection and try again."
}

/**
 * Discovery must remain actionable without exposing provider, transport, or
 * malformed-payload diagnostics in a core first-session surface.
 */
export function getDiscoveryErrorMessageForDisplay(
  surface: DiscoveryErrorSurface,
  _error: unknown
): string {
  if (_error instanceof DiscoveryRefreshLimitError) return `Keep browsing this list. Try refreshing again in ${Math.max(1,Math.ceil(_error.retryAfterSeconds/60))} minutes.`
  return DISCOVERY_ERROR_COPY[surface]
}

/**
 * Detail-profile decisions are outside the deck's quota card, so the quota
 * limit needs its own honest, actionable message instead of a generic failure.
 */
export function getDiscoveryDecisionErrorMessageForDisplay(error: unknown): string {
  return error instanceof DiscoveryDecisionQuotaExhaustedError
    ? "Today’s Discover limit is reached. It will reset automatically."
    : getDiscoveryErrorMessageForDisplay("decision", error)
}
