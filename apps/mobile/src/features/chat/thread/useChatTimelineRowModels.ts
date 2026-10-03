import type { ChatPartnerReceipts } from "@blumi/contracts"
import { useEffect, useMemo, useRef } from "react"
import type { ChatLocale, ChatTimelineItem } from "../chatRoomInviteModel"
import {
  buildChatTimelineRowModels,
  type ChatTimelineRowModels,
  type LocalChatMessageDeliveryState
} from "./chatThreadModel"

/**
 * Row presentation rebuilds only when a timeline presentation input changes.
 *
 * Delivery states are read through the store's stable module getter. The
 * delivery snapshot key invalidates that getter when a failure, retry or
 * acknowledgement changes its result. The last committed result seeds each
 * build, so unchanged rows keep their model objects.
 */
export function useChatTimelineRowModels({
  timeline,
  currentUserId,
  locale,
  getMessageDeliveryState,
  deliveryKey,
  partnerReceipts
}: {
  timeline: readonly ChatTimelineItem[]
  currentUserId: string
  locale: ChatLocale
  getMessageDeliveryState: (messageId: string) => LocalChatMessageDeliveryState
  /** The store snapshot's delivery key, including delivery-only updates. */
  deliveryKey: string
  /** The partner's cursors; undefined while receipts are off. */
  partnerReceipts?: ChatPartnerReceipts
}): ChatTimelineRowModels {
  const committedRef = useRef<ChatTimelineRowModels | null>(null)
  // The getter itself is stable across mutations; carry its snapshot key in
  // the dependency identity instead of missing delivery-only changes.
  const deliverySnapshot = useMemo(
    () => ({ key: deliveryKey, read: getMessageDeliveryState }),
    [deliveryKey, getMessageDeliveryState]
  )
  const clock = new Date()
  // Zones a calendar day apart can share the same midnight epoch. Their
  // local date labels still differ, so the calendar identity must change.
  const calendarKey = `${clock.toDateString()}:${clock.getTimezoneOffset()}`
  const dayStart = clock.setHours(0, 0, 0, 0)
  const calendarSnapshot = useMemo(
    () => ({ key: calendarKey, now: new Date(dayStart) }),
    [calendarKey, dayStart]
  )
  const rowModels = useMemo(
    () => buildChatTimelineRowModels(
      timeline,
      { currentUserId, locale, getMessageDeliveryState: deliverySnapshot.read, partnerReceipts, now: calendarSnapshot.now },
      committedRef.current
    ),
    [timeline, currentUserId, locale, deliverySnapshot, partnerReceipts, calendarSnapshot]
  )
  useEffect(() => {
    committedRef.current = rowModels
  }, [rowModels])
  return rowModels
}
