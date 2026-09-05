import type { ClientEvent } from "@blumi/realtime-client"
import type { RealtimeConnectionStatus } from "../realtime/realtimeClient"

export interface LobbyInviteAttempt {
  connectionStatus: RealtimeConnectionStatus
  isJoined: boolean
  roomId: string
  recipientUserId: string
  send: (event: ClientEvent) => boolean
}

export function trySendLobbyInvite(attempt: LobbyInviteAttempt): boolean {
  if (attempt.connectionStatus !== "connected" || !attempt.isJoined) {
    return false
  }

  try {
    return attempt.send({
      type: "mini_room.invite",
      payload: {
        roomId: attempt.roomId,
        recipientUserId: attempt.recipientUserId
      }
    })
  } catch {
    return false
  }
}
