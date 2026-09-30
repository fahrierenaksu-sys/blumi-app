import { useCallback, useState } from "react"
import { hydrateBlockedUsersFromServer, useBlockStore } from "../../safety/blockStore"
import type { SessionActor } from "../../session/sessionModel"

// Production Discover requires the server-hydrated safety list before any card
// may show; the deck and counts stay fail-closed until `isSafetyListReady`.
export function useDiscoverySafetyList(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
}) {
  const { sessionActor, isProductionDiscovery } = input
  const {
    blockedUserIds,
    isBlocked: isUserBlocked,
    isReady: isSafetyListReady,
    hydrationStatus: safetyHydrationStatus
  } = useBlockStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const blockedUserKey = blockedUserIds.join("|")
  const [safetyRetrying, setSafetyRetrying] = useState(false)
  const handleRetrySafetyList = useCallback(() => {
    if (safetyRetrying || !isProductionDiscovery) return
    setSafetyRetrying(true)
    void hydrateBlockedUsersFromServer(
      sessionActor.profile.userId,
      sessionActor.session.sessionToken
    ).catch(() => undefined).finally(() => setSafetyRetrying(false))
  }, [isProductionDiscovery, safetyRetrying, sessionActor.profile.userId, sessionActor.session.sessionToken])

  return {
    blockedUserKey,
    isUserBlocked,
    isSafetyListReady,
    safetyHydrationStatus,
    safetyRetrying,
    handleRetrySafetyList
  }
}
