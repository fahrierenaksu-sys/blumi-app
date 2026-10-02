import type { FlightFrame } from "../../ui/flight/flightModel"

/**
 * Where a liked card's chibi stood when the like was committed, so the match
 * moment can fly that chibi into place (ui/flight). The server answers a like
 * a moment later, often after the card has left the deck, so the frame is
 * remembered for one partner and a short while only.
 *
 * Holds one window rectangle and nothing else: no profile data, no ids beyond
 * the comparison key, and it is consumed by the first match that reads it.
 */

/** A match that arrives later than this no longer reads as "that card". */
export const MATCH_FLIGHT_SOURCE_MAX_AGE_MS = 8_000

interface RememberedSource {
  readonly partnerUserId: string
  readonly frame: FlightFrame
  readonly at: number
}

export interface MatchFlightSourceStore {
  remember(partnerUserId: string, frame: FlightFrame, now?: number): void
  /** The frame liked for `partnerUserId`, once; null when none is fresh. */
  take(partnerUserId: string, now?: number): FlightFrame | null
  clear(): void
}

export function createMatchFlightSourceStore(
  maxAgeMs: number = MATCH_FLIGHT_SOURCE_MAX_AGE_MS
): MatchFlightSourceStore {
  let remembered: RememberedSource | null = null
  return {
    remember(partnerUserId, frame, now = Date.now()) {
      if (!partnerUserId) return
      remembered = { partnerUserId, frame: { ...frame }, at: now }
    },
    take(partnerUserId, now = Date.now()) {
      const entry = remembered
      if (!entry || entry.partnerUserId !== partnerUserId) return null
      remembered = null
      const age = now - entry.at
      return age >= 0 && age <= maxAgeMs ? entry.frame : null
    },
    clear() {
      remembered = null
    }
  }
}

/** The app's one source slot: written by the Discover card, read by the match surfaces. */
export const matchFlightSources = createMatchFlightSourceStore()
