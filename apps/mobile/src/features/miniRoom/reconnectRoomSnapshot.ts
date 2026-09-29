import type { MediaSessionToken, MiniRoom } from "@blumi/contracts"

export interface MiniRoomReconnectRouteParams<TParticipants> {
  readyMiniRoom: {
    miniRoom: MiniRoom
    mediaSession: MediaSessionToken
  }
  participants: TParticipants
}

/**
 * Accept a refreshed snapshot only for the room already on screen. Keep the
 * existing media credentials so a metadata refresh cannot restart LiveKit.
 */
export function mergeMiniRoomReconnectSnapshot<TParticipants>(input: {
  current: MiniRoomReconnectRouteParams<TParticipants>
  refreshedMiniRoom: MiniRoom
  refreshedParticipants: TParticipants
}): MiniRoomReconnectRouteParams<TParticipants> | null {
  if (
    input.current.readyMiniRoom.miniRoom.miniRoomId !==
    input.refreshedMiniRoom.miniRoomId
  ) {
    return null
  }

  return {
    readyMiniRoom: {
      miniRoom: input.refreshedMiniRoom,
      mediaSession: input.current.readyMiniRoom.mediaSession
    },
    participants: input.refreshedParticipants
  }
}
