import type { ChatThread } from "@blumi/contracts"
import { useCallback, useRef, useState, type RefObject } from "react"
import { captureProductEvent } from "../analytics/productAnalytics"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import { createThread } from "../features/chat/chatApi"
import { findThreadForPartner } from "../features/chat/chatStore"
import type { ConnectionDecisionDeliveryDependencies } from "../features/connections/connectionDecisionDelivery"
import {
  presentConnectionMatch,
  type ConnectionMatchPresentationInput
} from "../features/connections/connectionMatchPresentation"
import {
  reconcileRealtimeConnectionMatch,
  type ConnectionMatchedPayload
} from "../features/connections/globalMatchReconciliation"
import { getMatchCreatedProperties } from "../features/matches/matchResultPresentation"
import {
  recordMutualConnection,
  updateSavedConnectionStatus
} from "../features/connections/savedConnectionsStore"
import type { SessionActor } from "../features/session/sessionModel"
import { showToast } from "../ui/toast"
import { navigationRef } from "./rootNavigationRef"

export interface GlobalMatchState {
  miniRoomId: string
  matchedUserName: string
  matchedUserId?: string
}

type HydrateInventory = Parameters<typeof reconcileRealtimeConnectionMatch>[2]["hydrateFromServer"]

interface MatchModalInput {
  sessionActor: SessionActor | null
  latestSessionActorRef: RefObject<SessionActor | null>
  isCurrentSession: (expectedActor: SessionActor) => boolean
  applyNewThread: (thread: ChatThread) => void
  hydrateFromServer: HydrateInventory
}

/**
 * Owns the global mutual-match modal: presenting each match once (from a
 * delivered connection decision or a realtime `connection.matched`), the
 * de-duplication state the realtime handler consults, and the modal's
 * Discover and chat actions.
 */
export function useMatchModal({
  sessionActor,
  latestSessionActorRef,
  isCurrentSession,
  applyNewThread,
  hydrateFromServer
}: MatchModalInput) {
  const [globalMatch, setGlobalMatch] = useState<GlobalMatchState | null>(null)
  const handledMatchIdsRef = useRef(new Set<string>())
  const reconcilingMatchIdsRef = useRef(new Set<string>())

  const presentMatch = useCallback((match: ConnectionMatchPresentationInput): void => {
    presentConnectionMatch({
      hasPresented: (miniRoomId) => handledMatchIdsRef.current.has(miniRoomId),
      markPresented: (miniRoomId) => {
        handledMatchIdsRef.current = new Set([
          ...handledMatchIdsRef.current,
          miniRoomId
        ])
      },
      captureMatchCreated: () => {
        const properties = getMatchCreatedProperties("connection_modal", match.mode)
        if (properties) captureProductEvent("match_created", properties)
      },
      showMatchToast: (toast) => {
        showToast({ ...toast, type: "success" })
      },
      showMatchModal: setGlobalMatch
    }, match)
  }, [])

  const reconcileConnectionDecisionDelivery = useCallback<
    NonNullable<ConnectionDecisionDeliveryDependencies["onDelivered"]>
  >(async (intent, response): Promise<void> => {
    const actor = sessionActor
    if (!actor) return
    if (response.match) {
      const connection = await recordMutualConnection({
        ownerUserId: actor.profile.userId,
        currentUserId: actor.profile.userId,
        participantUserIds: response.match.participantUserIds
      })
      if (!connection || !isCurrentSession(actor) || actor.session.mode !== "production") {
        return
      }
      const thread = await createThread(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken,
        { participantUserIds: response.match.participantUserIds }
      )
      if (!isCurrentSession(actor)) return
      applyNewThread(thread)
      presentMatch({
        miniRoomId: response.match.miniRoomId,
        matchedUserId: connection.userId,
        matchedUserName: connection.displayName,
        mode: actor.session.mode
      })
      return
    }
    if (intent.status === "saved" && isCurrentSession(actor)) {
      await updateSavedConnectionStatus({
        ownerUserId: actor.profile.userId,
        userId: intent.partnerUserId,
        status: "pending"
      })
    }
  }, [applyNewThread, isCurrentSession, presentMatch, sessionActor])

  const handleRealtimeConnectionMatch = useCallback(
    (payload: ConnectionMatchedPayload): void => {
      const actor = sessionActor
      if (!actor) return

      reconcilingMatchIdsRef.current = new Set([
        ...reconcilingMatchIdsRef.current,
        payload.miniRoomId
      ])
      void reconcileRealtimeConnectionMatch(payload, actor, {
        getCurrentSessionActor: () => latestSessionActorRef.current,
        recordMutualConnection,
        hydrateFromServer,
        createThread,
        applyChatThreadCreated: applyNewThread,
        presentMatch,
        httpBaseUrl: MOBILE_HTTP_BASE_URL
      })
        .catch(() => undefined)
        .finally(() => {
          reconcilingMatchIdsRef.current = new Set(
            [...reconcilingMatchIdsRef.current].filter(
              (miniRoomId) => miniRoomId !== payload.miniRoomId
            )
          )
        })
    },
    [applyNewThread, hydrateFromServer, latestSessionActorRef, presentMatch, sessionActor]
  )

  /** Matches already shown or still reconciling, for realtime de-duplication. */
  const getMatchDeduplicationState = useCallback(() => ({
    handledMatchIds: handledMatchIdsRef.current,
    reconcilingMatchIds: reconcilingMatchIdsRef.current
  }), [])

  const dismissGlobalMatch = useCallback((): void => {
    setGlobalMatch(null)
  }, [])

  const goLobby = useCallback((): void => {
    setGlobalMatch(null)
    if (navigationRef.isReady()) {
      navigationRef.navigate("Lobby")
    }
  }, [])

  const goChat = useCallback(
    (params: { threadId?: string; partnerId?: string; partnerName?: string }): void => {
      setGlobalMatch(null)
      if (navigationRef.isReady()) {
        navigationRef.navigate("ChatThread", params)
      }
    },
    []
  )

  const handleMatchSendMessage = useCallback((): void => {
    if (!globalMatch?.matchedUserId) {
      goLobby()
      return
    }

    const thread = findThreadForPartner(globalMatch.matchedUserId)
    if (thread) {
      goChat({ threadId: thread.threadId })
    } else {
      // Thread not synced yet, navigate with partner intent
      goChat({
        partnerId: globalMatch.matchedUserId,
        partnerName: globalMatch.matchedUserName
      })
    }
  }, [globalMatch, goChat, goLobby])

  /** Forget presented matches and close the modal when the session ends. */
  const resetMatchModal = useCallback((): void => {
    handledMatchIdsRef.current = new Set()
    reconcilingMatchIdsRef.current = new Set()
    setGlobalMatch(null)
  }, [])

  return {
    globalMatch,
    reconcileConnectionDecisionDelivery,
    handleRealtimeConnectionMatch,
    getMatchDeduplicationState,
    dismissGlobalMatch,
    goLobby,
    handleMatchSendMessage,
    resetMatchModal
  }
}
