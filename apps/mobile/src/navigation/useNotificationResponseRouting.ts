import { useCallback, useEffect, useRef, useState } from "react"
import { getThreadListVersion, hasChatThread, subscribeToChatStore } from "../features/chat/chatStore"
import { resolveNotificationDestination } from "../features/notifications/notificationRouting"
import { createChatTapGate, type ChatTapDecision } from "../features/notifications/notificationTapRouting"
import { usePushRegistration } from "../features/notifications/usePushRegistration"
import { useAppIconBadge, useSignedOutNotificationTapDiscard } from "../features/notifications/useNotificationSessionSurfaces"
import type { SessionActor } from "../features/session/sessionModel"
import { navigationRef } from "./rootNavigationRef"

interface NotificationResponseRoutingInput {
  sessionActor: SessionActor | null
  sessionEntryRoute: string
  isAccountRestricted: boolean
  isCurrentSession: (expectedActor: SessionActor) => boolean
  /** Bumps on every navigation readiness so deferred taps are replayed. */
  navigationReadyGeneration: number
}

/**
 * Owns push registration for the main app, routing of notification taps and
 * the app icon badge. A tap is accepted only for the production session that
 * received it, on the unrestricted main navigator, once navigation is ready;
 * otherwise it stays pending in usePushRegistration and is replayed on the
 * next readiness. A conversation tap waits briefly for the thread list so a
 * removed or hidden conversation opens the Inbox instead of a dead end.
 *
 * Nothing here subscribes to the chat store while no tap is waiting, and the
 * unread badge lives in its own leaf (AppIconBadgeSync), so message and thread
 * list traffic never re-renders the root navigator (and the open chat or room
 * screen under it).
 */
export function useNotificationResponseRouting({
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  isCurrentSession,
  navigationReadyGeneration
}: NotificationResponseRoutingInput) {
  const isMainSession = sessionEntryRoute === "Main" && !isAccountRestricted
  const [tapRetryTick, setTapRetryTick] = useState(0)
  const chatTapGateRef = useRef<ReturnType<typeof createChatTapGate> | null>(null)
  chatTapGateRef.current ??= createChatTapGate({ hasThread: hasChatThread, now: Date.now })
  const tapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The thread list version a waiting tap saw, or null while no tap waits.
  const waitingListVersionRef = useRef<number | null>(null)
  const sessionUserId = sessionActor?.profile.userId
  useEffect(() => {
    chatTapGateRef.current?.reset()
    return () => clearTimeout(tapRetryTimerRef.current)
  }, [sessionUserId])
  useEffect(() => subscribeToChatStore(() => {
    const waitingVersion = waitingListVersionRef.current
    if (waitingVersion === null || getThreadListVersion() === waitingVersion) return
    // A new thread list arrived for a waiting tap: replay pending taps.
    waitingListVersionRef.current = null
    setTapRetryTick((tick) => tick + 1)
  }), [])
  const decideChatTap = useCallback((threadId: string): ChatTapDecision => {
    const listVersion = getThreadListVersion()
    const decision = chatTapGateRef.current!.decide(threadId, listVersion)
    waitingListVersionRef.current = decision.kind === "wait" ? listVersion : null
    if (decision.kind === "wait") {
      clearTimeout(tapRetryTimerRef.current)
      tapRetryTimerRef.current = setTimeout(() => setTapRetryTick((tick) => tick + 1), decision.retryInMs)
    }
    return decision
  }, [])

  const handleNotificationResponseData = useCallback((data: unknown, expectedActor: SessionActor, action?: "enter_room"): boolean => {
    if (
      expectedActor.session.mode !== "production" ||
      sessionEntryRoute !== "Main" ||
      isAccountRestricted ||
      !isCurrentSession(expectedActor) ||
      !navigationRef.isReady()
    ) return false
    const destination = resolveNotificationDestination(data, action)
    if (!destination) return false
    if (destination.route === "ChatThread") {
      const decision = decideChatTap(destination.params.threadId)
      if (decision.kind === "wait") return false
      if (decision.kind === "inbox") navigationRef.navigate("Inbox")
      else navigationRef.navigate("ChatThread", destination.params)
      return true
    }
    navigationRef.navigate(destination.route)
    return true
  }, [decideChatTap, isAccountRestricted, isCurrentSession, sessionEntryRoute])

  useSignedOutNotificationTapDiscard(sessionEntryRoute === "AuthEntry")

  return usePushRegistration(
    isMainSession ? sessionActor : null,
    handleNotificationResponseData,
    // The wait bound for an unknown conversation replays pending taps too.
    navigationReadyGeneration + tapRetryTick
  )
}

/** The app icon badge follows the unread total for the unrestricted production main session only. */
export function isAppIconBadgeEnabled(
  sessionActor: SessionActor | null,
  sessionEntryRoute: string,
  isAccountRestricted: boolean
): boolean {
  return sessionEntryRoute === "Main" && !isAccountRestricted && sessionActor?.session.mode === "production"
}

/**
 * Leaf component: useAppIconBadge subscribes to the unread count and thread
 * list, and that churn must re-render only this null-rendering leaf.
 */
export function AppIconBadgeSync({ enabled }: { enabled: boolean }): null {
  useAppIconBadge(enabled)
  return null
}
