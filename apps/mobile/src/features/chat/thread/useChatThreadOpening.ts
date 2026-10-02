import type { ChatMessage } from "@blumi/contracts"
import { useEffect, useMemo, useState } from "react"
import { getMessageRenderKey } from "../chatStore"
import {
  buildChatTimeline,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import {
  CHAT_THREAD_SKELETON_DELAY_MS,
  resolveChatThreadBody,
  resolveChatTimelineReveal,
  selectChatThreadOpeningMessages,
  type ChatThreadBody,
  type ChatThreadListStatus,
  type ChatTimelineReveal
} from "./chatThreadOpeningModel"

export interface ChatThreadOpening {
  /** Chronological rows to draw: cached messages (or the row's last message) and invitations. */
  timeline: ChatTimelineItem[]
  body: ChatThreadBody
  /** The skeleton is on screen: still nothing to show after CHAT_THREAD_SKELETON_DELAY_MS. */
  showsSkeleton: boolean
  /** The skeleton was on screen at some point (what replaces it fades in). */
  skeletonWasShown: boolean
  timelineReveal: ChatTimelineReveal
}

/**
 * What an opening conversation draws, decided in the render that mounts it
 * (chatThreadOpeningModel holds the rules). Anything the store already holds
 * is in the first frame; nothing waits for the push transition, an
 * interaction or a fade. The skeleton is the only delayed piece: it appears
 * only when there is still nothing to show after the delay.
 */
export function useChatThreadOpening(input: {
  threadId: string | undefined
  messages: readonly ChatMessage[]
  lastMessage: ChatMessage | undefined
  historyReady: boolean
  listStatus: ChatThreadListStatus
  roomInvites: readonly ChatRoomInviteTimelineItem[]
  waitsForServerHistory: boolean
  isPendingThread: boolean
}): ChatThreadOpening {
  const { threadId, messages, lastMessage, historyReady, roomInvites } = input
  const openingMessages = useMemo(
    () => selectChatThreadOpeningMessages({ messages, historyReady, threadId, lastMessage }),
    [historyReady, lastMessage, messages, threadId]
  )
  const timeline = useMemo(
    // Acknowledged messages keep their optimistic bubble's key (CHT-04).
    () => buildChatTimeline(openingMessages, roomInvites, getMessageRenderKey),
    [openingMessages, roomInvites]
  )
  const messageCount = useMemo(
    () => timeline.reduce((count, item) => item.kind === "message" ? count + 1 : count, 0),
    [timeline]
  )
  const body = resolveChatThreadBody({
    waitsForServerHistory: input.waitsForServerHistory,
    historyReady,
    timelineLength: timeline.length,
    messageCount,
    isPendingThread: input.isPendingThread,
    listStatus: input.listStatus
  })
  const isLoading = body === "loading"
  const [skeletonDue, setSkeletonDue] = useState(false)
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setSkeletonDue(true), CHAT_THREAD_SKELETON_DELAY_MS)
    return () => {
      clearTimeout(timer)
      setSkeletonDue(false)
    }
  }, [isLoading])
  const showsSkeleton = isLoading && skeletonDue
  const [skeletonWasShown, setSkeletonWasShown] = useState(false)
  if (showsSkeleton && !skeletonWasShown) setSkeletonWasShown(true)
  const everShown = skeletonWasShown || showsSkeleton
  return {
    timeline,
    body,
    showsSkeleton,
    skeletonWasShown: everShown,
    timelineReveal: resolveChatTimelineReveal({ body, skeletonWasShown: everShown })
  }
}
