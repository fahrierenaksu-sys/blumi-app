import type { FlightFrame } from "./flightModel"

/**
 * Flights in the air (ui/flight/FlightLayer). Plain module, no React Native
 * imports, so the matching rules are unit tested.
 *
 * A flight starts at a measured source frame and waits for its target: the
 * first view that claims it by `channel` and `match` (for chat send: the
 * thread, and the message body). Claims are first in, first out, so rapid
 * sends of the same text land in order. The target stays hidden while it is
 * claimed and is always revealed when the flight ends, lands or not.
 */

export interface FlightSurface {
  readonly backgroundColor: string
  readonly borderColor?: string
  readonly borderWidth?: number
  readonly radius: number
}

export interface FlightRequest<Content = unknown> {
  readonly channel: string
  readonly match: string
  readonly source: FlightFrame
  readonly sourceSurface: FlightSurface
  readonly targetSurface: FlightSurface
  /** Drawn at the source frame and carried along (for example, the sent text). */
  readonly content?: Content
  /**
   * "fade" (default): the content keeps its size and fades as the target
   * surface takes over (the sent words). "carry": the content itself is the
   * hero (a chibi): it scales with the frame, keeping its aspect ratio, and
   * stays fully visible until the target is revealed under it.
   */
  readonly contentMode?: "fade" | "carry"
  /**
   * The FlightLayer that draws it (default "root", the app root). A native
   * modal sits above the root layer, so it mounts its own named layer.
   */
  readonly layer?: string
  /**
   * Called once: `true` in the frame the clone lands on its target (the
   * contact moment, for a haptic), `false` when the flight ends without
   * landing (no target, off screen, unmounted). Never delays anything.
   */
  readonly onSettled?: (landed: boolean) => void
}

export interface FlightTarget<Handle = unknown> {
  readonly handle: Handle
  /** Shows the target (the clone has landed, or the flight was abandoned). */
  readonly reveal: () => void
}

export interface Flight<Content = unknown> extends FlightRequest<Content> {
  readonly id: string
  readonly claimed: boolean
}

interface FlightEntry {
  flight: Flight
  target: FlightTarget | null
  listeners: Set<() => void>
  settled: boolean
}

export interface FlightStore {
  launch(request: FlightRequest): string
  /** Claims the oldest unclaimed flight for `channel` + `match`; null when none waits. */
  claim(channel: string, match: string): string | null
  attachTarget(id: string, target: FlightTarget): void
  /** The target left the screen before landing: the flight is abandoned. */
  detachTarget(id: string): void
  getTarget(id: string): FlightTarget | null
  /** The clone touched its target: reports the contact once (see `onSettled`). */
  land(id: string): void
  /** Ends a flight and reveals its target. Safe to call more than once. */
  finish(id: string): void
  getFlights(): readonly Flight[]
  subscribe(listener: () => void): () => void
  subscribeToFlight(id: string, listener: () => void): () => void
}

export function createFlightStore(createId: () => string = createDefaultIdFactory()): FlightStore {
  const entries = new Map<string, FlightEntry>()
  const listeners = new Set<() => void>()
  let flights: readonly Flight[] = Object.freeze([])

  const publish = () => {
    flights = Object.freeze([...entries.values()].map((entry) => entry.flight))
    for (const listener of [...listeners]) listener()
  }
  const settle = (entry: FlightEntry, landed: boolean) => {
    if (entry.settled) return
    entry.settled = true
    entry.flight.onSettled?.(landed)
  }
  const notifyFlight = (entry: FlightEntry) => {
    for (const listener of [...entry.listeners]) listener()
  }

  const store: FlightStore = {
    launch(request) {
      const id = createId()
      entries.set(id, {
        flight: Object.freeze({ ...request, id, claimed: false }),
        target: null,
        listeners: new Set(),
        settled: false
      })
      publish()
      return id
    },
    claim(channel, match) {
      for (const entry of entries.values()) {
        const { flight } = entry
        if (flight.claimed || flight.channel !== channel || flight.match !== match) continue
        entry.flight = Object.freeze({ ...flight, claimed: true })
        return flight.id
      }
      return null
    },
    attachTarget(id, target) {
      const entry = entries.get(id)
      if (!entry) {
        // The flight already ended: the target must not stay hidden.
        target.reveal()
        return
      }
      entry.target = target
      notifyFlight(entry)
    },
    detachTarget(id) {
      const entry = entries.get(id)
      if (!entry || !entry.target) return
      entry.target = null
      store.finish(id)
    },
    getTarget(id) {
      return entries.get(id)?.target ?? null
    },
    land(id) {
      const entry = entries.get(id)
      if (entry) settle(entry, true)
    },
    finish(id) {
      const entry = entries.get(id)
      if (!entry) return
      settle(entry, false)
      entries.delete(id)
      entry.target?.reveal()
      entry.target = null
      notifyFlight(entry)
      entry.listeners.clear()
      publish()
    },
    getFlights() {
      return flights
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    subscribeToFlight(id, listener) {
      const entry = entries.get(id)
      if (!entry) return () => undefined
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
      }
    }
  }
  return store
}

function createDefaultIdFactory(): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `flight-${counter}`
  }
}

/** The app's one flight store; the root FlightLayer draws it. */
export const flightStore = createFlightStore()
