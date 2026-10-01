import type { ChatThread, ChatThreadList } from "@blumi/contracts"
import { useEffect, useEffectEvent, useMemo } from "react"
import { AppState } from "react-native"
import { MOBILE_HTTP_BASE_URL, MOBILE_WS_BASE_URL } from "../config/env"
import { createChatDeliveryAckBatcher } from "../features/chat/chatDeliveryAckBatcher"
import { chatTypingStore } from "../features/chat/typing/chatTypingStore"
import { normalizeRoomInviteRecord } from "../features/chat/chatRoomInviteApi"
import {
  applyChatMessageListed,
  applyChatMessageReceived,
  applyChatParticipantUpdated,
  applyChatReceiptUpdated,
  applyChatThreadListed,
  applyChatThreadRead,
  getThreads,
  hasMessageHistory,
  noteRealtimeThreadListRequested
} from "../features/chat/chatStore"
import { getInboxCopy } from "../features/chat/inboxCopy"
import type { ConnectionMatchedPayload } from "../features/connections/globalMatchReconciliation"
import { isDemoMode, setDemoMode } from "../features/demo/demoStore"
import { createGlobalRealtimeEventHandler } from "../features/realtime/globalRealtimeEventHandler"
import { shouldShowIncomingMessageAlert } from "../features/notifications/foregroundNotificationState"
import {
  createGlobalRealtimeLifecycle,
  getGlobalRealtimeLifecycleIdentity
} from "../features/realtime/globalRealtimeLifecycle"
import {
  connectGlobal,
  disconnectGlobal,
  sendGlobal,
  setGlobalRealtimeAppState,
  subscribeToEvents,
  subscribeToStatus,
  useGlobalRealtimeEvents
} from "../features/realtime/globalRealtimeProvider"
import { isRealtimeAuthInvalidClose } from "@blumi/realtime-client"
import { hydrateBlockedUsersFromServer } from "../features/safety/blockStore"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import type { SessionActor } from "../features/session/sessionModel"
import { showToast } from "../ui/toast"
import { navigationRef } from "./rootNavigationRef"
import type { RootStackParamList } from "./RootNavigator"
import type { useMatchModal } from "./useMatchModal"
import type { useRootChatSync } from "./useRootChatSync"
import type { useRoomInviteRouting } from "./useRoomInviteRouting"

type RootChatSync = ReturnType<typeof useRootChatSync>

/** The conversation on screen (a chat thread, or the thread behind a MiniRoom). */
function readActiveConversationThreadId(): string | undefined {
  const route = navigationRef.getCurrentRoute()
  return route?.name === "ChatThread"
    ? (route.params as RootStackParamList["ChatThread"] | undefined)?.threadId
    : route?.name === "MiniRoom"
      ? (route.params as RootStackParamList["MiniRoom"] | undefined)?.readyMiniRoom.miniRoom.sourceThreadId
      : undefined
}

interface GlobalRealtimeSessionInput {
  sessionActor: SessionActor | null
  sessionEntryRoute: string
  isAccountRestricted: boolean
  isCurrentSession: (expectedActor: SessionActor) => boolean
  /** Clears every session-scoped root store; must be referentially stable. */
  resetInactiveSessionState: () => void
  clearSessionActor: () => Promise<void>
  refreshAccountModeration: () => Promise<void>
  refreshProductionThreads: () => Promise<void>
  resynchronizeMessages: RootChatSync["resynchronizeMessages"]
  upsertRoomInvite: RootChatSync["upsertRoomInvite"]
  applyRealtimeThreadList: (list: ChatThreadList) => void
  applyNewThread: (thread: ChatThread) => void
  openReadyMiniRoom: ReturnType<typeof useRoomInviteRouting>["openReadyMiniRoom"]
  getMatchDeduplicationState: ReturnType<typeof useMatchModal>["getMatchDeduplicationState"]
  onConnectionMatched: (payload: ConnectionMatchedPayload) => void
  /** Server confirmation of a block by this user; drops the partner's chat. */
  onPartnerBlocked: (blockedUserId: string) => void
  /** `chat_read_receipts` resolved for this session: acknowledge deliveries. */
  receiptsEnabled: boolean
  /** `chat_typing` resolved for this session: send typing signals. */
  typingEnabled: boolean
}

/**
 * Owns the authenticated session's single global realtime socket and the
 * routing of its events into chat, room invitations, MiniRoom, and matches.
 *
 * The lifecycle restarts only when the session identity, main-route access,
 * restriction, or the stable refresh/reset callbacks change. The actor is
 * sampled when the lifecycle starts; session callbacks that may change identity
 * without warranting a reconnect are effect events, so they run their latest
 * committed version.
 */
export function useGlobalRealtimeSession({
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  isCurrentSession,
  resetInactiveSessionState,
  clearSessionActor,
  refreshAccountModeration,
  refreshProductionThreads,
  resynchronizeMessages,
  upsertRoomInvite,
  applyRealtimeThreadList,
  applyNewThread,
  openReadyMiniRoom,
  getMatchDeduplicationState,
  onConnectionMatched,
  onPartnerBlocked,
  receiptsEnabled,
  typingEnabled
}: GlobalRealtimeSessionInput): void {
  const realtimeSessionIdentity = getGlobalRealtimeLifecycleIdentity(sessionActor)
  // A new actor object with the same identity (for example a profile edit)
  // must not reconnect, so the lifecycle reads the actor when it starts.
  const readLifecycleSessionActor = useEffectEvent(() => sessionActor)
  const isLatestSession = useEffectEvent((expectedActor: SessionActor) => isCurrentSession(expectedActor))
  const clearLatestSessionActor = useEffectEvent(() => clearSessionActor())
  const refreshLatestAccountModeration = useEffectEvent(() => refreshAccountModeration())
  const resynchronizeLatestMessages = useEffectEvent((threadId: string) => resynchronizeMessages(threadId))

  // The socket closes in the background and reconnects at once on foreground.
  useEffect(() => {
    setGlobalRealtimeAppState(AppState.currentState)
    const subscription = AppState.addEventListener("change", setGlobalRealtimeAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => createGlobalRealtimeLifecycle({
    sessionActor: readLifecycleSessionActor(),
    isMainRoute: sessionEntryRoute === "Main",
    isAccountRestricted,
    isCurrentSession: (expectedActor) => isLatestSession(expectedActor),
    isDemoMode,
    setDemoMode,
    resetInactiveSessionState,
    refreshProductionThreads,
    resynchronizeActiveConversation: () => {
      const route = navigationRef.getCurrentRoute()
      const threadId = route?.name === "ChatThread"
        ? (route.params as RootStackParamList["ChatThread"] | undefined)?.threadId
        : route?.name === "MiniRoom"
          ? (route.params as RootStackParamList["MiniRoom"] | undefined)?.readyMiniRoom.miniRoom.sourceThreadId
          : undefined
      return threadId ? resynchronizeLatestMessages(threadId) : Promise.resolve()
    },
    hydrateBlockedUsersFromServer,
    // CHAT-RT-09: other cached conversations that changed while offline.
    getActiveConversationThreadId: readActiveConversationThreadId,
    hasMessageHistory,
    resynchronizeThread: (threadId) => resynchronizeLatestMessages(threadId),
    subscribeToEvents,
    connectGlobal,
    disconnectGlobal,
    sendGlobal,
    noteThreadListRequested: noteRealtimeThreadListRequested,
    subscribeToStatus,
    applyChatThreadListed,
    getThreads,
    isRealtimeAuthInvalidClose,
    clearSessionActor: () => clearLatestSessionActor(),
    refreshAccountModeration: () => refreshLatestAccountModeration(),
    showWarningToast: (toast) => {
      showToast({ ...toast, type: "warning" })
    },
    wsBaseUrl: MOBILE_WS_BASE_URL,
    httpBaseUrl: MOBILE_HTTP_BASE_URL
  })(), [
    isAccountRestricted,
    refreshProductionThreads,
    resetInactiveSessionState,
    realtimeSessionIdentity,
    sessionEntryRoute
  ])

  // ── Delivery acks (2026-10-01) ──────────────────────────
  // One batcher per signed-in account and rollout state: an account switch
  // or a capability change disposes the old one with its pending window.
  // Only a foreground app acknowledges.
  const accountUserId = sessionActor?.profile.userId
  const deliveryAcks = useMemo(() => createChatDeliveryAckBatcher({
    // Signed out there is nothing to acknowledge for.
    send: (ack) => accountUserId !== undefined && sendGlobal({ type: "chat.ack_delivered", payload: ack }),
    isActive: () => receiptsEnabled && AppState.currentState === "active"
  }), [accountUserId, receiptsEnabled])
  useEffect(() => () => deliveryAcks.dispose(), [deliveryAcks])
  // A reconnect sends acks the dropped socket refused or may have lost.
  useEffect(() => subscribeToStatus((status) => {
    deliveryAcks.noteConnection(status === "connected")
  }), [deliveryAcks])

  // ── Typing (2026-10-01) ─────────────────────────────────
  // Memory only, per account and rollout: a switch or sign-out resets it.
  useEffect(() => chatTypingStore.configure({
    ownerUserId: accountUserId,
    enabled: typingEnabled,
    send: (command) => sendGlobal({ type: "chat.typing", payload: command })
  }), [accountUserId, typingEnabled])

  // ── Chat + match event routing ──────────────────────────
  const handleGlobalEvent = useMemo(
    () => createGlobalRealtimeEventHandler({
      currentUserId: sessionActor?.profile.userId,
      getMatchDeduplicationState,
      normalizeRoomInviteRecord,
      upsertRoomInvite,
      applyChatThreadListed: applyRealtimeThreadList,
      applyChatThreadRead,
      applyChatParticipantUpdated,
      requestThreadPage: (cursor) => sendGlobal({ type: "chat.list_threads", payload: { cursor } }),
      requestThreadRefresh: () => { void refreshProductionThreads().catch(() => { /* Refresh already published its visible error state. */ }) },
      applyChatThreadCreated: applyNewThread,
      applyChatMessageListed,
      applyChatMessageReceived,
      acknowledgeDelivery: (message) => deliveryAcks.note(message),
      applyChatReceiptUpdated,
      applyChatTypingUpdated: chatTypingStore.applyUpdate,
      clearChatTypingForMessage: chatTypingStore.noteMessage,
      getThreads,
      openReadyMiniRoom,
      onConnectionMatched,
      onPartnerBlocked: (blockedUserId) => {
        chatTypingStore.clearUser(blockedUserId)
        onPartnerBlocked(blockedUserId)
      },
      showIncomingMessageToast: (toast) => {
        showToast({ ...toast, type: "info" })
      },
      shouldShowIncomingMessageAlert,
      openConversation: (threadId) => {
        if (navigationRef.isReady()) navigationRef.navigate("ChatThread", { threadId })
      },
      unknownSenderName: getInboxCopy(resolveAccountRecoveryLocale(
        getNativeAppLocale(),
        Intl.DateTimeFormat().resolvedOptions().locale
      )).unknownPartner
    }),
    [
      onConnectionMatched,
      onPartnerBlocked,
      deliveryAcks,
      getMatchDeduplicationState,
      applyNewThread,
      applyRealtimeThreadList,
      refreshProductionThreads,
      openReadyMiniRoom,
      sessionActor?.profile.userId,
      upsertRoomInvite
    ]
  )

  useGlobalRealtimeEvents(handleGlobalEvent)
}
