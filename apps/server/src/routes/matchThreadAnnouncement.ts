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
 * Opens the chat of a new Discover match and announces the match to both
 * people: `chat.thread_created` (only when this call created the chat) and
 * then `connection.matched` keyed `match_<matchId>`, so the partner sees the
 * match moment on any screen with the chat's names and avatars already on the
 * phone. Before, the partner only found a new chat.
 *
 * Called once per match, by the decision that created it. An existing chat
 * for the pair (this match's or a room-saved connection's) is reused. A block
 * in either direction, before or right after creation, keeps everything
 * unannounced, the same rule `POST /v1/threads/sync-matches` applies. Returns
 * the pair's thread when the match was announced, or null.
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
  if (blocked) return null
  const reused = existing ?? (connection
    ? await services.chatService.repository.findThread(
      createAuthorizedThreadId({ source: "connection", sourceId: connection.miniRoomId, miniRoomId: connection.miniRoomId })
    )
    : null)
  const thread = reused ?? await createMatchThread(services, match, threadId, firstUserId, secondUserId)
  if (!thread) return null
  if (await services.safetyService.hasBlockBetween(firstUserId, secondUserId)) return null
  if (!reused) {
    services.connectionManager.sendToUsers(thread.participantUserIds, {
      type: "chat.thread_created",
      payload: thread
    })
  }
  services.connectionManager.sendToUsers([firstUserId, secondUserId], {
    type: "connection.matched",
    payload: {
      miniRoomId: `match_${match.matchId}`,
      participantUserIds: [firstUserId, secondUserId],
      matchedAt: match.matchedAt
    }
  })
  return thread
}

async function createMatchThread(
  services: MatchThreadAnnouncementServices,
  match: MatchRecord,
  threadId: string,
  firstUserId: string,
  secondUserId: string
): Promise<ChatThread | null> {
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

  return services.chatService.createThread({
    threadId,
    miniRoomId: `match_${match.matchId}`,
    participantUserIds: [firstUserId, secondUserId],
    participants: participants as CreateThreadInput["participants"]
  })
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
