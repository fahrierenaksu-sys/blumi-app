import type { MiniRoomParticipant, UserProfile } from "@blumi/contracts"
import type { ChatParticipantProfile } from "../chat/chatParticipantProfile"

type AccountProfile = { userId: string; profile: UserProfile; updatedAt?: string }
export function profileFromAccount(account: AccountProfile): ChatParticipantProfile {
  return { ...account.profile, ...(account.updatedAt ? { profileUpdatedAt: account.updatedAt } : {}) }
}

/** Context already checked moderation and access; preserve the room's member order. */
export function resolvePairProfiles(pairUserIds: readonly [string, string],
  caller: AccountProfile, partner: AccountProfile): [ChatParticipantProfile, ChatParticipantProfile] | null {
  if (pairUserIds[0] === pairUserIds[1]) return null
  const profiles = new Map([caller, partner].map((account) => [account.userId, profileFromAccount(account)]))
  const sender = profiles.get(pairUserIds[0])
  const recipient = profiles.get(pairUserIds[1])
  return sender && recipient ? [sender, recipient] : null
}

export function createChatParticipants(sender: ChatParticipantProfile, recipient: ChatParticipantProfile): [MiniRoomParticipant, MiniRoomParticipant] {
  return [sender, recipient].map((profile) => ({ userId: profile.userId, displayName: profile.displayName,
    avatar: { ...profile.avatar }, ...(profile.profileUpdatedAt ? { profileUpdatedAt: profile.profileUpdatedAt } : {})
  })) as [MiniRoomParticipant, MiniRoomParticipant]
}
