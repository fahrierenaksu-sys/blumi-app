import { useCallback, useRef, type RefObject } from "react"
import { isSameAuthenticatedSession } from "../features/connections/globalMatchReconciliation"
import type { SessionActor } from "../features/session/sessionModel"

export interface CurrentSessionGuard {
  /** The session actor of the most recent root render. */
  latestSessionActorRef: RefObject<SessionActor | null>
  /** True while `expectedActor` is still the authenticated root session. */
  isCurrentSession: (expectedActor: SessionActor) => boolean
}

/**
 * Cross-account guard for asynchronous root work (thread refreshes, match
 * reconciliation, notification taps, realtime callbacks).
 *
 * The ref is deliberately written during render rather than after commit:
 * the guard must fail closed as soon as a different session renders, so a
 * late response from the previous account cannot land in the window between
 * render and commit. It is only read from callbacks, never during render.
 */
export function useCurrentSessionGuard(sessionActor: SessionActor | null): CurrentSessionGuard {
  const latestSessionActorRef = useRef<SessionActor | null>(sessionActor)
  latestSessionActorRef.current = sessionActor
  const isCurrentSession = useCallback(
    (expectedActor: SessionActor): boolean =>
      isSameAuthenticatedSession(expectedActor, latestSessionActorRef.current),
    []
  )
  return { latestSessionActorRef, isCurrentSession }
}
