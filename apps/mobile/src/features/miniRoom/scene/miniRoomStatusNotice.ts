import type { MiniRoomConnectionStatus } from "../miniRoomMediaState"

export type MiniRoomStatusNotice = "connecting" | "reconnecting" | "failed"

/**
 * The room's connection state as one short notice under the header, or none
 * while connected. Only a failed connection offers a retry action.
 */
export function resolveMiniRoomStatusNotice(
  status: MiniRoomConnectionStatus
): MiniRoomStatusNotice | null {
  switch (status) {
    case "connected":
      return null
    case "idle":
    case "connecting":
      return "connecting"
    case "disconnected":
      return "reconnecting"
    case "error":
      return "failed"
  }
}
