import { useMemo } from "react"
import { useChatParticipant } from "../chat/useLiveParticipantIdentity"
import { resolveLiveParticipantIdentity } from "../chat/liveParticipantIdentityModel"
import type { MatchParticipant } from "./matchRoomModel"

export function useLiveMatchParticipant(participant: MatchParticipant | undefined): MatchParticipant | undefined {
  const live = useChatParticipant(participant?.userId)
  return useMemo(() => {
    if (!participant || !live) return participant
    const identity = resolveLiveParticipantIdentity({ ...participant, avatar: participant.avatarSelection }, live)
    return { ...participant, displayName: identity.displayName, profileUpdatedAt: identity.profileUpdatedAt,
      ...(identity.avatar ? { avatarSelection: identity.avatar, avatarPresetId: identity.avatar.presetId } : {}) }
  }, [live, participant])
}
