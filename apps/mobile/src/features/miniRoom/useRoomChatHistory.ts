import { useMemo } from "react"
import { useChatStore } from "../chat/chatStore"
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
  const chatStore = useChatStore()

  return useMemo(() => {
    const messages = threadId ? chatStore.getMessages(threadId) : []
    const listStatus = threadId ? chatStore.getMessageListState(threadId).status : "idle"
    const items = selectRoomChatHistory({
      messages,
      localUserId,
      deliveryOf: (messageId) => chatStore.getMessageDeliveryState(messageId)
    })
    return {
      items,
      status: resolveRoomChatHistoryStatus({ hasThread: Boolean(threadId), listStatus, itemCount: items.length })
    }
  }, [chatStore, localUserId, threadId])
}
