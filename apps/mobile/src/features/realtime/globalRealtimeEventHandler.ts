import type {
  ChatMessage,
  ChatMessageList,
  ChatReceiptUpdated,
  ChatThreadList,
  ChatThreadRead,
  ChatTypingUpdated,
  ServerEvent
} from "@blumi/contracts"
import type { ChatRoomInviteTimelineItem } from "../chat/chatRoomInviteModel"
import {
  shouldHandleConnectionMatchedEvent,
  type ConnectionMatchDeduplicationState
} from "../connections/connectionMatchRuntime"

type ReadyMiniRoomPayload = Extract<ServerEvent, { type: "mini_room.ready" }>["payload"]
export type ConnectionMatchedPayload = Extract<
  ServerEvent,
  { type: "connection.matched" }
>["payload"]

export interface GlobalRealtimeEventHandlerDependencies {
  currentUserId?: string
  getMatchDeduplicationState: () => ConnectionMatchDeduplicationState
  normalizeRoomInviteRecord: (value: unknown) => ChatRoomInviteTimelineItem
  upsertRoomInvite: (invite: ChatRoomInviteTimelineItem) => void
  applyChatThreadListed: (payload: ChatThreadList) => void
  applyChatThreadRead?: (payload: ChatThreadRead) => void
  requestThreadPage?: (cursor: string) => void
  requestThreadRefresh?: () => void
  /**
   * Whether the thread list holds this thread. A message for one it does not
   * (a conversation this account deleted for itself, brought back by the
   * partner's new message) refreshes the list so the conversation reappears.
   */
  hasThread?: (threadId: string) => boolean
  applyChatThreadCreated: (
    payload: Extract<ServerEvent, { type: "chat.thread_created" }>["payload"]
  ) => void
  applyChatMessageListed: (payload: ChatMessageList) => void
  applyChatMessageReceived: (
    payload: ChatMessage,
    options: { localUserId?: string }
  ) => void
  /** A partner message reached this device: queue a debounced delivery ack. */
  acknowledgeDelivery?: (message: ChatMessage) => void
  /** `chat.receipt_updated`: the partner's delivery/read cursor moved. */
  applyChatReceiptUpdated?: (
    payload: ChatReceiptUpdated,
    options: { localUserId?: string }
  ) => void
  /** `chat.typing_updated`: the partner started or stopped typing (transient). */
  applyChatTypingUpdated?: (payload: ChatTypingUpdated) => void
  /** A message arrived: its sender's typing indicator in that thread ends. */
  clearChatTypingForMessage?: (message: { threadId: string; senderUserId: string }) => void
  openReadyMiniRoom: (payload: ReadyMiniRoomPayload) => void
  onConnectionMatched: (payload: ConnectionMatchedPayload) => void
  /** `safety.user_blocked`: the server confirmed a block by this user. */
  onPartnerBlocked?: (blockedUserId: string) => void
  /**
   * A partner message arrived. There is no in-app message toast (owner
   * decision 2026-10-02); this only records a message already on screen so a
   * late push for it never banners.
   */
  noteIncomingMessage?: (message: { threadId: string; messageId: string }) => void
}

export type GlobalRealtimeEventHandler = (event: ServerEvent) => void

export function createGlobalRealtimeEventHandler(
  dependencies: GlobalRealtimeEventHandlerDependencies
): GlobalRealtimeEventHandler {
  return (event): void => {
    if (event.type === "chat.room_invite_updated") {
      try {
        dependencies.upsertRoomInvite(
          dependencies.normalizeRoomInviteRecord(event.payload)
        )
      } catch {
        return
      }
      return
    }

    if (event.type === "chat.thread_listed") {
      if (dependencies.currentUserId && event.payload.userId !== dependencies.currentUserId) return
      dependencies.applyChatThreadListed(event.payload)
      if (event.payload.nextCursor) dependencies.requestThreadPage?.(event.payload.nextCursor)
      return
    }
    if (event.type === "chat.thread_read") {
      if (event.payload.userId === dependencies.currentUserId) {
        dependencies.applyChatThreadRead?.(event.payload)
        dependencies.requestThreadRefresh?.()
      }
      return
    }

    if (event.type === "safety.user_blocked") {
      dependencies.onPartnerBlocked?.(event.payload.blockedUserId)
      return
    }

    if (event.type === "mini_room.ready") {
      dependencies.openReadyMiniRoom(event.payload)
      return
    }

    if (event.type === "chat.thread_created") {
      dependencies.applyChatThreadCreated(event.payload)
      return
    }

    if (event.type === "chat.message_listed") {
      dependencies.applyChatMessageListed(event.payload)
      return
    }

    if (event.type === "chat.receipt_updated") {
      dependencies.applyChatReceiptUpdated?.(event.payload, {
        localUserId: dependencies.currentUserId
      })
      return
    }

    if (event.type === "chat.typing_updated") {
      dependencies.applyChatTypingUpdated?.(event.payload)
      return
    }

    if (event.type === "chat.message_received") {
      // The client id rides only on the sender's own in-room acknowledgement;
      // useInRoomChat settles that bubble. The store keeps the canonical shape.
      const { clientMessageId: _clientMessageId, ...message } = event.payload
      dependencies.clearChatTypingForMessage?.(message)
      const knownThread = dependencies.hasThread?.(message.threadId) ?? true
      dependencies.applyChatMessageReceived(message, {
        localUserId: dependencies.currentUserId
      })
      if (!knownThread) dependencies.requestThreadRefresh?.()

      const fromPartner = Boolean(dependencies.currentUserId) &&
        event.payload.senderUserId !== dependencies.currentUserId
      // Delivery is acknowledged for every partner message: an open
      // conversation is exactly when it is delivered.
      if (fromPartner) dependencies.acknowledgeDelivery?.(message)

      if (fromPartner) {
        dependencies.noteIncomingMessage?.({
          threadId: event.payload.threadId,
          messageId: event.payload.messageId
        })
      }
      return
    }

    if (
      event.type === "connection.matched" &&
      shouldHandleConnectionMatchedEvent(
        event,
        dependencies.currentUserId,
        dependencies.getMatchDeduplicationState()
      )
    ) {
      dependencies.onConnectionMatched(event.payload)
    }
  }
}
