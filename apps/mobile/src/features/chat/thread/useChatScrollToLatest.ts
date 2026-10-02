import { useCallback, useEffect, useRef, useState } from "react"
import type { FlatList } from "react-native"
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useReducedMotion } from "../../../ui/animations"
import { useGluedKeyboardHeight } from "../../../ui/keyboard"
import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"
import {
  countNewIncomingAtNewestEdge,
  getChatLatestScrollOffset,
  getChatNewestEdgeInset,
  isChatScrolledAwayFromLatest
} from "./chatScrollToLatestModel"

/**
 * The "↓" pill of the conversation (CHT-05). The scroll offset lives on the
 * UI thread; JS hears only when the reader crosses the threshold, never per
 * scroll frame. While away, new partner messages are counted; returning to
 * the newest message clears the count. While the keyboard is open the newest
 * edge is lifted above it (`bottomOffset`: see getChatNewestEdgeInset).
 */
export function useChatScrollToLatest({
  newestFirstTimeline,
  currentUserId,
  bottomOffset
}: {
  newestFirstTimeline: readonly ChatTimelineItem[]
  currentUserId: string
  bottomOffset: number
}) {
  const reduceMotion = useReducedMotion()
  const listRef = useRef<FlatList<ChatTimelineItem>>(null)
  const offset = useSharedValue(0)
  const keyboardHeight = useGluedKeyboardHeight()
  const [isAway, setIsAway] = useState(false)
  const [unseenCount, setUnseenCount] = useState(0)
  const newestKeyRef = useRef<string | null>(null)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y
    }
  })

  useAnimatedReaction(
    () => isChatScrolledAwayFromLatest(offset.value, getChatNewestEdgeInset(keyboardHeight.value, bottomOffset)),
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
    const inset = getChatNewestEdgeInset(keyboardHeight.get(), bottomOffset)
    listRef.current?.scrollToOffset({ offset: getChatLatestScrollOffset(inset), animated: !reduceMotion })
  }, [bottomOffset, keyboardHeight, reduceMotion])

  return { listRef, scrollHandler, isAway, unseenCount, scrollToLatest }
}
