import type { CatTripSeed } from "./catTripSeed"
import {
  CAT_TRIP_MAX_MS,
  CAT_TRIP_MIN_GAP_MS,
  CAT_TRIP_MIN_MS,
  CAT_TRIPS_PER_DAY,
  type CatReturnState,
  type CatSouvenirRarity,
  type CatTripCandidate,
  type CatTripInterval,
  type CatTripKind
} from "./catTripTypes"
import type { CatLocalClock } from "./catTripClock"

/** Pure planning rules. No clock, no database: the same inputs always give the same plan. */

const GRID_MS = 5 * 60_000
const MAX_ATTEMPTS = 64
/** A trip that covers this local minute (02:00) is a sleepover. */
const SLEEPOVER_MINUTE = 2 * 60

export interface PlannedTripWindow extends CatTripInterval { slot: number }

function overlaps(a: CatTripInterval, b: CatTripInterval): boolean {
  return a.startsAtMs < b.endsAtMs + CAT_TRIP_MIN_GAP_MS && b.startsAtMs < a.endsAtMs + CAT_TRIP_MIN_GAP_MS
}

/**
 * Up to two trips whose starts fall inside the local day, each 1-8 hours long,
 * never overlapping each other or `busy` (trips that carried over from an
 * earlier day). A trip may end after midnight. The draw is rejection sampling
 * on a fixed number of labelled attempts, so it is replayable; if none fits, a
 * plain back-to-back layout in the first free time is used.
 */
export function planTripWindows(input: {
  seed: CatTripSeed
  dayStartMs: number
  dayEndMs: number
  busy: readonly CatTripInterval[]
}): PlannedTripWindow[] {
  const { seed, dayStartMs, dayEndMs, busy } = input
  const gridCount = Math.floor((dayEndMs - dayStartMs) / GRID_MS)
  const minUnits = CAT_TRIP_MIN_MS / GRID_MS
  const maxUnits = CAT_TRIP_MAX_MS / GRID_MS
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate: CatTripInterval[] = []
    for (let index = 0; index < CAT_TRIPS_PER_DAY; index += 1) {
      const start = dayStartMs + seed.int(`start:${attempt}:${index}`, gridCount) * GRID_MS
      const length = (minUnits + seed.int(`length:${attempt}:${index}`, maxUnits - minUnits + 1)) * GRID_MS
      candidate.push({ startsAtMs: start, endsAtMs: start + length })
    }
    candidate.sort((a, b) => a.startsAtMs - b.startsAtMs)
    const clear = candidate.every((trip) => busy.every((other) => !overlaps(trip, other))) &&
      !overlaps(candidate[0]!, candidate[1]!)
    if (clear) return candidate.map((trip, slot) => ({ ...trip, slot }))
  }
  return fallbackWindows(dayStartMs, dayEndMs, busy)
}

function fallbackWindows(dayStartMs: number, dayEndMs: number, busy: readonly CatTripInterval[]): PlannedTripWindow[] {
  const freeFrom = busy.reduce((latest, other) => Math.max(latest, other.endsAtMs + CAT_TRIP_MIN_GAP_MS), dayStartMs)
  const windows: PlannedTripWindow[] = []
  let cursor = freeFrom
  for (let slot = 0; slot < CAT_TRIPS_PER_DAY; slot += 1) {
    if (cursor >= dayEndMs) break
    windows.push({ slot, startsAtMs: cursor, endsAtMs: cursor + CAT_TRIP_MIN_MS })
    cursor += CAT_TRIP_MIN_MS + CAT_TRIP_MIN_GAP_MS
  }
  return windows
}

export function classifyTripKind(window: CatTripInterval, clock: CatLocalClock): CatTripKind {
  // Walk the trip in 30-minute steps; 02:00 local inside it means a night away.
  for (let at = window.startsAtMs; at <= window.endsAtMs; at += 30 * 60_000) {
    const minute = clock.minuteOfDay(at)
    if (minute >= SLEEPOVER_MINUTE && minute < SLEEPOVER_MINUTE + 30) return "sleepover"
  }
  return "visit"
}

export interface DestinationPick {
  partnerUserId: string
  /** The weight the pick had, for the audit trail. */
  weight: number
}

/** sqrt of the message count, so one chatty pair cannot take every trip. */
export function candidateWeight(messageCount: number): number {
  return Math.sqrt(Math.max(1, messageCount))
}

/**
 * Weighted random pick among candidates, seeded per user, day and slot.
 * Candidates are sorted first, so the input order cannot change the result.
 * Nobody to visit: null, and the cat stays home.
 */
export function pickDestination(
  seed: CatTripSeed,
  slot: number,
  candidates: readonly CatTripCandidate[]
): DestinationPick | null {
  const sorted = candidates
    .filter((candidate) => candidate.messageCount > 0)
    .sort((a, b) => (a.partnerUserId < b.partnerUserId ? -1 : a.partnerUserId > b.partnerUserId ? 1 : 0))
  if (sorted.length === 0) return null
  const weights = sorted.map((candidate) => candidateWeight(candidate.messageCount))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let target = seed.unit(`destination:${slot}`) * total
  for (let index = 0; index < sorted.length; index += 1) {
    target -= weights[index]!
    if (target < 0) return { partnerUserId: sorted[index]!.partnerUserId, weight: weights[index]! }
  }
  const last = sorted.length - 1
  return { partnerUserId: sorted[last]!.partnerUserId, weight: weights[last]! }
}

export const CAT_SOUVENIR_CATALOG: ReadonlyArray<{ key: string; rarity: CatSouvenirRarity }> = Object.freeze([
  { key: "ribbon", rarity: "common" },
  { key: "leaf", rarity: "common" },
  { key: "cushion_feather", rarity: "common" },
  { key: "button", rarity: "common" },
  { key: "pebble", rarity: "common" },
  { key: "bell", rarity: "uncommon" },
  { key: "star_sticker", rarity: "uncommon" },
  { key: "tiny_flower", rarity: "uncommon" },
  { key: "friend_trinket", rarity: "rare" },
  { key: "moon_charm", rarity: "rare" }
])

const RARITY_ODDS: ReadonlyArray<{ rarity: CatSouvenirRarity; cumulative: number }> = [
  { rarity: "common", cumulative: 0.82 },
  { rarity: "uncommon", cumulative: 0.96 },
  { rarity: "rare", cumulative: 1 }
]
const RETURN_STATE_CHANCE = 0.1

/** One cosmetic keepsake per trip. No coins, no inventory item: a shelf entry only. */
export function pickSouvenir(seed: CatTripSeed, slot: number): { key: string; rarity: CatSouvenirRarity } {
  const roll = seed.unit(`souvenir-rarity:${slot}`)
  const rarity = RARITY_ODDS.find((entry) => roll < entry.cumulative)?.rarity ?? "common"
  const pool = CAT_SOUVENIR_CATALOG.filter((entry) => entry.rarity === rarity)
  return pool[seed.int(`souvenir-key:${slot}`, pool.length)]!
}

/** Sometimes the cat comes back in a funny state: a variable reward, never a purchase. */
export function pickReturnState(seed: CatTripSeed, slot: number): CatReturnState | undefined {
  if (seed.unit(`return-state:${slot}`) >= RETURN_STATE_CHANCE) return undefined
  return seed.int(`return-state-kind:${slot}`, 2) === 0 ? "sleepy" : "petals"
}

/** A deterministic wait of 0..maxMs, so teasers do not all fire on the minute. */
export function pushJitterMs(seed: CatTripSeed, label: string, maxMs: number): number {
  return Math.floor(seed.unit(`push-jitter:${label}`) * maxMs)
}
