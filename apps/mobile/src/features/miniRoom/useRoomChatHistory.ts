import { useLayoutEffect, useMemo, useRef } from "react"
import { useChatThreadStore } from "../chat/chatStore"
import { getMessageRenderKey } from "../chat/chatMessageRenderKeys"
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
  const { messages: threadMessages, messageListState, getMessageDeliveryState, deliveryKey } = useChatThreadStore(threadId)
  const messageListStatus = messageListState.status
  const previous = useRef<{ threadId: string | undefined; localUserId: string; items: RoomChatHistoryItem[] } | null>(null)

  const history = useMemo(() => {
    // Delivery lives behind a stable store reader: its version, rather than
    // that function's identity, invalidates this presentation snapshot.
    void deliveryKey
    const messages = threadId ? threadMessages : []
    const listStatus = threadId ? messageListStatus : "idle"
    const items = selectRoomChatHistory({
      messages,
      localUserId,
      deliveryOf: getMessageDeliveryState,
      renderKeyOf: getMessageRenderKey,
      previousItems: previous.current && previous.current.threadId === threadId && previous.current.localUserId === localUserId
        ? previous.current.items
        : undefined
    })
    return {
      items,
      status: resolveRoomChatHistoryStatus({ hasThread: Boolean(threadId), listStatus, itemCount: items.length })
    }
  }, [deliveryKey, getMessageDeliveryState, messageListStatus, threadMessages, localUserId, threadId])
  useLayoutEffect(() => {
    previous.current = { threadId, localUserId, items: history.items }
  }, [history.items, localUserId, threadId])
  return history
}
