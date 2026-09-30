import type { MediaSessionToken, MiniRoom } from "@blumi/contracts"
import { useMemo } from "react"
import { createTextOnlyMiniRoomMediaState, type MiniRoomMediaState } from "./miniRoomMediaState"

export interface UseMiniRoomMediaInput {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
}

export interface UseMiniRoomMediaResult {
  mediaState: MiniRoomMediaState
  voiceAvailable: boolean
  retryConnect: () => Promise<void>
  toggleMic: () => Promise<void>
}

const noMediaAction = async (): Promise<void> => {}

/** Text rooms never create a native capture client, even with a legacy media token. */
export function useMiniRoomMedia({ miniRoom, mediaSession }: UseMiniRoomMediaInput): UseMiniRoomMediaResult {
  const mediaState = useMemo(() => createTextOnlyMiniRoomMediaState({
    miniRoomId: miniRoom.miniRoomId,
    livekitRoomName: miniRoom.livekitRoomName,
    livekitUrl: mediaSession.livekitUrl
  }), [miniRoom.miniRoomId, miniRoom.livekitRoomName, mediaSession.livekitUrl])

  return { mediaState, voiceAvailable: false, retryConnect: noMediaAction, toggleMic: noMediaAction }
}
