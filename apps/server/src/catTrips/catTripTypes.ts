/**
 * "Gezgin kedi": the room cat that travels to a match's room.
 *
 * Everything here is decided by the server. The client never chooses a
 * destination, a time or a souvenir; it only reads the outcome. Behind
 * BLUMI_CAT_TRIPS_ENABLED (default off).
 */

export const CAT_TRIPS_PER_DAY = 2
export const CAT_TRIP_MIN_MS = 60 * 60_000
export const CAT_TRIP_MAX_MS = 8 * 60 * 60_000
/** Quiet time at home between two trips of one cat. */
export const CAT_TRIP_MIN_GAP_MS = 30 * 60_000
/** Chat activity window that makes a match a candidate. */
export const CAT_CANDIDATE_WINDOW_MS = 48 * 60 * 60_000
/** At most this many cat pushes per user per local day, either role. */
export const CAT_PUSHES_PER_DAY = 2
/** Trips older than this are deleted. */
export const CAT_TRIP_RETENTION_MS = 90 * 24 * 60 * 60_000
/** Bumped when the planner's draw rules change, so old rows stay auditable. */
export const CAT_PLAN_VERSION = 1

export type CatTripRole = "owner" | "host"

/** Stored status. "Away" and "home" are derived from the clock, see `deriveCatTripPhase`. */
export type CatTripStatus = "scheduled" | "cancelled"
export type CatTripEndReason = "unmatch" | "block" | "account" | "ineligible"
export type CatTripKind = "visit" | "sleepover"
export type CatTripPhase = "upcoming" | "away" | "home" | "cancelled"
export type CatReturnState = "sleepy" | "petals"

export type CatSouvenirRarity = "common" | "uncommon" | "rare"

export interface CatTripRecord {
  tripId: string
  ownerUserId: string
  hostUserId: string
  /** Local calendar day of the owner the trip was planned for, YYYY-MM-DD. */
  dayKey: string
  /** 0 or 1: the order of the two slots of that day. */
  slot: number
  startsAt: string
  endsAt: string
  kind: CatTripKind
  status: CatTripStatus
  endedAt?: string
  endReason?: CatTripEndReason
  returnState?: CatReturnState
  /** First 16 hex characters of the keyed seed digest: lets the draw be audited without the key. */
  seedDigest: string
  candidateCount: number
  planVersion: number
  ownerRevealedAt?: string
  hostRevealedAt?: string
  /** When each teaser push was scheduled for; undefined when none was. */
  ownerPushAt?: string
  hostPushAt?: string
  createdAt: string
}

export interface CatSouvenirRecord {
  souvenirId: string
  ownerUserId: string
  /** Null once the trip was deleted by retention; the keepsake stays on the shelf. */
  tripId: string | null
  key: string
  rarity: CatSouvenirRarity
  acquiredAt: string
}

/** A slot the planner reserved for a day whose draw found no one to visit: the cat stays home. */
export interface CatTripHomeSlot {
  dayKey: string
  slot: number
}

export interface CatTripCandidate {
  partnerUserId: string
  /** Chat messages either side sent in the candidate window, never their text. */
  messageCount: number
}

export interface CatTripInterval { startsAtMs: number; endsAtMs: number }
