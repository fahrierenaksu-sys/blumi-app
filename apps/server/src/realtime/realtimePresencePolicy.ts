import { PUBLIC_LOBBY_ROOM_ID } from "../rooms/roomService"

/**
 * Realtime presence-room policy.
 *
 * Owner decision (2026-09-30): the legacy shared public lobby
 * (`"public-lobby"`) is retired for every authenticated session. The approved
 * social loop is `mutual match -> text chat -> optional chat-initiated room
 * invite (HTTP) -> shared room`, and chat-initiated rooms never depend on
 * realtime room presence. No presence room is currently joinable through
 * `room.join`, so the default policy denies every room.
 *
 * The decision is keyed on the authenticated actor and the requested room,
 * never on the deploy environment, so a staging server enforces it exactly as
 * production does. A future presence surface must add an explicit,
 * server-authorized rule here (for example a verified room-membership lookup)
 * together with tests; ad-hoc room-id string checks in the router are not the
 * enforcement point.
 *
 * The router consults this policy for `room.join`, `presence.move_to_spot`,
 * legacy `mini_room.invite` / `mini_room.invite_decision`, presence-room
 * `reaction.send`, and for every recipient of presence publication
 * (`presence.snapshot`, `presence.nearby`).
 */
export interface RealtimePresenceActor {
  userId: string
}

export type RealtimePresenceRoomPolicy = (
  actor: RealtimePresenceActor,
  roomId: string
) => boolean | Promise<boolean>

/** Retired room id, kept only so tests and diagnostics can name it. */
export const LEGACY_PUBLIC_LOBBY_ROOM_ID = PUBLIC_LOBBY_ROOM_ID

export function isRealtimePresenceRoomAllowed(
  _actor: RealtimePresenceActor,
  _roomId: string
): boolean {
  return false
}

export const PRESENCE_ROOM_UNAVAILABLE_CODE = "PRESENCE_ROOM_UNAVAILABLE" as const
export const PRESENCE_ROOM_UNAVAILABLE_MESSAGE = "That room is not available."
