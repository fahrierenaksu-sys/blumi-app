import type { ChatParticipantSummary, ChatThread } from "@blumi/contracts"
import {
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "../avatarV2/candidateAvatarSnapshot"
import { selectChatPartnerSummary } from "../chat/thread/chatThreadModel"

/** Who the room shows as the partner: name plate, chibi, typing and history labels. */
export interface MiniRoomPartnerIdentity {
  userId: string
  displayName: string
  avatarSnapshot?: CandidateAvatarSnapshot
}

/**
 * The partner as the chat store knows them now, from the room's source
 * conversation. `chat.participant_updated` (a new name or outfit) updates it
 * live; another user in that thread is never taken for the partner.
 */
export function selectMiniRoomLivePartner(
  thread: ChatThread | null | undefined,
  localUserId: string,
  partnerUserId: string
): ChatParticipantSummary | null {
  const summary = selectChatPartnerSummary(thread, localUserId)
  return summary?.userId === partnerUserId ? summary : null
}

/**
 * The partner's current name and outfit, with the navigation params (the
 * invite's snapshot, refreshed on reconnect) as the fallback for whatever
 * the chat store does not know.
 */
export function resolveMiniRoomPartnerIdentity(
  fallback: MiniRoomPartnerIdentity,
  live: ChatParticipantSummary | null | undefined
): MiniRoomPartnerIdentity {
  if (!live || live.userId !== fallback.userId) return fallback
  const displayName = live.displayName?.trim() ? live.displayName : fallback.displayName
  if (live.avatar) {
    return {
      ...fallback,
      displayName,
      avatarSnapshot: createCandidateAvatarSnapshot({
        userId: fallback.userId,
        displayName,
        avatarSelection: live.avatar
      })
    }
  }
  if (displayName === fallback.displayName) return fallback
  return {
    ...fallback,
    displayName,
    ...(fallback.avatarSnapshot ? { avatarSnapshot: { ...fallback.avatarSnapshot, displayName } } : {})
  }
}
