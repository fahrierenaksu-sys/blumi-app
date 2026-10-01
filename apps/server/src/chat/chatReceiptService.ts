import type {
  ChatMessage,
  ChatPartnerReceipts,
  ChatPreferences,
  ChatReceiptCursor,
  ChatThread,
  ServerEvent
} from "@blumi/contracts"
import { PublicRequestError } from "../errors/publicRequestError"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { DEFAULT_CHAT_PREFERENCES, type ChatReceiptParticipant } from "./chatRepository"
import type { ChatMarkReadResult, ChatService } from "./chatService"

/** Receipts are not rolled out to this account, or migration 070 is missing. */
export class ChatReceiptsUnavailableError extends PublicRequestError {
  readonly code = "CHAT_RECEIPTS_UNAVAILABLE"

  constructor() {
    super("Read receipts are not available yet.")
    this.name = "ChatReceiptsUnavailableError"
  }
}

export interface ChatReceiptService {
  /** Rolled out to the account (`chat_read_receipts`) and migration 070 applied. */
  isEnabledFor(userId: string): Promise<boolean>
  /** `chat.ack_delivered` from `userId`'s device. Never throws. */
  acknowledgeDelivered(userId: string, threadId: string, upToMessageId: string): Promise<void>
  /** The newest page of history reached `userId` over HTTP: that is delivery too. */
  noteHistoryLoaded(userId: string, threadId: string, messages: readonly ChatMessage[]): Promise<void>
  /** Marks the thread read and tells the partner when both share read receipts. */
  markRead(
    userId: string,
    threadId: string,
    options?: { upToMessageId?: string },
    now?: Date
  ): Promise<ChatMarkReadResult>
  /** Adds the viewer's `partnerReceipts` to threads the viewer may already see. */
  projectThreads(viewerUserId: string, threads: ChatThread[]): Promise<ChatThread[]>
  /** The viewer's partner receipts for one visible thread, if enabled. */
  getPartnerReceipts(viewerUserId: string, threadId: string): Promise<ChatPartnerReceipts | undefined>
  getPreferences(userId: string): Promise<{ preferences: ChatPreferences; available: boolean }>
  savePreferences(userId: string, preferences: ChatPreferences, now?: Date): Promise<ChatPreferences>
}

/**
 * Server-authoritative receipt rules (owner decisions 2026-10-01):
 * - delivery (✓✓) is on for everyone the feature is rolled out to;
 * - read receipts are off by default and mutual: `readUpTo` reaches or is
 *   projected for a person only while both people turned them on;
 * - a pair with a block in either direction gets nothing;
 * - a receipt event only ever goes to the other participant.
 * Rollout is the existing `chat_read_receipts` capability, resolved for each
 * account on the server, and additionally requires migration 070.
 */
export function createChatReceiptService(options: {
  chatService: ChatService
  blockPolicy: { hasBlockBetween(userAId: string, userBId: string): Promise<boolean> }
  isRolledOutFor: (userId: string) => boolean
  emit: (userId: string, event: ServerEvent) => void
  reportError?: (error: unknown) => void
}): ChatReceiptService {
  const { chatService, blockPolicy, isRolledOutFor, emit } = options
  const repository = chatService.repository
  // Only the error kind is logged: never ids, cursors or message text.
  const reportError = options.reportError ?? ((error: unknown) => {
    console.error("Chat receipt update failed", safeOperationalErrorKind(error))
  })

  const isEnabledFor = async (userId: string): Promise<boolean> =>
    isRolledOutFor(userId) && await repository.supportsReceipts()

  const publish = async (
    threadId: string,
    actorUserId: string,
    recipientUserId: string,
    cursors: { deliveredUpTo?: ChatReceiptCursor; readUpTo?: ChatReceiptCursor }
  ): Promise<void> => {
    if (recipientUserId === actorUserId || !isRolledOutFor(recipientUserId)) return
    if (await blockPolicy.hasBlockBetween(actorUserId, recipientUserId)) return
    emit(recipientUserId, {
      type: "chat.receipt_updated",
      payload: {
        threadId,
        userId: actorUserId,
        participantUserIds: [actorUserId, recipientUserId].sort() as [string, string],
        ...cursors
      }
    })
  }

  const acknowledgeDelivered = async (userId: string, threadId: string, upToMessageId: string) => {
    try {
      if (!await isEnabledFor(userId)) return
      const advanced = await repository.advanceDeliveredCursor({ threadId, userId, upToMessageId })
      if (!advanced) return
      await publish(threadId, userId, advanced.partnerUserId, { deliveredUpTo: advanced.deliveredUpTo })
    } catch (error) {
      reportError(error)
    }
  }

  const project = (
    viewerUserId: string,
    rows: readonly ChatReceiptParticipant[],
    threadId: string
  ): ChatPartnerReceipts | undefined => {
    const viewer = rows.find((row) => row.threadId === threadId && row.userId === viewerUserId)
    const partner = rows.find((row) => row.threadId === threadId && row.userId !== viewerUserId)
    if (!viewer || !partner || !isRolledOutFor(partner.userId)) return undefined
    const readVisible = viewer.readReceiptsEnabled && partner.readReceiptsEnabled
    return {
      ...(partner.deliveredUpTo ? { deliveredUpTo: { ...partner.deliveredUpTo } } : {}),
      ...(readVisible && partner.readUpTo ? { readUpTo: { ...partner.readUpTo } } : {})
    }
  }

  return {
    isEnabledFor,
    acknowledgeDelivered,
    async noteHistoryLoaded(userId, threadId, messages) {
      const newestFromPartner = [...messages].reverse().find((message) => message.senderUserId !== userId)
      if (newestFromPartner) await acknowledgeDelivered(userId, threadId, newestFromPartner.messageId)
    },
    async markRead(userId, threadId, readOptions = {}, now = new Date()) {
      const result = await chatService.markThreadRead(userId, threadId, now, readOptions)
      const partnerUserId = result.participantUserIds.find((id) => id !== userId)
      if (!result.readUpTo || !partnerUserId) return result
      try {
        if (!isRolledOutFor(userId) || !isRolledOutFor(partnerUserId)) return result
        const rows = await repository.listReceiptParticipants([threadId])
        const mutual = rows.length === 2 && rows.every((row) => row.readReceiptsEnabled)
        if (mutual) await publish(threadId, userId, partnerUserId, { readUpTo: result.readUpTo })
      } catch (error) {
        // The read is stored; a failed notification only delays the partner's view.
        reportError(error)
      }
      return result
    },
    // Projections never fail a thread or message list: without receipts the
    // list is still correct, so a failed lookup degrades to "no receipts".
    async projectThreads(viewerUserId, threads) {
      try {
        if (threads.length === 0 || !await isEnabledFor(viewerUserId)) return threads
        const rows = await repository.listReceiptParticipants(threads.map((thread) => thread.threadId))
        return threads.map((thread) => {
          const partnerReceipts = project(viewerUserId, rows, thread.threadId)
          return partnerReceipts ? { ...thread, partnerReceipts } : thread
        })
      } catch (error) {
        reportError(error)
        return threads
      }
    },
    async getPartnerReceipts(viewerUserId, threadId) {
      try {
        if (!await isEnabledFor(viewerUserId)) return undefined
        return project(viewerUserId, await repository.listReceiptParticipants([threadId]), threadId)
      } catch (error) {
        reportError(error)
        return undefined
      }
    },
    async getPreferences(userId) {
      if (!await isEnabledFor(userId)) {
        return { preferences: { ...DEFAULT_CHAT_PREFERENCES }, available: false }
      }
      return { preferences: await repository.getChatPreferences(userId), available: true }
    },
    async savePreferences(userId, preferences, now = new Date()) {
      if (!await isEnabledFor(userId)) throw new ChatReceiptsUnavailableError()
      return repository.saveChatPreferences(userId, preferences, now)
    }
  }
}
