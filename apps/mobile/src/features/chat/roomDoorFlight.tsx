import { Dimensions } from "react-native"
import { launchFlight } from "../../ui/flight/FlightLayer"
import { createLiveFlightSources } from "../../ui/flight/flightSources"
import type { FlightSurface } from "../../ui/flight/flightStore"
import { uiTheme } from "../../ui/theme"

/**
 * "The door opens" (MOTION_PLAN §C, journey 7), chat side: the accepted
 * invitation card, whose door already stands open, grows to fill the screen
 * in the warm light of that doorway while the room route opens underneath,
 * then dissolves into the room. It stops at the room route's boundary: what
 * happens inside the room (the partner walking in) belongs to the room.
 *
 * The open card attaches itself per conversation while it is on screen; the
 * room opener takes it when the room for that conversation is entered. Like
 * every flight it never delays the room, and without a card on screen, or
 * under Reduce Motion, the room simply opens as before.
 */

/** A card that left the screen longer ago than this no longer opens the door. */
export const ROOM_DOOR_GRACE_MS = 1_500

export const roomDoorSources = createLiveFlightSources(ROOM_DOOR_GRACE_MS)

export function getRoomDoorKey(threadId: string): string {
  return `room-door:${threadId}`
}

const CARD_SURFACE: FlightSurface = {
  backgroundColor: uiTheme.colors.surfaceRaised,
  borderColor: uiTheme.colors.borderStrong,
  borderWidth: 1,
  radius: uiTheme.radius.lg
}

/** The doorway's warm light (the open door's interior in ChatRoomInviteScene). */
const DOORWAY_LIGHT: FlightSurface = {
  backgroundColor: "#F8D4A0",
  radius: 0
}

/** Returns true when the door flight started. Call just before opening the room. */
export function launchRoomDoorFlight(input: {
  sourceThreadId: string | undefined
  reduceMotion: boolean
}): boolean {
  if (!input.sourceThreadId || input.reduceMotion) return false
  const source = roomDoorSources.take(getRoomDoorKey(input.sourceThreadId))
  if (!source) return false
  const window = Dimensions.get("window")
  return launchFlight({
    channel: "room-door",
    match: input.sourceThreadId,
    source,
    sourceSurface: CARD_SURFACE,
    targetSurface: DOORWAY_LIGHT,
    targetFrame: { x: 0, y: 0, width: window.width, height: window.height }
  }) !== null
}
