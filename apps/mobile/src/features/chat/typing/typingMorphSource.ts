import type { FlightFrame } from "../../../ui/flight/flightModel"

/**
 * Where the partner's typing dots are, so the message they were typing can
 * grow out of them (typing → bubble morph, ui/flight). The typing bubble
 * attaches a synchronous measure while it is on screen; the store clears it
 * in the same update that delivers the message, so the row that mounts for
 * that message can still measure it during its first render. A bubble that
 * left a moment before the message arrived (typing stopped first) is
 * remembered for a short grace period.
 *
 * Holds window rectangles only, keyed by the conversation's flight channel.
 */

/** Typing that stopped longer ago than this no longer reads as "those dots". */
export const TYPING_MORPH_GRACE_MS = 1_200

type MeasureFrame = () => FlightFrame | null

interface DetachedFrame {
  readonly frame: FlightFrame
  readonly at: number
}

export interface TypingMorphSources {
  /** The bubble is on screen; returns its detach (call when it leaves). */
  attach(key: string, measure: MeasureFrame, now?: () => number): () => void
  /** The dots' frame for a message arriving now; null when there were none. */
  take(key: string, now?: number): FlightFrame | null
}

export function createTypingMorphSources(graceMs: number = TYPING_MORPH_GRACE_MS): TypingMorphSources {
  const live = new Map<string, MeasureFrame>()
  const detached = new Map<string, DetachedFrame>()
  return {
    attach(key, measure, now = Date.now) {
      live.set(key, measure)
      detached.delete(key)
      return () => {
        if (live.get(key) !== measure) return
        live.delete(key)
        const frame = measure()
        if (frame) detached.set(key, { frame, at: now() })
      }
    },
    take(key, now = Date.now()) {
      const measure = live.get(key)
      if (measure) return measure()
      const entry = detached.get(key)
      if (!entry) return null
      detached.delete(key)
      const age = now - entry.at
      return age >= 0 && age <= graceMs ? entry.frame : null
    }
  }
}

/** The app's one registry: the typing bubble writes it, incoming rows read it. */
export const typingMorphSources = createTypingMorphSources()
