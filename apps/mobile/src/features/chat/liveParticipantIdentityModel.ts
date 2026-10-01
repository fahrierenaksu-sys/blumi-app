import type { AvatarSelection, ChatParticipantSummary } from "@blumi/contracts"

export interface ParticipantIdentity {
  userId: string
  displayName: string
  avatar?: AvatarSelection
  profileUpdatedAt?: string
}

/** Display metadata only: membership, access and ownership never come from this projection. */
export function resolveLiveParticipantIdentity(fallback: ParticipantIdentity, live?: ChatParticipantSummary): ParticipantIdentity {
  if (!live || live.userId !== fallback.userId) return fallback
  const liveNameWins = !fallback.profileUpdatedAt || (live.profileUpdatedAt !== undefined &&
    Date.parse(live.profileUpdatedAt) >= Date.parse(fallback.profileUpdatedAt))
  const avatar = (fallback.avatar?.revision ?? -1) > (live.avatar?.revision ?? -1)
    ? fallback.avatar : live.avatar ?? fallback.avatar
  return { userId: fallback.userId, displayName: liveNameWins ? live.displayName ?? fallback.displayName : fallback.displayName,
    profileUpdatedAt: liveNameWins ? live.profileUpdatedAt : fallback.profileUpdatedAt,
    ...(avatar ? { avatar } : {}) }
}
