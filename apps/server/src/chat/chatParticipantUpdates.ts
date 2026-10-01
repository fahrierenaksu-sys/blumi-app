import type { AuthService } from "../auth/authService"
import type { ChatService } from "./chatService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { chatParticipantFromProfile } from "./chatParticipantProfile"

/** Read after persistence; send only to visible conversation partners, across all pages. */
export async function announceChatParticipantUpdate(services: {
  authService: AuthService
  chatService: ChatService
  connectionManager: ConnectionManager
}, userId: string): Promise<void> {
  const account = await services.authService.repository.findAccountByUserId(userId)
  if (!account) return
  const participant = chatParticipantFromProfile(account.profile, account.updatedAt)
  const sent = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await services.chatService.listThreadsPage(userId, { cursor })
    const recipients = [...new Set(page.threads.flatMap((thread) => thread.participantUserIds))]
      .filter((id) => !sent.has(id))
    if (recipients.length) {
      services.connectionManager.sendToUsers(recipients, {
        type: "chat.participant_updated", payload: { participant, updatedAt: account.updatedAt }
      })
      recipients.forEach((id) => sent.add(id))
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor)
}
