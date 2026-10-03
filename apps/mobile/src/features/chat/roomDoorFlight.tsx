import { Dimensions } from "react-native"
import { launchFlight } from "../../ui/flight/FlightLayer"
import { createLiveFlightSources } from "../../ui/flight/flightSources"
import { isFlightFrameVisible, type FlightFrame } from "../../ui/flight/flightModel"
import type { FlightSurface } from "../../ui/flight/flightStore"
import {
  ROOM_INVITE_DOOR_GEOMETRY,
  ROOM_INVITE_SCENE_HEIGHT,
  RoomInviteDoorFlightArtwork
} from "./ChatRoomInviteScene"

/**
 * "The door opens" (MOTION_PLAN §C, journey 7), chat side: the accepted
 * invitation card, whose door already stands open, grows across the screen
 * while the room route opens visibly underneath, then dissolves into the
 * room. It stops at the room route's boundary: what
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

const TRANSPARENT_SURFACE: FlightSurface = {
  backgroundColor: "transparent",
  radius: 0
}

/** The measured card frame contains this fixed-position doorway inset by its 1px border. */
export function getRoomDoorArtworkFrame(card: FlightFrame): FlightFrame {
  return {
    x: card.x + (card.width - ROOM_INVITE_DOOR_GEOMETRY.width) / 2,
    y: card.y + 1 + ROOM_INVITE_SCENE_HEIGHT - ROOM_INVITE_DOOR_GEOMETRY.bottom - ROOM_INVITE_DOOR_GEOMETRY.height,
    width: ROOM_INVITE_DOOR_GEOMETRY.width,
    height: ROOM_INVITE_DOOR_GEOMETRY.height
  }
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
  const doorFrame = getRoomDoorArtworkFrame(source)
  if (!isFlightFrameVisible(doorFrame, window)) return false
  return launchFlight({
    channel: "room-door",
    match: input.sourceThreadId,
    source: doorFrame,
    sourceSurface: TRANSPARENT_SURFACE,
    targetSurface: TRANSPARENT_SURFACE,
    targetFrame: { x: 0, y: 0, width: window.width, height: window.height },
    content: <RoomInviteDoorFlightArtwork />,
    contentMode: "carry"
  }) !== null
}
