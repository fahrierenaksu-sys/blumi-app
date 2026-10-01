import type { ChatParticipantSummary, UserProfile } from "@blumi/contracts"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"

/** Legacy profiles keep their name and monogram until a complete avatar is saved. */
export type ChatParticipantProfile = UserProfile & { profileUpdatedAt?: string }

export function chatParticipantFromProfile(profile: UserProfile, profileUpdatedAt?: string): ChatParticipantSummary {
  const participant: ChatParticipantSummary = { userId: profile.userId, displayName: profile.displayName,
    ...(profileUpdatedAt ? { profileUpdatedAt } : {}) }
  try {
    participant.avatar = normalizeStoredAvatarSelection({ presetId: profile.avatar.presetId, loadout: profile.avatar.loadout, revision: profile.avatar.revision })
  } catch { /* Optional legacy display metadata. */ }
  return participant
}
