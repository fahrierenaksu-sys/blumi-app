import { useCallback, useMemo, useSyncExternalStore } from "react"
import { createCandidateAvatarSnapshot, type CandidateAvatarSnapshot } from "../avatarV2/candidateAvatarSnapshot"
import { subscribeToChatStore } from "./chatStore"
import { getChatParticipantSnapshot } from "./chatParticipantUpdates"
import { resolveLiveParticipantIdentity } from "./liveParticipantIdentityModel"

export function useChatParticipant(userId: string | undefined) {
  const getSnapshot = useCallback(() => userId ? getChatParticipantSnapshot(userId) : undefined, [userId])
  return useSyncExternalStore(subscribeToChatStore, getSnapshot, getSnapshot)
}

interface DisplayedParticipant {
  userId: string
  displayName: string
  profileUpdatedAt?: string
  avatarSnapshot?: CandidateAvatarSnapshot
}

/** Overlay saved identity on an open route without changing its membership or context. */
export function useLiveParticipantIdentity<T extends DisplayedParticipant>(participant: T | undefined): T | undefined {
  const live = useChatParticipant(participant?.userId)
  return useMemo(() => {
    if (!participant || !live) return participant
    const identity = resolveLiveParticipantIdentity({ ...participant, avatar: participant.avatarSnapshot?.avatarSelection }, live)
    return { ...participant, displayName: identity.displayName, profileUpdatedAt: identity.profileUpdatedAt,
      ...(participant.avatarSnapshot || identity.avatar ? { avatarSnapshot: createCandidateAvatarSnapshot({
        userId: participant.userId, displayName: identity.displayName, avatarSelection: identity.avatar,
        avatarSnapshot: participant.avatarSnapshot
      }) } : {}) }
  }, [live, participant])
}
