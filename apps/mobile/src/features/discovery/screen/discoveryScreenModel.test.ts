import assert from "node:assert/strict"
import test from "node:test"
import {
  getDiscoverNotReadyMessage,
  getSafetyListUnverifiedMessage,
  resolveDiscoverErrorCardMessage,
  resolveDiscoveryLikeDisabled,
  resolveDiscoveryProgressLabel,
  resolveProductionDiscoveryPlaceholderState
} from "./discoveryScreenModel"
import {
  createLiveDiscoveryCandidate,
  type DiscoveryCandidate
} from "../discoveryCandidateModel"

const copy = {
  finding: "finding",
  quota: "quota",
  everyoneSeen: "everyone-seen",
  peopleToMeet: (count: number) => `meet:${count}`
}

const progressBase = {
  productionDiscoverLoading: false,
  productionDiscoverError: null,
  discoveryQuotaExhausted: false,
  discoverableCount: 0,
  nearbyCount: 0,
  copy
}

test("progress label priority is loading, error, quota, deck count, then everyone seen", () => {
  assert.equal(resolveDiscoveryProgressLabel(progressBase), null)
  assert.equal(
    resolveDiscoveryProgressLabel({
      ...progressBase,
      productionDiscoverLoading: true,
      productionDiscoverError: "load failed",
      discoveryQuotaExhausted: true,
      discoverableCount: 3
    }),
    "finding"
  )
  assert.equal(
    resolveDiscoveryProgressLabel({
      ...progressBase,
      productionDiscoverError: "load failed",
      discoveryQuotaExhausted: true,
      discoverableCount: 3
    }),
    "load failed"
  )
  assert.equal(
    resolveDiscoveryProgressLabel({
      ...progressBase,
      discoveryQuotaExhausted: true,
      discoverableCount: 3
    }),
    "quota"
  )
  assert.equal(
    resolveDiscoveryProgressLabel({ ...progressBase, discoverableCount: 3, nearbyCount: 5 }),
    "meet:3"
  )
  assert.equal(
    resolveDiscoveryProgressLabel({ ...progressBase, nearbyCount: 5 }),
    "everyone-seen"
  )
})

test("an empty error string falls through like the original truthiness check", () => {
  assert.equal(
    resolveDiscoveryProgressLabel({ ...progressBase, productionDiscoverError: "", discoverableCount: 1 }),
    "meet:1"
  )
})

test("placeholder state stays fail-closed until filters and the safety list are ready", () => {
  const base = {
    isProductionDiscovery: true,
    filtersReady: true,
    isSafetyListReady: true,
    safetyHydrationFailed: false,
    hasCachedProfiles: false,
    queryLoading: false,
    hasError: false
  }
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, isProductionDiscovery: false, hasError: true }), "empty")
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, hasError: true }), "error")
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, safetyHydrationFailed: true, isSafetyListReady: false }), "error")
  assert.equal(
    resolveProductionDiscoveryPlaceholderState({ ...base, isSafetyListReady: false, safetyHydrationFailed: true, hasCachedProfiles: true }),
    "error",
    "a failed safety hydration shows an error without revealing cached cards"
  )
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, isSafetyListReady: false, hasCachedProfiles: true }), "loading")
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, filtersReady: false }), "loading")
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, queryLoading: true }), "loading")
  assert.equal(resolveProductionDiscoveryPlaceholderState({ ...base, queryLoading: true, hasCachedProfiles: true }), "empty")
  assert.equal(resolveProductionDiscoveryPlaceholderState(base), "empty")
})

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    ...createLiveDiscoveryCandidate({
      userId: "user-b",
      displayName: "Bea",
      spotId: "spot-1",
      distance: 42,
      canInvite: true,
      blocked: false
    }),
    ...overrides
  }
}

const likeBase = {
  featuredCandidate: candidate(),
  isProductionDiscovery: false,
  isPendingForFeatured: false,
  inFlightDecisionUserIds: new Set<string>(),
  isLobbyJoined: true,
  connectionStatus: "connected"
}

test("like is disabled without a featured candidate or while it is blocked, pending or in flight", () => {
  assert.equal(resolveDiscoveryLikeDisabled(likeBase), false)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, featuredCandidate: null }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, featuredCandidate: candidate({ blocked: true }) }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, isPendingForFeatured: true }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, inFlightDecisionUserIds: new Set(["user-b"]) }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, inFlightDecisionUserIds: new Set(["other"]) }), false)
})

test("legacy lobby likes need a joined, connected lobby and an invitable candidate", () => {
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, isLobbyJoined: false }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, connectionStatus: "reconnecting" }), true)
  assert.equal(resolveDiscoveryLikeDisabled({ ...likeBase, featuredCandidate: candidate({ decisionCapability: "unavailable" }) }), true)
})

test("production likes never depend on lobby presence or live invite capability", () => {
  const production = { ...likeBase, isProductionDiscovery: true }
  assert.equal(resolveDiscoveryLikeDisabled({ ...production, isLobbyJoined: false, connectionStatus: "disconnected" }), false)
  assert.equal(resolveDiscoveryLikeDisabled({ ...production, featuredCandidate: candidate({ decisionCapability: "unavailable" }) }), false)
  assert.equal(resolveDiscoveryLikeDisabled({ ...production, featuredCandidate: candidate({ blocked: true }) }), true)
})

test("error card copy is localized and explains an unverified safety list first", () => {
  assert.equal(getDiscoverNotReadyMessage("en"), "Discover isn't ready yet. Check your connection and try again.")
  assert.equal(getDiscoverNotReadyMessage("tr"), "Keşfet henüz hazırlanamadı. Bağlantını kontrol edip tekrar dene.")
  assert.equal(getSafetyListUnverifiedMessage("en"), "We couldn't verify your safety list. Check your connection and try again.")
  assert.equal(getSafetyListUnverifiedMessage("tr"), "Güvenlik listesi doğrulanamadı. Bağlantını kontrol edip tekrar dene.")

  const base = {
    locale: "en" as const,
    placeholderState: "error" as const,
    safetyHydrationFailed: true,
    productionDiscoverError: "load failed"
  }
  assert.equal(resolveDiscoverErrorCardMessage(base), getSafetyListUnverifiedMessage("en"))
  assert.equal(resolveDiscoverErrorCardMessage({ ...base, locale: "tr" }), getSafetyListUnverifiedMessage("tr"))
  assert.equal(resolveDiscoverErrorCardMessage({ ...base, safetyHydrationFailed: false }), "load failed")
  assert.equal(resolveDiscoverErrorCardMessage({ ...base, placeholderState: "empty" }), "load failed")
  assert.equal(
    resolveDiscoverErrorCardMessage({ ...base, safetyHydrationFailed: false, productionDiscoverError: null, locale: "tr" }),
    getDiscoverNotReadyMessage("tr")
  )
  assert.equal(
    resolveDiscoverErrorCardMessage({ ...base, safetyHydrationFailed: false, productionDiscoverError: "" }),
    "",
    "an empty error string is kept, matching the original nullish fallback"
  )
})
