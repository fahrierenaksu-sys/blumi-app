import { useCallback, useEffect, useRef, useState } from "react"
import { hasChatThread, useThreadListVersion } from "../features/chat/chatStore"
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
 */
export function useNotificationResponseRouting({
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  isCurrentSession,
  navigationReadyGeneration
}: NotificationResponseRoutingInput) {
  const isMainSession = sessionEntryRoute === "Main" && !isAccountRestricted
  const chatListVersion = useThreadListVersion()
  const [tapRetryTick, setTapRetryTick] = useState(0)
  const chatTapGateRef = useRef<ReturnType<typeof createChatTapGate> | null>(null)
  chatTapGateRef.current ??= createChatTapGate({ hasThread: hasChatThread, now: Date.now })
  const tapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sessionUserId = sessionActor?.profile.userId
  useEffect(() => {
    chatTapGateRef.current?.reset()
    return () => clearTimeout(tapRetryTimerRef.current)
  }, [sessionUserId])
  const decideChatTap = useCallback((threadId: string, listVersion: number): ChatTapDecision => {
    const decision = chatTapGateRef.current!.decide(threadId, listVersion)
    if (decision.kind === "wait") {
      clearTimeout(tapRetryTimerRef.current)
      tapRetryTimerRef.current = setTimeout(() => setTapRetryTick((tick) => tick + 1), decision.retryInMs)
    }
    return decision
  }, [])

  const handleNotificationResponseData = useCallback((data: unknown, expectedActor: SessionActor): boolean => {
    // A new thread list changes this callback, which retries pending taps.
    if (
      expectedActor.session.mode !== "production" ||
      sessionEntryRoute !== "Main" ||
      isAccountRestricted ||
      !isCurrentSession(expectedActor) ||
      !navigationRef.isReady()
    ) return false
    const destination = resolveNotificationDestination(data)
    if (!destination) return false
    if (destination.route === "ChatThread") {
      const decision = decideChatTap(destination.params.threadId, chatListVersion)
      if (decision.kind === "wait") return false
      if (decision.kind === "inbox") navigationRef.navigate("Inbox")
      else navigationRef.navigate("ChatThread", destination.params)
      return true
    }
    navigationRef.navigate(destination.route)
    return true
  }, [chatListVersion, decideChatTap, isAccountRestricted, isCurrentSession, sessionEntryRoute])

  useAppIconBadge(isMainSession && sessionActor?.session.mode === "production")
  useSignedOutNotificationTapDiscard(sessionEntryRoute === "AuthEntry")

  return usePushRegistration(
    isMainSession ? sessionActor : null,
    handleNotificationResponseData,
    // The wait bound for an unknown conversation replays pending taps too.
    navigationReadyGeneration + tapRetryTick
  )
}
