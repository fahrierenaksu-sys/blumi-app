import type { AvatarSelection, UserProfilePrompt } from "@blumi/contracts"
import { cloneAvatarSelection } from "../avatarV2/avatarSelectionModel"
import type { DiscoverProfileRecord } from "./discoveryApi"
import {
  buildDiscoveryDeck,
  type DiscoveryDeckExclusions
} from "./discoveryDeckModel"

export type DiscoveryDecisionCapability =
  | "mutual-like"
  | "view-only"
  | "live-invite"
  | "unavailable"

export interface DiscoveryCandidate {
  userId: string
  displayName: string
  age?: number
  bio?: string
  prompts?: UserProfilePrompt[]
  avatarPresetId?: string
  avatar?: AvatarSelection
  spotId: string
  distance?: number
  distanceLabel?: string
  vibeTags?: string[]
  signals?: string[]
  badges?: string[]
  roomHeadline?: string
  roomSnapshotUrl?: string
  decisionCapability: DiscoveryDecisionCapability
  blocked: boolean
}

export interface LiveDiscoveryCandidateSource {
  userId: string
  displayName: string
  spotId: string
  distance: number
  canInvite: boolean
  blocked: boolean
}

const DISCOVERY_CARD_BIO_MAX_LENGTH = 86

export function formatDiscoveryCardBio(bio: string | undefined): string | null {
  const normalized = bio?.replace(/\s+/g, " ").trim() ?? ""
  if (!normalized) return null
  if (normalized.length <= DISCOVERY_CARD_BIO_MAX_LENGTH) return normalized

  const available = normalized.slice(0, DISCOVERY_CARD_BIO_MAX_LENGTH - 1)
  if (/\s/.test(normalized.charAt(available.length))) {
    return `${available.trimEnd()}…`
  }
  const lastWordBoundary = available.lastIndexOf(" ")
  const concise = lastWordBoundary > 0
    ? available.slice(0, lastWordBoundary)
    : available
  return `${concise.trimEnd()}…`
}

export function createProductionDiscoveryCandidate(
  profile: DiscoverProfileRecord
): DiscoveryCandidate {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    age: profile.age,
    bio: profile.bio,
    prompts: profile.prompts?.map((prompt) => ({ ...prompt })),
    avatarPresetId: profile.avatarPresetId,
    avatar: cloneAvatarSelection(profile.avatar),
    spotId: `backend:${profile.userId}`,
    distanceLabel: profile.distanceLabel,
    vibeTags: [...profile.vibeTags],
    signals: [...profile.signals],
    badges: profile.badges ? [...profile.badges] : undefined,
    roomHeadline: profile.roomHeadline ?? undefined,
    roomSnapshotUrl: profile.roomSnapshotUrl ?? undefined,
    decisionCapability: "mutual-like",
    blocked: false
  }
}

export function createLiveDiscoveryCandidate(
  profile: LiveDiscoveryCandidateSource
): DiscoveryCandidate {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    spotId: profile.spotId,
    distance: profile.distance,
    decisionCapability:
      profile.canInvite && !profile.blocked ? "live-invite" : "unavailable",
    blocked: profile.blocked
  }
}

export function isLiveInviteAvailable(
  candidate: DiscoveryCandidate
): boolean {
  return candidate.decisionCapability === "live-invite" && !candidate.blocked
}

export function buildAvailableDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  exclusions: DiscoveryDeckExclusions
): DiscoveryCandidate[] {
  return buildDiscoveryDeck(candidates, exclusions)
}
