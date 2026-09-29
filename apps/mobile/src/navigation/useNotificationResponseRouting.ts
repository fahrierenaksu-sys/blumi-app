import { useCallback } from "react"
import { resolveNotificationDestination } from "../features/notifications/notificationRouting"
import { usePushRegistration } from "../features/notifications/usePushRegistration"
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
 * Owns push registration for the main app and routing of notification taps.
 * A tap is accepted only for the production session that received it, on the
 * unrestricted main navigator, once navigation is ready; otherwise it stays
 * pending in usePushRegistration and is replayed on the next readiness.
 */
export function useNotificationResponseRouting({
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  isCurrentSession,
  navigationReadyGeneration
}: NotificationResponseRoutingInput) {
  const handleNotificationResponseData = useCallback((data: unknown, expectedActor: SessionActor): boolean => {
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
      navigationRef.navigate("ChatThread", destination.params)
      return true
    }
    navigationRef.navigate(destination.route)
    return true
  }, [isAccountRestricted, isCurrentSession, sessionEntryRoute])

  return usePushRegistration(
    sessionEntryRoute === "Main" && !isAccountRestricted ? sessionActor : null,
    handleNotificationResponseData,
    navigationReadyGeneration
  )
}
