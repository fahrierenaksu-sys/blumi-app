import type { AuthService } from "../auth/authService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { chatParticipantFromAccount } from "./chatParticipantIdentity"
import type { ChatService } from "./chatService"

export interface ChatParticipantAnnouncementServices {
  authService: Pick<AuthService, "repository">
  chatService: Pick<ChatService, "listVisibleChatPartnerUserIds">
  connectionManager: Pick<ConnectionManager, "sendToUsers">
}

/**
 * After a saved rename or outfit: tells the people `userId` has a visible
 * chat with (no block in either direction) their current chat identity, so
 * open lists and chats update without a restart. Reads the stored account,
 * so it announces what every later thread read returns. Best effort: a
 * person who is offline or misses it gets the same on their next list.
 */
export async function announceChatParticipantUpdate(
  services: ChatParticipantAnnouncementServices,
  userId: string
): Promise<void> {
  const account = await services.authService.repository.findAccountByUserId(userId)
  if (!account?.profile.displayName) return
  const recipients = await services.chatService.listVisibleChatPartnerUserIds(userId)
  if (recipients.length === 0) return
  services.connectionManager.sendToUsers(recipients, {
    type: "chat.participant_updated",
    payload: { participant: chatParticipantFromAccount(account) }
  })
}
