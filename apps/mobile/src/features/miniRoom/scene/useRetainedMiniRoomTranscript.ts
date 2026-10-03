import { useLayoutEffect, useRef } from "react"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"

/**
 * Keep the mounted, hidden list at its last visible snapshot. The durable
 * store and recent strip still advance. A close reads the live snapshot in
 * that render, before the UI-thread crossfade reveals it; no extra timer or
 * list remount can reset its scroll or entrance bookkeeping.
 */
export function useRetainedMiniRoomTranscript(
  hidden: boolean,
  items: readonly RoomChatHistoryItem[],
  status: RoomChatHistoryStatus
) {
  const retained = useRef({ items, status })
  useLayoutEffect(() => {
    if (!hidden) retained.current = { items, status }
  }, [hidden, items, status])
  return hidden ? retained.current : { items, status }
}
