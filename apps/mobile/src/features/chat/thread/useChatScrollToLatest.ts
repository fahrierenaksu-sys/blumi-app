import { useCallback, useEffect, useRef, useState } from "react"
import type { FlatList } from "react-native"
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useReducedMotion } from "../../../ui/animations"
import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"
import {
  countNewIncomingAtNewestEdge,
  isChatScrolledAwayFromLatest
} from "./chatScrollToLatestModel"

/**
 * The "↓" pill of the conversation (CHT-05). The scroll offset lives on the
 * UI thread; JS hears only when the reader crosses the threshold, never per
 * scroll frame. While away, new partner messages are counted; returning to
 * the newest message clears the count.
 */
export function useChatScrollToLatest({
  newestFirstTimeline,
  currentUserId
}: {
  newestFirstTimeline: readonly ChatTimelineItem[]
  currentUserId: string
}) {
  const reduceMotion = useReducedMotion()
  const listRef = useRef<FlatList<ChatTimelineItem>>(null)
  const offset = useSharedValue(0)
  const [isAway, setIsAway] = useState(false)
  const [unseenCount, setUnseenCount] = useState(0)
  const newestKeyRef = useRef<string | null>(null)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y
    }
  })

  useAnimatedReaction(
    () => isChatScrolledAwayFromLatest(offset.value),
    (away, previous) => {
      if (away !== previous) scheduleOnRN(setIsAway, away)
    }
  )

  const newestKey = newestFirstTimeline[0] ? getChatTimelineItemKey(newestFirstTimeline[0]) : null
  useEffect(() => {
    const previousNewestKey = newestKeyRef.current
    newestKeyRef.current = newestKey
    if (!isAway || newestKey === previousNewestKey) return
    const added = countNewIncomingAtNewestEdge({ previousNewestKey, newestFirst: newestFirstTimeline, currentUserId })
    if (added > 0) setUnseenCount((count) => count + added)
  }, [currentUserId, isAway, newestFirstTimeline, newestKey])

  useEffect(() => {
    if (!isAway) setUnseenCount(0)
  }, [isAway])

  const scrollToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })
  }, [reduceMotion])

  return { listRef, scrollHandler, isAway, unseenCount, scrollToLatest }
}
