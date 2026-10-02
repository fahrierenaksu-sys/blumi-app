import { useCallback, useEffect, useRef, useState } from "react"
import type { FlatList } from "react-native"
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useReducedMotion } from "../../../ui/animations"
import { useGluedKeyboard } from "../../../ui/keyboard"
import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"
import {
  getChatLatestScrollOffset,
  getChatNewestEdgeInset,
  isGluedKeyboardSettled,
  resolveChatNewestEdgeChange,
  resolveChatScrolledAway
} from "./chatScrollToLatestModel"

/**
 * The "↓" pill of the conversation (CHT-05). The scroll offset lives on the
 * UI thread; JS hears only when the reader crosses the threshold, never per
 * scroll frame. New rows at the newest edge are followed or counted
 * (resolveChatNewestEdgeChange); returning to the newest message clears the
 * count. While the keyboard is open the newest
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
  const { height: keyboardHeight, progress: keyboardProgress } = useGluedKeyboard()
  const [isAway, setIsAway] = useState(false)
  const [unseenCount, setUnseenCount] = useState(0)
  const newestKeyRef = useRef<string | null>(null)
  const away = useSharedValue(false)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y
    }
  })

  // Each change re-renders the screen, so it holds while the keyboard moves
  // and has a return band (resolveChatScrolledAway).
  useAnimatedReaction(
    () => resolveChatScrolledAway({
      wasAway: away.value,
      offsetY: offset.value,
      newestEdgeInset: getChatNewestEdgeInset(keyboardHeight.value, bottomOffset),
      keyboardSettled: isGluedKeyboardSettled(keyboardProgress.value)
    }),
    (next) => {
      if (next === away.value) return
      away.value = next
      scheduleOnRN(setIsAway, next)
    }
  )

  const scrollToLatest = useCallback(() => {
    const inset = getChatNewestEdgeInset(keyboardHeight.get(), bottomOffset)
    listRef.current?.scrollToOffset({ offset: getChatLatestScrollOffset(inset), animated: !reduceMotion })
  }, [bottomOffset, keyboardHeight, reduceMotion])

  // Runs after the commit that mounted the new row, so the scroll command
  // reaches the native list after the row is in it (commands and mounts keep
  // their order on the UI thread) and after the list kept its place.
  const newestKey = newestFirstTimeline[0] ? getChatTimelineItemKey(newestFirstTimeline[0]) : null
  useEffect(() => {
    const previousNewestKey = newestKeyRef.current
    newestKeyRef.current = newestKey
    if (newestKey === previousNewestKey) return
    const change = resolveChatNewestEdgeChange({
      previousNewestKey,
      newestFirst: newestFirstTimeline,
      currentUserId,
      isAway
    })
    if (change.follow) scrollToLatest()
    if (change.unseenIncoming > 0) setUnseenCount((count) => count + change.unseenIncoming)
  }, [currentUserId, isAway, newestFirstTimeline, newestKey, scrollToLatest])

  useEffect(() => {
    if (!isAway) setUnseenCount(0)
  }, [isAway])

  return { listRef, scrollHandler, isAway, unseenCount, scrollToLatest }
}
