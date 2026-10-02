import type { RoomWorldPoint } from "./roomWorldGeometry"

/**
 * The tap marker's whole life, in one place. A marker shows where the avatar
 * is actually going (the resolved destination, not the raw tap) and exists
 * only while that walk is the current one:
 *
 * - a new walk replaces it at once with the new destination;
 * - arriving, or any end of the walk that does not arrive (stopped by a pose,
 *   the room losing focus, the avatar being re-placed, a failed plan) makes it
 *   leave: it fades out, then is gone;
 * - an arrival or a fade that belongs to an older walk changes nothing.
 *
 * So no path leaves a marker on the floor after its walk is over (2026-10-02:
 * one stayed at the front-left edge after a pose stopped the walk, another
 * under the avatar).
 */
export interface RoomTapMarker extends RoomWorldPoint {
  id: number
  /** Fading out: the walk it marked is over. */
  leaving: boolean
}

export interface RoomTapMarkerState {
  marker: RoomTapMarker | null
}

export type RoomTapMarkerEvent =
  /** `markerId` is the walk's own id (each walk a new one). */
  | { type: "walk_started"; markerId: number; point: RoomWorldPoint }
  | { type: "arrived"; markerId: number }
  | { type: "walk_ended" }
  | { type: "faded"; markerId: number }

export const INITIAL_ROOM_TAP_MARKER_STATE: RoomTapMarkerState = { marker: null }

export function reduceRoomTapMarker(state: RoomTapMarkerState, event: RoomTapMarkerEvent): RoomTapMarkerState {
  switch (event.type) {
    case "walk_started":
      return { marker: { id: event.markerId, x: event.point.x, y: event.point.y, leaving: false } }
    case "arrived":
      return state.marker?.id === event.markerId ? leave(state) : state
    case "walk_ended":
      return leave(state)
    case "faded":
      return state.marker?.id === event.markerId && state.marker.leaving
        ? { marker: null }
        : state
  }
}

function leave(state: RoomTapMarkerState): RoomTapMarkerState {
  if (!state.marker || state.marker.leaving) return state
  return { marker: { ...state.marker, leaving: true } }
}
