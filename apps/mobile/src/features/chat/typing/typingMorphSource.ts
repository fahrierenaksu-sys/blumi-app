import { createLiveFlightSources, type LiveFlightSources } from "../../../ui/flight/flightSources"

/**
 * Where the partner's typing dots are, so the message they were typing can
 * grow out of them (typing → bubble morph, ui/flight). The typing bubble
 * attaches while it is on screen; the store clears it in the same update
 * that delivers the message, so the row that mounts for that message can
 * still measure it during its first render. Dots that left a moment before
 * the message arrived (typing stopped first) still count, briefly.
 *
 * Keyed by the conversation's flight channel.
 */

/** Typing that stopped longer ago than this no longer reads as "those dots". */
export const TYPING_MORPH_GRACE_MS = 1_200

export function createTypingMorphSources(graceMs: number = TYPING_MORPH_GRACE_MS): LiveFlightSources {
  return createLiveFlightSources(graceMs)
}

/** The app's one registry: the typing bubble writes it, incoming rows read it. */
export const typingMorphSources = createTypingMorphSources()
