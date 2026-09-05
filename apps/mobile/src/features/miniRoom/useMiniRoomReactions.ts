import type { ReactionType } from "@blumi/contracts"
import type { ServerEvent } from "@blumi/realtime-client"
import { useCallback, useState } from "react"
import {
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../realtime/globalRealtimeProvider"
import type { SessionActor } from "../session/sessionApi"

export interface MiniRoomReactionEntry {
  id: string
  reaction: ReactionType
  fromPartner: boolean
}

const MAX_VISIBLE = 4

export interface UseMiniRoomReactionsResult {
  recentReactions: MiniRoomReactionEntry[]
  sendReaction: (reaction: ReactionType) => void
  canSend: boolean
}

export function useMiniRoomReactions(options: {
  sessionActor: SessionActor
  miniRoomId: string
  partnerUserId: string
}): UseMiniRoomReactionsResult {
  const { sessionActor, miniRoomId, partnerUserId } = options
  const myUserId = sessionActor.profile.userId
  const [recent, setRecent] = useState<MiniRoomReactionEntry[]>([])

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type !== "reaction.received") return
      const r = event.payload
      if (r.actorUserId !== partnerUserId && r.actorUserId !== myUserId) return
      setRecent((prev) => {
        const entry: MiniRoomReactionEntry = {
          id: `${r.actorUserId}-${r.createdAt}`,
          reaction: r.reaction,
          fromPartner: r.actorUserId === partnerUserId
        }
        return [entry, ...prev].slice(0, MAX_VISIBLE)
      })
    },
    [partnerUserId, myUserId]
  )

  useGlobalRealtimeEvents(handleServerEvent)
  const { connectionStatus, send } = useGlobalRealtime()

  const sendReaction = useCallback(
    (reaction: ReactionType) => {
      if (connectionStatus !== "connected") return
      send({
        type: "reaction.send",
        payload: { roomId: miniRoomId, reaction }
      })
    },
    [connectionStatus, miniRoomId, send]
  )

  return {
    recentReactions: recent,
    sendReaction,
    canSend: connectionStatus === "connected"
  }
}
