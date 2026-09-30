import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MOBILE_HTTP_BASE_URL } from "../../../config/env"
import {
  activateDiscoveryWatch,
  cancelDiscoveryWatch,
  isDiscoveryWatchActive
} from "../discoveryApi"
import { buildDiscoveryWatchQueryKey } from "../discoveryQueryOptions"
import { runDiscoveryWatchMutation } from "../discoveryWatchMutation"
import type { LobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import type { SessionActor } from "../../session/sessionModel"
import { showToast } from "../../../ui/toast"
import type { useProductionDiscoveryQuery } from "./useProductionDiscoveryQuery"

type DiscoveryWatch = ReturnType<typeof useProductionDiscoveryQuery>["discoveryWatch"]

// Low-supply Vibe Card: server-backed, expiring, cancellable, and cancelled
// automatically once new candidates are available again.
export function useDiscoveryWatch(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  discoveryWatch: DiscoveryWatch
  discoveryQuotaExhausted: boolean
  discoverDeckLength: number
  lobbyCopy: LobbyFeedbackCopy
}) {
  const {
    sessionActor,
    isProductionDiscovery,
    discoveryWatch,
    discoveryQuotaExhausted,
    discoverDeckLength,
    lobbyCopy
  } = input
  const queryClient = useQueryClient()
  const [discoveryWatchBusy, setDiscoveryWatchBusy] = useState(false)

  useEffect(() => {
    if (!discoveryWatch) return
    if (!isDiscoveryWatchActive(discoveryWatch)) {
      queryClient.setQueryData(
        buildDiscoveryWatchQueryKey({
          baseHttpUrl: MOBILE_HTTP_BASE_URL,
          userId: sessionActor.profile.userId
        }),
        null
      )
      return
    }
    const timeoutId = setTimeout(
      () => {
        queryClient.setQueryData(
          buildDiscoveryWatchQueryKey({
            baseHttpUrl: MOBILE_HTTP_BASE_URL,
            userId: sessionActor.profile.userId
          }),
          null
        )
      },
      Date.parse(discoveryWatch.expiresAt) - Date.now()
    )
    return () => clearTimeout(timeoutId)
  }, [discoveryWatch, queryClient, sessionActor.profile.userId])

  const handleActivateDiscoveryWatch = useCallback(async () => {
    if (!isProductionDiscovery || discoveryWatchBusy) return
    setDiscoveryWatchBusy(true)
    try {
      await runDiscoveryWatchMutation({
        queryClient,
        baseHttpUrl: MOBILE_HTTP_BASE_URL,
        userId: sessionActor.profile.userId,
        mutation: () => activateDiscoveryWatch(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken
        )
      })
    } catch {
      showToast({
        title: lobbyCopy.watchSaveTitle,
        body: lobbyCopy.watchSaveBody,
        type: "warning"
      })
    } finally {
      setDiscoveryWatchBusy(false)
    }
  }, [
    discoveryWatchBusy,
    isProductionDiscovery,
    lobbyCopy,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  const handleCancelDiscoveryWatch = useCallback(async () => {
    if (!isProductionDiscovery || discoveryWatchBusy) return
    setDiscoveryWatchBusy(true)
    try {
      await runDiscoveryWatchMutation({
        queryClient,
        baseHttpUrl: MOBILE_HTTP_BASE_URL,
        userId: sessionActor.profile.userId,
        mutation: () => cancelDiscoveryWatch(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken
        ).then(() => null)
      })
    } catch {
      showToast({
        title: lobbyCopy.watchCancelTitle,
        body: lobbyCopy.watchCancelBody,
        type: "warning"
      })
    } finally {
      setDiscoveryWatchBusy(false)
    }
  }, [
    discoveryWatchBusy,
    isProductionDiscovery,
    lobbyCopy,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  useEffect(() => {
    if (
      !isProductionDiscovery ||
      !discoveryWatch ||
      discoveryQuotaExhausted ||
      discoverDeckLength === 0
    ) return
    void runDiscoveryWatchMutation({
      queryClient,
      baseHttpUrl: MOBILE_HTTP_BASE_URL,
      userId: sessionActor.profile.userId,
      mutation: () => cancelDiscoveryWatch(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      ).then(() => null)
    }).catch(() => undefined)
  }, [
    discoverDeckLength,
    discoveryQuotaExhausted,
    discoveryWatch,
    isProductionDiscovery,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  return {
    discoveryWatchBusy,
    handleActivateDiscoveryWatch,
    handleCancelDiscoveryWatch
  }
}
