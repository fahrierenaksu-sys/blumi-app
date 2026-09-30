import type { AvatarSelection, ChatThread, CompleteAvatarSelection } from "@blumi/contracts"
import type { AuthRepository } from "../auth/authRepository"
import { cloneCompleteAvatarSelection } from "../avatar/avatarSelectionPersistence"
import type { ChatService, CreateThreadInput } from "../chat/chatService"
import type { ConnectionRepository } from "../connections/connectionRepository"
import type { MatchRecord } from "../matches/matchRepository"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import { createAuthorizedThreadId } from "./threadAuthorization"

export interface MatchThreadAnnouncementServices {
  chatService: Pick<ChatService, "createThread" | "repository">
  authRepository: Pick<AuthRepository, "findAccountsByUserIds">
  safetyService: Pick<SafetyService, "hasBlockBetween">
  connectionManager: Pick<ConnectionManager, "sendToUsers">
  connectionRepository?: Pick<ConnectionRepository, "findMatchBetween">
}

/**
 * Opens the chat of a new Discover match and announces it to both people with
 * `chat.thread_created`, so the partner learns about the match while online
 * (before, the chat appeared only when one of them opened it or restarted).
 *
 * Idempotent: an existing chat for the pair (this match's or a room-saved
 * connection's) is left alone and nothing is announced. A block in either
 * direction, before or right after creation, keeps the chat unannounced, the
 * same rule `POST /v1/threads/sync-matches` applies. Returns the announced
 * thread, or null.
 */
export async function announceNewMatchThread(
  services: MatchThreadAnnouncementServices,
  match: MatchRecord
): Promise<ChatThread | null> {
  const [firstUserId, secondUserId] = [...match.participantUserIds].sort() as [string, string]
  const threadId = createAuthorizedThreadId({
    source: "match",
    sourceId: match.matchId,
    miniRoomId: `match_${match.matchId}`
  })
  const [existing, connection, blocked] = await Promise.all([
    services.chatService.repository.findThread(threadId),
    services.connectionRepository?.findMatchBetween(firstUserId, secondUserId) ?? Promise.resolve(null),
    services.safetyService.hasBlockBetween(firstUserId, secondUserId)
  ])
  if (existing || blocked) return null
  if (connection && await services.chatService.repository.findThread(
    createAuthorizedThreadId({ source: "connection", sourceId: connection.miniRoomId, miniRoomId: connection.miniRoomId })
  )) return null

  const accounts = new Map((await services.authRepository.findAccountsByUserIds([firstUserId, secondUserId]))
    .map((account) => [account.userId, account]))
  const participants = [firstUserId, secondUserId].map((userId) => {
    const account = accounts.get(userId)
    return account?.profile.displayName
      ? { userId, displayName: account.profile.displayName, avatar: completeAvatarForChat(account.profile.avatar) }
      : null
  })
  // A partner without a name cannot be shown; sync-matches retries later.
  if (!participants[0] || !participants[1]) return null

  const thread = await services.chatService.createThread({
    threadId,
    miniRoomId: `match_${match.matchId}`,
    participantUserIds: [firstUserId, secondUserId],
    participants: participants as CreateThreadInput["participants"]
  })
  if (await services.safetyService.hasBlockBetween(firstUserId, secondUserId)) return null
  services.connectionManager.sendToUsers(thread.participantUserIds, {
    type: "chat.thread_created",
    payload: thread
  })
  return thread
}

function completeAvatarForChat(avatar: AvatarSelection): CompleteAvatarSelection | undefined {
  if (!avatar.loadout || typeof avatar.revision !== "number") return undefined
  try {
    return cloneCompleteAvatarSelection({
      presetId: avatar.presetId,
      revision: avatar.revision,
      loadout: avatar.loadout
    })
  } catch {
    return undefined
  }
}
