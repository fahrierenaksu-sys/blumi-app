import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ServerEvent } from "@blumi/realtime-client"
import type { SessionActor } from "../session/sessionApi"
import {
  subscribeToEvents,
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../realtime/globalRealtimeProvider"
import {
  applyServerEventToLobbyState,
  createInitialLobbyState,
  type LobbyState
} from "./lobbyState"
import { PUBLIC_LOBBY_ROOM_ID } from "./publicLobby"
import { trySendLobbyInvite } from "./lobbyInviteAttempt"

export interface UseLobbyFlowOptions {
  sessionActor: SessionActor
  onInvalidSession: () => void
}

export interface UseLobbyFlowResult {
  connectionStatus: ReturnType<typeof useGlobalRealtime>["connectionStatus"]
  lobbyState: LobbyState
  nearbyUsers: NearbyLobbyUser[]
  incomingInvite: LobbyState["interaction"]["incomingInvite"]
  readyMiniRoom: LobbyState["interaction"]["readyMiniRoom"]
  recentReactions: LobbyState["interaction"]["recentReactions"]
  clearReadyMiniRoom: () => void
  sendInvite: (recipientUserId: string) => boolean
  decideInvite: (status: InviteDecisionStatus) => void
  sendReaction: (reaction: LobbyReaction) => void
  requestRefresh: () => Promise<void>
}

export interface NearbyLobbyUser {
  userId: string
  displayName: string
  spotId: string
  distance: number
  canInvite: boolean
  blocked: boolean
}

export type LobbyReaction = "wave" | "heart" | "laugh" | "fire"
export type InviteDecisionStatus = "accepted" | "declined"

export function useLobbyFlow(options: UseLobbyFlowOptions): UseLobbyFlowResult {
  const { sessionActor } = options
  const [lobbyState, setLobbyState] = useState<LobbyState>(() =>
    createInitialLobbyState(PUBLIC_LOBBY_ROOM_ID)
  )

  const joinSentRef = useRef(false)
  const { connectionStatus, send } = useGlobalRealtime()

  // Apply lobby-relevant server events to lobby state
  const handleServerEvent = useCallback(
    (serverEvent: ServerEvent) => {
      setLobbyState((previousState) =>
        applyServerEventToLobbyState(previousState, serverEvent, sessionActor.profile.userId)
      )
    },
    [sessionActor.profile.userId]
  )

  useGlobalRealtimeEvents(handleServerEvent)

  useEffect(() => {
    joinSentRef.current = false
    setLobbyState(createInitialLobbyState(PUBLIC_LOBBY_ROOM_ID))
  }, [sessionActor.profile.userId, sessionActor.session.sessionToken])

  useEffect(() => {
    if (connectionStatus !== "connected" || joinSentRef.current) {
      return
    }

    joinSentRef.current = true
    send({
      type: "room.join",
      payload: {
        roomId: PUBLIC_LOBBY_ROOM_ID,
        sessionToken: sessionActor.session.sessionToken
      }
    })
  }, [connectionStatus, send, sessionActor.session.sessionToken])

  const sendInvite = useCallback(
    (recipientUserId: string): boolean =>
      trySendLobbyInvite({
        connectionStatus,
        isJoined: lobbyState.isJoined,
        roomId: lobbyState.roomId,
        recipientUserId,
        send
      }),
    [connectionStatus, lobbyState.isJoined, lobbyState.roomId, send]
  )

  const sendReaction = useCallback(
    (reaction: LobbyReaction) => {
      if (connectionStatus !== "connected" || !lobbyState.isJoined) {
        return
      }

      send({
        type: "reaction.send",
        payload: {
          roomId: lobbyState.roomId,
          reaction
        }
      })
    },
    [connectionStatus, lobbyState.isJoined, lobbyState.roomId, send]
  )

  const decideInvite = useCallback(
    (status: InviteDecisionStatus) => {
      const incomingInvite = lobbyState.interaction.incomingInvite
      if (connectionStatus !== "connected" || !incomingInvite) {
        return
      }

      send({
        type: "mini_room.invite_decision",
        payload: {
          inviteId: incomingInvite.inviteId,
          status
        }
      })
    },
    [connectionStatus, lobbyState.interaction.incomingInvite, send]
  )

  const clearReadyMiniRoom = useCallback(() => {
    setLobbyState((previousState) => {
      if (!previousState.interaction.readyMiniRoom) {
        return previousState
      }
      return {
        ...previousState,
        interaction: {
          ...previousState.interaction,
          readyMiniRoom: null
        }
      }
    })
  }, [])

  const nearbyUsers = useMemo<NearbyLobbyUser[]>(() => {
    const usersById = new Map(
      (lobbyState.snapshot?.users ?? []).map((user) => [user.userId, user.displayName])
    )

    return lobbyState.interaction.nearbyUsers.map((nearbyUser) => ({
      ...nearbyUser,
      displayName: usersById.get(nearbyUser.userId) ?? nearbyUser.userId
    }))
  }, [lobbyState.interaction.nearbyUsers, lobbyState.snapshot?.users])

  const requestRefresh = useCallback((): Promise<void> => {
    if (connectionStatus !== "connected") {
      return Promise.reject(new Error("Realtime is not connected."))
    }
    return new Promise<void>((resolve, reject) => {
      const unsubscribe = subscribeToEvents((event) => {
        if (
          event.type !== "room.joined" ||
          event.payload.roomId !== PUBLIC_LOBBY_ROOM_ID ||
          event.payload.currentUserId !== sessionActor.profile.userId
        ) {
          return
        }
        clearTimeout(timer)
        unsubscribe()
        resolve()
      })
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error("Lobby refresh timed out."))
      }, 8_000)
      send({
        type: "room.join",
        payload: {
          roomId: PUBLIC_LOBBY_ROOM_ID,
          sessionToken: sessionActor.session.sessionToken
        }
      })
    })
  }, [
    connectionStatus,
    send,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  return useMemo(
    () => ({
      connectionStatus,
      lobbyState,
      nearbyUsers,
      incomingInvite: lobbyState.interaction.incomingInvite,
      readyMiniRoom: lobbyState.interaction.readyMiniRoom,
      recentReactions: lobbyState.interaction.recentReactions,
      clearReadyMiniRoom,
      sendInvite,
      decideInvite,
      sendReaction,
      requestRefresh
    }),
    [
      connectionStatus,
      lobbyState,
      nearbyUsers,
      clearReadyMiniRoom,
      sendInvite,
      decideInvite,
      sendReaction,
      requestRefresh
    ]
  )
}
