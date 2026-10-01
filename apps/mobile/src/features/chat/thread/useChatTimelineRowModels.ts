import type { ChatPartnerReceipts } from "@blumi/contracts"
import { useEffect, useRef } from "react"
import type { ChatLocale, ChatTimelineItem } from "../chatRoomInviteModel"
import {
  buildChatTimelineRowModels,
  type ChatTimelineRowModels,
  type LocalChatMessageDeliveryState
} from "./chatThreadModel"

/**
 * Row presentation for the whole timeline in one pass per screen render.
 *
 * Delivery states are read through the store's stable module getter, so no
 * dependency list can tell when only a delivery state changed. Instead the
 * last committed result seeds each build: unchanged rows keep their model
 * object, and an unchanged timeline returns the same map, so memoised rows and
 * the list's renderItem keep their identity.
 */
export function useChatTimelineRowModels({
  timeline,
  currentUserId,
  locale,
  getMessageDeliveryState,
  partnerReceipts
}: {
  timeline: readonly ChatTimelineItem[]
  currentUserId: string
  locale: ChatLocale
  getMessageDeliveryState: (messageId: string) => LocalChatMessageDeliveryState
  /** The partner's cursors; undefined while receipts are off. */
  partnerReceipts?: ChatPartnerReceipts
}): ChatTimelineRowModels {
  const committedRef = useRef<ChatTimelineRowModels | null>(null)
  const rowModels = buildChatTimelineRowModels(
    timeline,
    { currentUserId, locale, getMessageDeliveryState, partnerReceipts },
    committedRef.current
  )
  useEffect(() => {
    committedRef.current = rowModels
  }, [rowModels])
  return rowModels
}
