import type { FlightFrame } from "./flightModel"

/**
 * Where a flight can start from, looked up later by key: a view on screen
 * attaches a synchronous measure while it is shown, and `take` measures it
 * at that moment (during the first render of the landing view, before React
 * detaches the old one). A view that left a moment earlier is remembered
 * for `graceMs`, once. Holds window rectangles only.
 *
 * Fabric measures synchronously; a measure that cannot answer at once
 * returns null and the flight is skipped.
 */

export type MeasureFlightFrame = () => FlightFrame | null

interface DetachedFrame {
  readonly frame: FlightFrame
  readonly at: number
}

export interface LiveFlightSources {
  /** The view is on screen; returns its detach (call when it leaves). */
  attach(key: string, measure: MeasureFlightFrame, now?: () => number): () => void
  /** The view's frame now (or just before it left); null when there is none. */
  take(key: string, now?: number): FlightFrame | null
}

export function createLiveFlightSources(graceMs: number): LiveFlightSources {
  const live = new Map<string, MeasureFlightFrame>()
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

/** A synchronous window measure of a native view (null when it cannot answer now). */
export function measureViewInWindow(view: {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void
} | null): FlightFrame | null {
  let frame: FlightFrame | null = null
  view?.measureInWindow?.((x, y, width, height) => {
    frame = { x, y, width, height }
  })
  return frame
}
