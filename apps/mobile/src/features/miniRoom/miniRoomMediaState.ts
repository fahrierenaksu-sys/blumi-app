export type MiniRoomConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export interface MiniRoomLocalMediaState {
  micEnabled: boolean
  speakerEnabled: boolean
}

export interface MiniRoomMediaRoomInfo {
  miniRoomId: string
  livekitRoomName: string
  livekitUrl: string
}

export interface MiniRoomMediaState {
  connectionStatus: MiniRoomConnectionStatus
  errorMessage: string | null
  connectAttemptedAt: string | null
  localMedia: MiniRoomLocalMediaState
  roomInfo: MiniRoomMediaRoomInfo
}

export function createInitialMiniRoomMediaState(
  roomInfo: MiniRoomMediaRoomInfo
): MiniRoomMediaState {
  return {
    connectionStatus: "idle",
    errorMessage: null,
    connectAttemptedAt: null,
    localMedia: {
      micEnabled: false,
      speakerEnabled: true
    },
    roomInfo
  }
}
