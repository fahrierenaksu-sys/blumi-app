import { useCallback, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from "react"
import { captureProductEvent } from "../analytics/productAnalytics"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import {
  fetchChatThreads,
  fetchThreadMessages,
  markThreadRead,
  sendThreadMessage,
  type FetchThreadMessagesOptions
} from "../features/chat/chatApi"
import { createChatCoordinator } from "../features/chat/chatCoordinator"
import {
  cancelThreadRoomInvite,
  createThreadRoomInvite,
  decideThreadRoomInvite,
  fetchThreadRoomInvites,
  joinRoomSession,
  leaveActiveRoom
} from "../features/chat/chatRoomInviteApi"
import type {
  ChatLocale,
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../features/chat/chatRoomInviteModel"
import {
  applyChatMessageListed,
  applyChatMessageListFailed,
  applyChatMessageListLoading,
  applyChatThreadCreated,
  applyChatThreadListed,
  applyChatThreadListFailed,
  applyChatThreadListLoading,
  beginChatThreadListRequest,
  confirmOptimisticMessage,
  getThreads,
  hasMessageHistory,
  markOptimisticMessageFailed,
  markThreadRead as markLocalThreadRead
} from "../features/chat/chatStore"
import { createMatchThreadSyncGate, createThreadListRefreshGuard } from "../features/chat/threadListRefreshGuard"
import { demoSendMessage, getDemoMessages } from "../features/demo/demoStore"
import { sendGlobal } from "../features/realtime/globalRealtimeProvider"
import type { SessionActor } from "../features/session/sessionModel"
import { showToast } from "../ui/toast"
import type { ChatThreadBindings } from "../features/chat/thread/chatThreadBindings"
import type { useRoomInviteRouting } from "./useRoomInviteRouting"

type RoomInviteRouting = ReturnType<typeof useRoomInviteRouting>

interface RootChatSyncInput {
  latestSessionActorRef: RefObject<SessionActor | null>
  isCurrentSession: (expectedActor: SessionActor) => boolean
  sessionMode: SessionActor["session"]["mode"] | undefined
  chatLocale: ChatLocale
  visibleRoomInvites: readonly ChatRoomInviteTimelineItem[]
  setRoomInvites: Dispatch<SetStateAction<ChatRoomInviteTimelineItem[]>>
  openReadyMiniRoom: RoomInviteRouting["openReadyMiniRoom"]
  handleDemoRoomInviteAction: (action: ChatRoomInviteAction) => Promise<void>
}

/**
 * Owns root chat synchronization: authoritative thread-list writes guarded
 * against stale HTTP refreshes, production thread refresh with match-thread
 * recovery, the chat coordinator (messages, read state, room invitations),
 * demo-aware route adapters, and the callbacks handed to ChatThread.
 */
export function useRootChatSync({
  latestSessionActorRef,
  isCurrentSession,
  sessionMode,
  chatLocale,
  visibleRoomInvites,
  setRoomInvites,
  openReadyMiniRoom,
  handleDemoRoomInviteAction
}: RootChatSyncInput) {
  const threadListRefreshGuardRef = useRef<ReturnType<typeof createThreadListRefreshGuard> | null>(null)
  if (!threadListRefreshGuardRef.current) threadListRefreshGuardRef.current = createThreadListRefreshGuard()
  const matchThreadSyncGateRef = useRef<ReturnType<typeof createMatchThreadSyncGate> | null>(null)
  if (!matchThreadSyncGateRef.current) matchThreadSyncGateRef.current = createMatchThreadSyncGate()
  const applyRealtimeThreadList = useCallback((list: Parameters<typeof applyChatThreadListed>[0]): void => {
    threadListRefreshGuardRef.current?.observeAuthoritativeThreadChange()
    applyChatThreadListed(list)
  }, [])
  const applyNewThread = useCallback((thread: Parameters<typeof applyChatThreadCreated>[0]): void => {
    threadListRefreshGuardRef.current?.observeAuthoritativeThreadChange()
    applyChatThreadCreated(thread)
  }, [])

  const refreshProductionThreads = useCallback(async (): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "production") return
    const requestRevision = threadListRefreshGuardRef.current!.beginHttpRefresh()
    const listRequestSequence = beginChatThreadListRequest()
    applyChatThreadListLoading()
    try {
      const threadList = await fetchChatThreads(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken
      )
      if (!isCurrentSession(actor) || !threadListRefreshGuardRef.current?.isCurrentHttpRefresh(requestRevision)) return
      applyChatThreadListed(threadList, { requestSequence: listRequestSequence })
      const syncKey = `${actor.profile.userId}:${actor.session.sessionToken}`
      if (matchThreadSyncGateRef.current?.shouldStart(syncKey, Date.now())) {
        void fetchChatThreads(
          MOBILE_HTTP_BASE_URL,
          actor.session.sessionToken,
          fetch,
          undefined,
          { syncMatches: true }
        ).then((recovered) => {
          if (!isCurrentSession(actor) || recovered.userId !== actor.profile.userId) return
          const knownThreadIds = new Set(getThreads().map((thread) => thread.threadId))
          for (const thread of recovered.threads) {
            if (knownThreadIds.has(thread.threadId) || !thread.participantUserIds.includes(actor.profile.userId)) continue
            applyNewThread(thread)
            knownThreadIds.add(thread.threadId)
          }
        }).catch(() => { /* The readable Inbox remains available; retry on a later visit. */ })
      }
    } catch (error) {
      if (!isCurrentSession(actor) || !threadListRefreshGuardRef.current?.isCurrentHttpRefresh(requestRevision)) return
      const message = error instanceof Error
        ? error.message
        : "We could not refresh your chats yet."
      applyChatThreadListFailed(message)
      throw error
    }
  }, [applyNewThread, isCurrentSession, latestSessionActorRef])

  const chatCoordinator = useMemo(
    () => createChatCoordinator({
      hasMessageHistory,
      getSessionActor: () => latestSessionActorRef.current,
      isCurrentSession,
      setRoomInvites: (update) => {
        setRoomInvites((current) => update(current))
      },
      fetchThreadRoomInvites,
      sendThreadMessage,
      fetchThreadMessages,
      markThreadRead,
      createThreadRoomInvite,
      leaveActiveRoom,
      decideThreadRoomInvite,
      cancelThreadRoomInvite,
      joinRoomSession,
      applyChatMessageListed,
      applyChatMessageListLoading,
      applyChatMessageListFailed,
      confirmOptimisticMessage,
      markOptimisticMessageFailed,
      markLocalThreadRead,
      openReadyMiniRoom,
      captureProductEvent,
      showWarningToast: (toast) => {
        showToast({ ...toast, type: "warning" })
      },
      sendGlobal,
      baseHttpUrl: MOBILE_HTTP_BASE_URL
    }),
    [isCurrentSession, latestSessionActorRef, openReadyMiniRoom, setRoomInvites]
  )
  const {
    handleRoomInviteAction,
    closeMyActiveRoom,
    markChatThreadRead,
    requestMessages,
    resynchronizeMessages,
    sendChatMessage,
    upsertRoomInvite
  } = chatCoordinator

  const sendChatMessageForRoute = useCallback(async (
    threadId: string,
    body: string,
    clientMessageId: string
  ): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "demo") {
      return sendChatMessage(threadId, body, clientMessageId)
    }
    try {
      const message = demoSendMessage(threadId, actor.profile.userId, body, clientMessageId)
      confirmOptimisticMessage(clientMessageId, message, actor.profile.userId)
    } catch (error) {
      markOptimisticMessageFailed(clientMessageId)
      throw error
    }
  }, [latestSessionActorRef, sendChatMessage])

  const requestMessagesForRoute = useCallback(async (
    threadId: string,
    options?: FetchThreadMessagesOptions
  ): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "demo") {
      return requestMessages(threadId, options)
    }
    applyChatMessageListed({
      userId: actor.profile.userId,
      threadId,
      messages: getDemoMessages(threadId)
    })
  }, [latestSessionActorRef, requestMessages])

  const warmThreadMessagesForInbox = useCallback((threadId: string): Promise<void> => {
    if (latestSessionActorRef.current?.session.mode !== "production") return Promise.resolve()
    return requestMessages(threadId, {}, { purpose: "prefetch" }).catch(() => undefined)
  }, [latestSessionActorRef, requestMessages])

  // Handed to the ChatThread screen as a prop; route params carry ids only.
  const chatThreadBindings = useMemo((): ChatThreadBindings => ({
    sendChatMessage: sendChatMessageForRoute,
    requestMessages: requestMessagesForRoute,
    markThreadRead: markChatThreadRead,
    roomInvites: visibleRoomInvites,
    onRoomInviteAction: sessionMode === "demo"
      ? handleDemoRoomInviteAction
      : handleRoomInviteAction,
    onCloseActiveRoom: sessionMode === "production"
      ? closeMyActiveRoom
      : undefined,
    locale: chatLocale
  }), [
    chatLocale,
    closeMyActiveRoom,
    handleDemoRoomInviteAction,
    handleRoomInviteAction,
    markChatThreadRead,
    requestMessagesForRoute,
    sendChatMessageForRoute,
    sessionMode,
    visibleRoomInvites
  ])

  return {
    applyRealtimeThreadList,
    applyNewThread,
    refreshProductionThreads,
    resynchronizeMessages,
    upsertRoomInvite,
    warmThreadMessagesForInbox,
    chatThreadBindings
  }
}
