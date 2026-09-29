import { useEffect } from "react"
import type { SessionActor } from "../features/session/sessionModel"
import { pendingDeepLinks } from "./rootLinking"

interface PendingDeepLinkReplayInput {
  sessionActor: SessionActor | null
  sessionEntryRoute: string
  isAccountRestricted: boolean
  /** Bumps on every navigation readiness so a deferred link is replayed. */
  navigationReadyGeneration: number
}

/**
 * Feeds the root session state to the pending deep link and replays it once
 * the unrestricted Main stack of the same session is ready. Returns the replay
 * for the container's state changes, which is when a newly keyed Main
 * navigator first reports its routes.
 */
export function usePendingDeepLinkReplay({
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  navigationReadyGeneration
}: PendingDeepLinkReplayInput): () => boolean {
  const ownerUserId = sessionActor?.profile.userId ?? null
  const ownerSessionId = sessionActor?.session.sessionId ?? null
  // Written during render, like useCurrentSessionGuard: a sign-out or account
  // switch must discard the link before any later callback can replay it, and
  // the container resolves its initial URL before this render's effects run.
  pendingDeepLinks.updateContext({
    sessionEntryRoute,
    isAccountRestricted,
    owner: ownerUserId !== null && ownerSessionId !== null
      ? { userId: ownerUserId, sessionId: ownerSessionId }
      : null
  })

  useEffect(() => {
    pendingDeepLinks.replay()
  }, [isAccountRestricted, navigationReadyGeneration, ownerSessionId, ownerUserId, sessionEntryRoute])

  return pendingDeepLinks.replay
}
