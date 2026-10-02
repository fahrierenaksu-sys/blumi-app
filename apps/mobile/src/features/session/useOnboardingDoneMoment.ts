import { useCallback, useEffect, useRef, useState } from "react"
import type { SessionActor } from "./sessionModel"
import { shouldCelebrateOnboardingDone } from "./onboardingDoneMomentModel"

/** Accounts that already had their moment in this app run. */
const celebratedUserIds = new Set<string>()

/**
 * Watches the session entry route and opens the "you did it" moment once,
 * when a freshly set-up account enters the app (onboardingDoneMoment).
 */
export function useOnboardingDoneMoment(
  sessionEntryRoute: string,
  sessionActor: SessionActor | null
): { celebratingName: string | null; finish: () => void } {
  const previousRouteRef = useRef<string | undefined>(undefined)
  const [celebratingName, setCelebratingName] = useState<string | null>(null)
  const userId = sessionActor?.profile.userId
  const displayName = sessionActor?.profile.displayName ?? ""
  const mode = sessionActor?.session.mode
  const completedAt = sessionActor?.session.onboarding.completedAt

  useEffect(() => {
    const previousRoute = previousRouteRef.current
    previousRouteRef.current = sessionEntryRoute
    if (previousRoute === sessionEntryRoute || !userId) return
    if (!shouldCelebrateOnboardingDone({
      previousRoute,
      nextRoute: sessionEntryRoute,
      mode,
      completedAt,
      now: Date.now(),
      alreadyCelebrated: celebratedUserIds.has(userId)
    })) return
    celebratedUserIds.add(userId)
    setCelebratingName(displayName)
  }, [completedAt, displayName, mode, sessionEntryRoute, userId])

  // Signing out (or switching account) ends the moment at once.
  useEffect(() => {
    if (!userId) setCelebratingName(null)
  }, [userId])

  const finish = useCallback(() => {
    setCelebratingName(null)
  }, [])

  return { celebratingName, finish }
}
