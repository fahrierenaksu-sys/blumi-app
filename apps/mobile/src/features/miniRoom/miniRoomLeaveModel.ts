import type { MiniRoomCopy } from "./miniRoomCopy"

/**
 * Leaving the shared room ends it for both people (UX audit ROOM-08), so every
 * way out (the top-left arrow, the menu, Android back, a gesture) asks first.
 */
export interface MiniRoomLeaveConfirmation {
  title: string
  message: string
  buttons: [
    { text: string; style: "cancel"; action: "stay" },
    { text: string; style: "destructive"; action: "leave" }
  ]
}

export function getMiniRoomLeaveConfirmation(copy: MiniRoomCopy): MiniRoomLeaveConfirmation {
  return {
    title: copy.leaveConfirmTitle,
    message: copy.leaveConfirmBody,
    buttons: [
      { text: copy.leaveConfirmStay, style: "cancel", action: "stay" },
      { text: copy.leaveRoom, style: "destructive", action: "leave" }
    ]
  }
}

/** Once the room has ended (left, closed by the partner or a block) the screen may go. */
export function resolveMiniRoomRemoval(input: { exited: boolean }): "allow" | "confirm" {
  return input.exited ? "allow" : "confirm"
}
