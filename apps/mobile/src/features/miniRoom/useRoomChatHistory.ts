import { useMemo } from "react"
import { useChatThreadStore } from "../chat/chatStore"
import {
  resolveRoomChatHistoryStatus,
  selectRoomChatHistory,
  type RoomChatHistoryItem,
  type RoomChatHistoryStatus
} from "./roomChatHistoryModel"

export interface RoomChatHistory {
  items: RoomChatHistoryItem[]
  status: RoomChatHistoryStatus
}

/**
 * The room's chat history, read from the same durable thread the in-room chat
 * sends to (useInRoomChat loads it on entry and after reconnects). Read-only:
 * it never requests, sends or marks anything.
 */
export function useRoomChatHistory(input: {
  threadId: string | undefined
  localUserId: string
}): RoomChatHistory {
  const { threadId, localUserId } = input
  const chatThread = useChatThreadStore(threadId)

  return useMemo(() => {
    const messages = threadId ? chatThread.messages : []
    const listStatus = threadId ? chatThread.messageListState.status : "idle"
    const items = selectRoomChatHistory({
      messages,
      localUserId,
      deliveryOf: (messageId) => chatThread.getMessageDeliveryState(messageId)
    })
    return {
      items,
      status: resolveRoomChatHistoryStatus({ hasThread: Boolean(threadId), listStatus, itemCount: items.length })
    }
  }, [chatThread.deliveryKey, chatThread.getMessageDeliveryState, chatThread.messageListState.status,
    chatThread.messages, localUserId, threadId])
}
