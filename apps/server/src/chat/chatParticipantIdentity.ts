import type { ChatParticipantSummary, UserProfile } from "@blumi/contracts"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"

/**
 * A chat participant's name and outfit are the account's CURRENT ones, read
 * when the chat is read. The name stored on the participant row when the chat
 * was created is only a fallback for an account that is gone or has no name.
 */
export type ChatParticipantAccount = { userId: string; profile: Pick<UserProfile, "displayName" | "avatar"> }

/** Batch account lookup (one query for many user IDs); missing IDs are absent. */
export type ChatParticipantProfileSource = (userIds: readonly string[]) => Promise<readonly ChatParticipantAccount[]>

/** The saved outfit when it is complete and valid; display metadata is optional. */
export function completeParticipantAvatar(
  avatar: UserProfile["avatar"] | undefined
): ChatParticipantSummary["avatar"] {
  if (!avatar?.loadout || typeof avatar.revision !== "number") return undefined
  try {
    return normalizeStoredAvatarSelection({ presetId: avatar.presetId, loadout: avatar.loadout, revision: avatar.revision })
  } catch {
    return undefined
  }
}

/** What partners see of `account` in a chat (thread reads and `chat.participant_updated`). */
export function chatParticipantFromAccount(account: ChatParticipantAccount): ChatParticipantSummary {
  const avatar = completeParticipantAvatar(account.profile.avatar)
  return {
    userId: account.userId,
    ...(account.profile.displayName ? { displayName: account.profile.displayName } : {}),
    ...(avatar ? { avatar } : {})
  }
}

/** The stored participant with the account's current name and outfit laid over it. */
export function withCurrentIdentity(
  stored: ChatParticipantSummary,
  account: ChatParticipantAccount | undefined
): ChatParticipantSummary {
  if (!account) return stored
  const current = chatParticipantFromAccount(account)
  return {
    ...stored,
    ...(current.displayName ? { displayName: current.displayName } : {}),
    ...(current.avatar ? { avatar: current.avatar } : {})
  }
}
