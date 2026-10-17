import type { CatTripPhase, CatTripRecord } from "./catTripTypes"

/** Where the cat is, from the stored trip and the clock. Nothing but `status` is ever written for it. */
export function deriveCatTripPhase(trip: Pick<CatTripRecord, "status" | "startsAt" | "endsAt">, nowMs: number): CatTripPhase {
  if (trip.status === "cancelled") return "cancelled"
  if (nowMs < Date.parse(trip.startsAt)) return "upcoming"
  return nowMs < Date.parse(trip.endsAt) ? "away" : "home"
}

export interface QuietHoursWindow { startMinute: number; endMinute: number }

export function isInsideQuietHours(minuteOfDay: number, quiet: QuietHoursWindow | null): boolean {
  if (!quiet) return false
  return quiet.startMinute < quiet.endMinute
    ? minuteOfDay >= quiet.startMinute && minuteOfDay < quiet.endMinute
    : minuteOfDay >= quiet.startMinute || minuteOfDay < quiet.endMinute
}

const QUIET_STEP_MS = 5 * 60_000

/** The first moment at or after `atMs` that is outside quiet hours (a push waits, it is not dropped). */
export function deferPastQuietHours(
  atMs: number,
  quiet: QuietHoursWindow | null,
  minuteOfDay: (ms: number) => number
): number {
  let at = atMs
  for (let steps = 0; steps < (24 * 60 * 60_000) / QUIET_STEP_MS; steps += 1) {
    if (!isInsideQuietHours(minuteOfDay(at), quiet)) return at
    at += QUIET_STEP_MS
  }
  return at
}
