import { useEffect } from "react"
import { flushAuthenticatedConnectionDecisionOutbox } from "../features/connections/connectionDecisionRuntime"
import { getGlobalStatus, subscribeToStatus } from "../features/realtime/globalRealtimeProvider"
import type { SessionActor } from "../features/session/sessionModel"

type OnDelivered = Parameters<typeof flushAuthenticatedConnectionDecisionOutbox>[0]["onDelivered"]

/**
 * Delivers queued like/pass decisions for a production session: once when the
 * session starts and again on every connection-state change (a reconnect is
 * the moment a queued decision can go through). It listens to the status
 * store directly instead of holding the status in React state, so a
 * reconnect does not re-render the root navigator (SYS-3).
 */
export function useConnectionDecisionOutboxFlush(
  sessionActor: SessionActor | null,
  onDelivered: OnDelivered
): void {
  useEffect(() => {
    if (sessionActor?.session.mode !== "production") return
    const flush = (): void => {
      void flushAuthenticatedConnectionDecisionOutbox({
        actorUserId: sessionActor.profile.userId,
        sessionToken: sessionActor.session.sessionToken,
        onDelivered
      }).catch((error: unknown) => {
        console.warn("Connection decision outbox could not be refreshed.", error)
      })
    }
    flush()
    let lastStatus = getGlobalStatus()
    return subscribeToStatus((status) => {
      if (status === lastStatus) return
      lastStatus = status
      flush()
    })
  }, [onDelivered, sessionActor])
}
