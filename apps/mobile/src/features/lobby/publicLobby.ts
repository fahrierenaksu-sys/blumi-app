import type { ClientEvent, ServerEvent } from "@blumi/realtime-client"

export const PUBLIC_LOBBY_ROOM_ID = "public-lobby"

export type LobbySessionMode = "demo" | "production"

/**
 * Owner decision (2026-09-30): production sessions never join the legacy
 * shared public lobby, and the server rejects `room.join` for it. Production
 * Discover is driven by server profiles, and rooms start from a chat-initiated
 * invite over HTTP. Demo sessions never open a realtime socket, so they never
 * reach the lobby either; the flag stays mode-scoped so demo keeps its current
 * local-only behaviour.
 */
export function isLegacyPublicLobbyEnabled(mode: LobbySessionMode): boolean {
  return mode !== "production"
}

export interface LegacyLobbyJoinInput {
  mode: LobbySessionMode
  connectionStatus: string
  alreadySent: boolean
  sessionToken: string
}

/**
 * Returns the one `room.join` a connected legacy (non-production) session may
 * send, or null. Production sessions always get null, including after every
 * socket reconnect.
 */
export function createLegacyLobbyJoinEvent(
  input: LegacyLobbyJoinInput
): ClientEvent | null {
  if (!isLegacyPublicLobbyEnabled(input.mode)) return null
  if (input.connectionStatus !== "connected" || input.alreadySent) return null
  return {
    type: "room.join",
    payload: {
      roomId: PUBLIC_LOBBY_ROOM_ID,
      sessionToken: input.sessionToken
    }
  }
}

const LEGACY_LOBBY_PRESENCE_EVENT_TYPES: ReadonlySet<ServerEvent["type"]> = new Set([
  "room.joined",
  "room.left",
  "presence.snapshot",
  "presence.nearby",
  "mini_room.invite_received",
  "mini_room.invite_decided",
  "reaction.received"
])

/**
 * Production sessions ignore lobby presence and legacy lobby invite events even
 * if an older server still sends them, so nothing user-visible can depend on
 * lobby presence. `mini_room.ready` and every chat, match, and safety event are
 * handled elsewhere and pass through unchanged.
 */
export function shouldApplyLobbyServerEvent(
  mode: LobbySessionMode,
  event: ServerEvent
): boolean {
  if (isLegacyPublicLobbyEnabled(mode)) return true
  return !LEGACY_LOBBY_PRESENCE_EVENT_TYPES.has(event.type)
}
