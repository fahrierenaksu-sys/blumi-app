import type { DiscoveryFilters } from "@blumi/contracts"
import {
  DEFAULT_DISCOVERY_FILTERS
} from "./discoveryFiltersModel"
import {
  isLiveInviteAvailable,
  type DiscoveryCandidate
} from "./discoveryCandidateModel"

export function areDiscoverVibesEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export function countActiveDiscoverFilters(filters: DiscoveryFilters): number {
  let count = 0
  if (
    filters.ageMin !== DEFAULT_DISCOVERY_FILTERS.ageMin ||
    filters.ageMax !== DEFAULT_DISCOVERY_FILTERS.ageMax
  ) {
    count += 1
  }
  if (filters.genders.length > 0) count += 1
  if (!areDiscoverVibesEqual(filters.vibes, DEFAULT_DISCOVERY_FILTERS.vibes)) {
    count += 1
  }
  return count
}

export function distanceLabelOf(distance: number | undefined): string {
  if (!Number.isFinite(distance)) {
    return "Location private"
  }
  const value = distance ?? 0
  if (value < 100) return "Very close"
  if (value < 500) return `${Math.round(value)}m away`
  return "In the area"
}

export function inviteReadinessLabel(candidate: DiscoveryCandidate): string {
  if (candidate.blocked) return "Hidden for now"
  return isLiveInviteAvailable(candidate) ? "Ready for an invite" : "Say hi first"
}

export interface LobbyProfileCue {
  id: string
  label: string
  value: string
  detail: string
}

export function buildProfileCues(
  candidate: DiscoveryCandidate,
  distanceLabel: string,
  isProductionDiscovery: boolean
): LobbyProfileCue[] {
  if (isProductionDiscovery) {
    return []
  }

  return [
    {
      id: "live_overlap",
      label: "Live lobby",
      value: "Here now",
      detail: "You are seeing this person because they are active in the lobby."
    },
    {
      id: "proximity",
      label: "Close by",
      value: distanceLabel,
      detail: "Distance is calculated from the live lobby presence shared for this session."
    },
    {
      id: "room_readiness",
      label: "Shared room",
      value: inviteReadinessLabel(candidate),
      detail: isLiveInviteAvailable(candidate)
        ? "If they accept, a shared room opens for just the two of you."
        : "Send a spark first, then try a room invite."
    }
  ]
}
