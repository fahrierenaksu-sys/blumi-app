import type {
  CatSouvenirRecord,
  CatTripEndReason,
  CatTripRecord,
  CatTripRole
} from "./catTripTypes"

export type NewCatTrip = Omit<
  CatTripRecord,
  "status" | "endedAt" | "endReason" | "ownerRevealedAt" | "hostRevealedAt" | "ownerPushAt" | "hostPushAt"
>

/**
 * Storage for the traveling cat. The in-memory and PostgreSQL implementations
 * must behave the same (catTripRepository.contract.test.ts).
 */
export interface CatTripRepository {
  /**
   * Stores one owner's plan for one local day, once. The first call for
   * (owner, day) writes the day marker and the trips (possibly none: the cat
   * stayed home) and returns `created: true`; a later call changes nothing.
   */
  planDay(input: {
    ownerUserId: string
    dayKey: string
    seedDigest: string
    plannedAt: string
    trips: readonly NewCatTrip[]
  }): Promise<{ created: boolean }>
  /** Whether `planDay` already stored a plan (even an empty one) for this owner and day. */
  isDayPlanned(ownerUserId: string, dayKey: string): Promise<boolean>
  findTrip(tripId: string): Promise<CatTripRecord | null>
  /** The owner's trips that end after `endsAfter`, earliest start first. */
  listOwnerTrips(ownerUserId: string, endsAfter: string): Promise<CatTripRecord[]>
  /** Trips hosted by `hostUserId` that end after `endsAfter`, earliest start first. */
  listHostTrips(hostUserId: string, endsAfter: string): Promise<CatTripRecord[]>
  /**
   * Ends a scheduled trip at once (unmatch, block, deleted or restricted
   * account). A trip already cancelled keeps its first reason. Null when the
   * trip does not exist.
   */
  endTrip(input: { tripId: string; endedAt: string; reason: CatTripEndReason }): Promise<CatTripRecord | null>
  /** Ends every scheduled trip between two users that has not ended by `endedAt`; returns how many. */
  endTripsBetween(input: { userAId: string; userBId: string; endedAt: string; reason: CatTripEndReason }): Promise<number>
  /** Records that `role` opened the reveal; the first time wins. Null when the trip does not exist. */
  markRevealed(input: { tripId: string; role: CatTripRole; at: string }): Promise<CatTripRecord | null>
  /**
   * Reserves one teaser push for a trip side at `at`, unless that side already
   * has one or the recipient already has `cap` cat pushes inside
   * [dayStart, dayEnd). Returns whether the push may be sent.
   */
  reserveTeaser(input: {
    tripId: string
    role: CatTripRole
    at: string
    dayStart: string
    dayEnd: string
    cap: number
  }): Promise<boolean>
  /** One souvenir per trip: a repeat returns the stored one. */
  grantSouvenir(souvenir: CatSouvenirRecord): Promise<CatSouvenirRecord>
  listSouvenirs(ownerUserId: string, limit: number): Promise<CatSouvenirRecord[]>
  /** Deletes trips created before `cutoff` (their souvenirs follow); returns the trip count. */
  purgeCreatedBefore(cutoff: string): Promise<number>
}

export function cloneTrip(trip: CatTripRecord): CatTripRecord {
  return { ...trip }
}

export function createInMemoryCatTripRepository(): CatTripRepository {
  const days = new Set<string>()
  const trips = new Map<string, CatTripRecord>()
  const souvenirs = new Map<string, CatSouvenirRecord>()
  const byStart = (a: CatTripRecord, b: CatTripRecord) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.tripId.localeCompare(b.tripId)
  const effectiveEnd = (trip: CatTripRecord) => Date.parse(trip.endedAt ?? trip.endsAt)

  return {
    async planDay(input) {
      const key = `${input.ownerUserId}|${input.dayKey}`
      if (days.has(key)) return { created: false }
      days.add(key)
      for (const trip of input.trips) {
        const { returnState, ...rest } = trip
        trips.set(trip.tripId, { ...rest, ...(returnState ? { returnState } : {}), status: "scheduled" })
      }
      return { created: true }
    },
    async isDayPlanned(ownerUserId, dayKey) {
      return days.has(`${ownerUserId}|${dayKey}`)
    },
    async findTrip(tripId) {
      const trip = trips.get(tripId)
      return trip ? cloneTrip(trip) : null
    },
    async listOwnerTrips(ownerUserId, endsAfter) {
      return [...trips.values()]
        .filter((trip) => trip.ownerUserId === ownerUserId && Date.parse(trip.endsAt) > Date.parse(endsAfter))
        .sort(byStart).map(cloneTrip)
    },
    async listHostTrips(hostUserId, endsAfter) {
      return [...trips.values()]
        .filter((trip) => trip.hostUserId === hostUserId && Date.parse(trip.endsAt) > Date.parse(endsAfter))
        .sort(byStart).map(cloneTrip)
    },
    async endTrip({ tripId, endedAt, reason }) {
      const trip = trips.get(tripId)
      if (!trip) return null
      if (trip.status === "scheduled") {
        trips.set(tripId, { ...trip, status: "cancelled", endedAt, endReason: reason })
      }
      return cloneTrip(trips.get(tripId)!)
    },
    async endTripsBetween({ userAId, userBId, endedAt, reason }) {
      let count = 0
      for (const trip of [...trips.values()]) {
        const samePair = (trip.ownerUserId === userAId && trip.hostUserId === userBId) ||
          (trip.ownerUserId === userBId && trip.hostUserId === userAId)
        if (!samePair || trip.status !== "scheduled" || effectiveEnd(trip) <= Date.parse(endedAt)) continue
        trips.set(trip.tripId, { ...trip, status: "cancelled", endedAt, endReason: reason })
        count += 1
      }
      return count
    },
    async markRevealed({ tripId, role, at }) {
      const trip = trips.get(tripId)
      if (!trip) return null
      const field = role === "owner" ? "ownerRevealedAt" : "hostRevealedAt"
      if (!trip[field]) trips.set(tripId, { ...trip, [field]: at })
      return cloneTrip(trips.get(tripId)!)
    },
    async reserveTeaser({ tripId, role, at, dayStart, dayEnd, cap }) {
      const trip = trips.get(tripId)
      if (!trip) return false
      const field = role === "owner" ? "ownerPushAt" : "hostPushAt"
      if (trip[field]) return false
      const recipient = role === "owner" ? trip.ownerUserId : trip.hostUserId
      const from = Date.parse(dayStart)
      const to = Date.parse(dayEnd)
      let used = 0
      for (const other of trips.values()) {
        for (const [pushAt, user] of [[other.ownerPushAt, other.ownerUserId], [other.hostPushAt, other.hostUserId]] as const) {
          if (user === recipient && pushAt && Date.parse(pushAt) >= from && Date.parse(pushAt) < to) used += 1
        }
      }
      if (used >= cap) return false
      trips.set(tripId, { ...trip, [field]: at })
      return true
    },
    async grantSouvenir(souvenir) {
      const existing = [...souvenirs.values()].find((entry) => entry.tripId === souvenir.tripId)
      if (existing) return { ...existing }
      if (!trips.has(souvenir.tripId)) throw new Error("Unknown cat trip")
      souvenirs.set(souvenir.souvenirId, { ...souvenir })
      return { ...souvenir }
    },
    async listSouvenirs(ownerUserId, limit) {
      return [...souvenirs.values()]
        .filter((entry) => entry.ownerUserId === ownerUserId)
        .sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt) || b.souvenirId.localeCompare(a.souvenirId))
        .slice(0, limit).map((entry) => ({ ...entry }))
    },
    async purgeCreatedBefore(cutoff) {
      let count = 0
      for (const trip of [...trips.values()]) {
        if (Date.parse(trip.createdAt) >= Date.parse(cutoff)) continue
        trips.delete(trip.tripId)
        for (const [id, souvenir] of souvenirs) if (souvenir.tripId === trip.tripId) souvenirs.delete(id)
        count += 1
      }
      return count
    }
  }
}
