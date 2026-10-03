import { Dimensions } from "react-native"
import { launchFlight } from "../../ui/flight/FlightLayer"
import { createLiveFlightSources } from "../../ui/flight/flightSources"
import { isFlightFrameVisible } from "../../ui/flight/flightModel"
import type { FlightSurface } from "../../ui/flight/flightStore"
import { uiTheme } from "../../ui/theme"

/**
 * Chat → room, an iOS-style zoom: the accepted invitation card itself grows
 * from its place in the chat to fill the screen, its rounded paper turning
 * into the room's backdrop, and dissolves into the room route that opens
 * underneath. Only flat surfaces move, so nothing is upscaled or blurred (the
 * old version stretched the card's small door drawing to the whole window).
 * What happens inside the room (the partner walking in) belongs to the room.
 *
 * The open card attaches itself per conversation while it is on screen; the
 * room opener takes it when the room for that conversation is entered. Like
 * every flight it never delays the room, and without a card on screen, or
 * under Reduce Motion, the room simply opens as before.
 */

/** A card that left the screen longer ago than this no longer zooms into the room. */
export const ROOM_DOOR_GRACE_MS = 1_500

export const roomDoorSources = createLiveFlightSources(ROOM_DOOR_GRACE_MS)

export function getRoomDoorKey(threadId: string): string {
  return `room-door:${threadId}`
}

/** The invitation card's own paper (ChatRoomInviteCard `card` style). */
export const ROOM_DOOR_CARD_SURFACE: FlightSurface = {
  backgroundColor: uiTheme.colors.surfaceRaised,
  radius: uiTheme.radius.lg
}

/** The MiniRoom's backdrop, so the zoom lands on the colour the room opens on. */
export const ROOM_DOOR_ROOM_SURFACE: FlightSurface = {
  backgroundColor: "#FFF7FA",
  radius: 0
}

/** Returns true when the zoom started. Call just before opening the room. */
export function launchRoomDoorFlight(input: {
  sourceThreadId: string | undefined
  reduceMotion: boolean
}): boolean {
  if (!input.sourceThreadId || input.reduceMotion) return false
  const source = roomDoorSources.take(getRoomDoorKey(input.sourceThreadId))
  if (!source) return false
  const window = Dimensions.get("window")
  if (!isFlightFrameVisible(source, window)) return false
  return launchFlight({
    channel: "room-door",
    match: input.sourceThreadId,
    source,
    sourceSurface: ROOM_DOOR_CARD_SURFACE,
    targetSurface: ROOM_DOOR_ROOM_SURFACE,
    targetFrame: { x: 0, y: 0, width: window.width, height: window.height }
  }) !== null
}
