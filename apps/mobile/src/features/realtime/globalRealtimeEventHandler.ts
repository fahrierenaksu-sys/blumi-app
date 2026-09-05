import type {
  ChatMessage,
  ChatMessageList,
  ChatThread,
  ChatThreadList,
  ChatThreadRead,
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

export interface IncomingMessageToast {
  title: string
  body: string
  durationMs: number
}

export interface GlobalRealtimeEventHandlerDependencies {
  currentUserId?: string
  getMatchDeduplicationState: () => ConnectionMatchDeduplicationState
  normalizeRoomInviteRecord: (value: unknown) => ChatRoomInviteTimelineItem
  upsertRoomInvite: (invite: ChatRoomInviteTimelineItem) => void
  applyChatThreadListed: (payload: ChatThreadList) => void
  applyChatThreadRead?: (payload: ChatThreadRead) => void
  requestThreadPage?: (cursor: string) => void
  requestThreadRefresh?: () => void
  applyChatThreadCreated: (
    payload: Extract<ServerEvent, { type: "chat.thread_created" }>["payload"]
  ) => void
  applyChatMessageListed: (payload: ChatMessageList) => void
  applyChatMessageReceived: (
    payload: ChatMessage,
    options: { localUserId?: string }
  ) => void
  getThreads: () => readonly ChatThread[]
  openReadyMiniRoom: (payload: ReadyMiniRoomPayload) => void
  onConnectionMatched: (payload: ConnectionMatchedPayload) => void
  showIncomingMessageToast: (toast: IncomingMessageToast) => void
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

    if (event.type === "chat.message_received") {
      dependencies.applyChatMessageReceived(event.payload, {
        localUserId: dependencies.currentUserId
      })

      if (
        dependencies.currentUserId &&
        event.payload.senderUserId !== dependencies.currentUserId
      ) {
        const senderThread = dependencies.getThreads().find(
          (thread) => thread.threadId === event.payload.threadId
        )
        const senderName = senderThread?.participants.find(
          (participant) => participant.userId === event.payload.senderUserId
        )?.displayName ?? "Someone"
        dependencies.showIncomingMessageToast({
          title: senderName,
          body: event.payload.body.length > 60
            ? `${event.payload.body.slice(0, 57)}…`
            : event.payload.body,
          durationMs: 2500
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
