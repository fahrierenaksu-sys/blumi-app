import type { AppLocale } from "../../session/appLocale"
import {
  isLiveInviteAvailable,
  type DiscoveryCandidate
} from "../discoveryCandidateModel"

export type ProductionDiscoveryPlaceholderState = "error" | "loading" | "empty"

export function resolveProductionDiscoveryPlaceholderState(input: {
  isProductionDiscovery: boolean
  filtersReady: boolean
  isSafetyListReady: boolean
  safetyHydrationFailed: boolean
  hasCachedProfiles: boolean
  queryLoading: boolean
  hasError: boolean
}): "error" | "loading" | "empty" {
  if (!input.isProductionDiscovery) return "empty"
  if (input.hasError || input.safetyHydrationFailed) return "error"
  if (!input.filtersReady || !input.isSafetyListReady) return "loading"
  if (!input.hasCachedProfiles && input.queryLoading) return "loading"
  return "empty"
}

export interface DiscoveryProgressCopy {
  finding: string
  quota: string
  everyoneSeen: string
  peopleToMeet: (count: number) => string
}

export function resolveDiscoveryProgressLabel(input: {
  productionDiscoverLoading: boolean
  productionDiscoverError: string | null
  discoveryQuotaExhausted: boolean
  discoverableCount: number
  nearbyCount: number
  copy: DiscoveryProgressCopy
}): string | null {
  const { copy } = input
  return input.productionDiscoverLoading
    ? copy.finding
    : input.productionDiscoverError
      ? input.productionDiscoverError
      : input.discoveryQuotaExhausted
        ? copy.quota
        : input.discoverableCount > 0
          ? copy.peopleToMeet(input.discoverableCount)
          : input.nearbyCount > 0
            ? copy.everyoneSeen
            : null
}

export function resolveDiscoveryLikeDisabled(input: {
  featuredCandidate: DiscoveryCandidate | null
  isProductionDiscovery: boolean
  isPendingForFeatured: boolean
  inFlightDecisionUserIds: ReadonlySet<string>
  isLobbyJoined: boolean
  connectionStatus: string
}): boolean {
  const { featuredCandidate, isProductionDiscovery } = input
  return (
    !featuredCandidate ||
    (!isProductionDiscovery && !isLiveInviteAvailable(featuredCandidate)) ||
    featuredCandidate.blocked ||
    input.isPendingForFeatured ||
    input.inFlightDecisionUserIds.has(featuredCandidate.userId) ||
    (!isProductionDiscovery &&
      (!input.isLobbyJoined || input.connectionStatus !== "connected"))
  )
}

export function getDiscoverNotReadyMessage(locale: AppLocale): string {
  return locale === "tr"
    ? "Keşfet henüz hazırlanamadı. Bağlantını kontrol edip tekrar dene."
    : "Discover isn't ready yet. Check your connection and try again."
}

export function getSafetyListUnverifiedMessage(locale: AppLocale): string {
  return locale === "tr"
    ? "Güvenlik listesi doğrulanamadı. Bağlantını kontrol edip tekrar dene."
    : "We couldn't verify your safety list. Check your connection and try again."
}

// Message for the in-deck error card. A failed safety-list hydration wins so
// the viewer is told why cached cards stay hidden.
export function resolveDiscoverErrorCardMessage(input: {
  locale: AppLocale
  placeholderState: ProductionDiscoveryPlaceholderState
  safetyHydrationFailed: boolean
  productionDiscoverError: string | null
}): string {
  return input.placeholderState === "error" && input.safetyHydrationFailed
    ? getSafetyListUnverifiedMessage(input.locale)
    : input.productionDiscoverError ?? getDiscoverNotReadyMessage(input.locale)
}
