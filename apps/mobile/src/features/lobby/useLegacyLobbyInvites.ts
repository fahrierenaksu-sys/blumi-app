import { useCallback, useEffect, useMemo, useState } from "react"
import {
  loadPendingInvitesForUser,
  recordPendingInviteForUser,
  replacePendingInvitesForUser,
  type PendingInviteMemory
} from "./pendingInvitesStore"
import {
  PENDING_INVITE_TTL_MS,
  filterUnexpiredPendingInvites,
  mergeRestoredPendingInvites,
  resolveNextPendingInviteExpiryDelay,
  upsertPendingInvite
} from "./pendingInviteModel"
import type { UseLobbyFlowResult } from "./useLobbyFlow"

// Legacy (non-production) lobby room invites. Production Discover never sends
// lobby invites (legacy lobby retired, F-08); these stay empty there.
// Outgoing invites are optimistic locally, then cleared by server decisions or TTL.
export function useLegacyLobbyInvites(input: {
  myUserId: string
  lobbyState: UseLobbyFlowResult["lobbyState"]
  nearbyUsers: UseLobbyFlowResult["nearbyUsers"]
}) {
  const { myUserId, lobbyState, nearbyUsers } = input
  const [pendingInvites, setPendingInvites] = useState<PendingInviteMemory[]>([])

  const pendingInviteUserIds = useMemo(
    () => new Set(pendingInvites.map((invite) => invite.userId)),
    [pendingInvites]
  )

  useEffect(() => {
    let active = true
    void (async () => {
      const restored = await loadPendingInvitesForUser({
        actorUserId: myUserId,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
      if (!active) return
      setPendingInvites((current) => mergeRestoredPendingInvites(restored, current))
    })()
    return () => {
      active = false
    }
  }, [myUserId])

  const persistPendingInvites = useCallback(
    (invites: PendingInviteMemory[]): void => {
      void replacePendingInvitesForUser({
        actorUserId: myUserId,
        invites,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
    },
    [myUserId]
  )

  const addPendingInvite = useCallback((invite: PendingInviteMemory): void => {
    setPendingInvites((current) => {
      const next = upsertPendingInvite(current, invite)
      void recordPendingInviteForUser({
        actorUserId: myUserId,
        invite,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
      return next
    })
  }, [myUserId])

  // Removes one person's pending invite and persists only when it changed.
  const dropPendingInviteFor = useCallback((userId: string): void => {
    setPendingInvites((current) => {
      const next = current.filter((invite) => invite.userId !== userId)
      if (next.length !== current.length) {
        persistPendingInvites(next)
      }
      return next
    })
  }, [persistPendingInvites])

  useEffect(() => {
    if (pendingInvites.length === 0) return
    const timer = setTimeout(() => {
      setPendingInvites((current) => {
        const next = filterUnexpiredPendingInvites(current, Date.now())
        if (next.length !== current.length) {
          persistPendingInvites(next)
        }
        return next
      })
    }, resolveNextPendingInviteExpiryDelay(pendingInvites, Date.now()))
    return () => clearTimeout(timer)
  }, [pendingInvites, persistPendingInvites])

  // Clear pending invites if their targets leave the nearby pool.
  useEffect(() => {
    if (pendingInvites.length === 0) return
    if (!lobbyState.isJoined) return
    const nearbyUserIds = new Set(nearbyUsers.map((user) => user.userId))
    setPendingInvites((current) => {
      const next = current.filter((invite) => nearbyUserIds.has(invite.userId))
      if (next.length !== current.length) {
        persistPendingInvites(next)
      }
      return next
    })
  }, [
    lobbyState.isJoined,
    nearbyUsers,
    pendingInvites.length,
    persistPendingInvites
  ])

  useEffect(() => {
    const decision = lobbyState.interaction.latestInviteDecision
    if (!decision) return
    const otherUserId =
      decision.senderUserId === myUserId
        ? decision.recipientUserId
        : decision.senderUserId
    dropPendingInviteFor(otherUserId)
  }, [
    lobbyState.interaction.latestInviteDecision,
    myUserId,
    dropPendingInviteFor
  ])

  return {
    pendingInvites,
    pendingInviteUserIds,
    addPendingInvite,
    dropPendingInviteFor
  }
}
