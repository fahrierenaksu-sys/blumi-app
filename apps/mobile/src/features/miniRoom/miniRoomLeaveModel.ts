import type { MiniRoomCopy } from "./miniRoomCopy"

/** The match and durable conversation already exist before room entry. */
export function getMiniRoomExitDestination(sourceThreadId: string | undefined, blockedPartner = false):
  { name: "ChatThread"; threadId: string } | { name: "Inbox" } {
  return sourceThreadId && !blockedPartner
    ? { name: "ChatThread", threadId: sourceThreadId }
    : { name: "Inbox" }
}

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

/**
 * How long the room waits for the server's first answer before the person is
 * taken out anyway; the close is then confirmed in the background.
 */
export const MINI_ROOM_LEAVE_EXIT_WAIT_MS = 4_000

/** Pauses before each background retry of an unconfirmed close (bounded). */
export const MINI_ROOM_LEAVE_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 9_000]

/**
 * A leave the server did not confirm with 200:
 * - "left": nothing is left to close (404, 410: the room ended or is gone).
 * - "retry": no answer, a timeout, a request limit, a race or a server or
 *   database failure; the server changed nothing, so the same request is safe
 *   to repeat (the leave route is idempotent).
 * - "stop": an answer the same request cannot change (validation, auth,
 *   restriction).
 * Leaving always takes the person out of the room; this only decides how the
 * close for both people is confirmed.
 */
export type MiniRoomLeaveFailure = "left" | "retry" | "stop"

export function classifyMiniRoomLeaveFailure(status: number | null): MiniRoomLeaveFailure {
  if (status === 404 || status === 410) return "left"
  if (status === null || status === 0 || status === 408 || status === 409 || status === 425 ||
    status === 429 || status >= 500) {
    return "retry"
  }
  return "stop"
}
