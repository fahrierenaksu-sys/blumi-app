import { randomUUID } from "node:crypto"
import { createCatLocalClock, type CatLocalClock } from "./catTripClock"
import { deferPastQuietHours, deriveCatTripPhase, type QuietHoursWindow } from "./catTripPhase"
import {
  classifyTripKind,
  pickDestination,
  pickReturnState,
  pickSouvenir,
  planTripWindows,
  pushJitterMs
} from "./catTripPlanner"
import {
  createCatTripPrefsStore,
  createInMemoryCatTripPrefsRepository,
  pickPrefs,
  type CatTripPrefs,
  type CatTripPrefsPatch,
  type CatTripPrefsStore
} from "./catTripPrefs"
import type { CatTripRepository, NewCatTrip } from "./catTripRepository"
import { createCatTripSeed, type CatTripSeed } from "./catTripSeed"
import {
  CAT_CANDIDATE_WINDOW_MS,
  CAT_PLAN_VERSION,
  CAT_PUSHES_PER_DAY,
  CAT_TRIP_MAX_MS,
  CAT_TRIP_RETENTION_MS,
  type CatReturnState,
  type CatSouvenirRarity,
  type CatTripCandidate,
  type CatTripEndReason,
  type CatTripPhase,
  type CatTripKind,
  type CatTripRecord,
  type CatTripRole
} from "./catTripTypes"

const DAY_MS = 24 * 60 * 60_000
const RECENT_RETURN_MS = 7 * DAY_MS
const MAX_PENDING_REVEALS = 5
const SOUVENIR_SHELF_LIMIT = 40
/** A teaser whose moment passed longer ago than this is not sent: it would be a stale surprise. */
const STALE_TEASER_MS = 60 * 60_000

export interface CatUserTimeSettings {
  timeZone?: string | null
  utcOffsetMinutes?: number
  quietHours: QuietHoursWindow | null
}

/** What the service needs from the rest of the server. Every answer is the server's own record. */
export interface CatTripWorld {
  /** Chat message counts per partner in [since, until]. Counts only. */
  countMessagesByPartner(userId: string, since: Date, until: Date): Promise<readonly CatTripCandidate[]>
  isMutualMatch(userAId: string, userBId: string): Promise<boolean>
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
  /** False for banned, suspended or deleted accounts. */
  isUserActive(userId: string, now: Date): Promise<boolean>
  /** Whether the user has the room cat. */
  hasCat(userId: string): Promise<boolean>
  getTimeSettings(userId: string): Promise<CatUserTimeSettings>
  /** Queues one teaser push (copy is the notification policy's) to be delivered at `availableAt`. */
  queueTeaser(input: { userId: string; role: CatTripRole; tripId: string; availableAt: Date }): Promise<void>
}

export interface CatTripServiceOptions {
  repository: CatTripRepository
  world: CatTripWorld
  /** The feature flag (BLUMI_CAT_TRIPS_ENABLED). */
  enabled: boolean
  /** Keys the seed. Anyone without it cannot predict or replay a draw. */
  seedSecret: string
  /** Whether migration 077 is applied. Undefined: assumed applied (tests, memory mode). */
  schema?: { isReady(): Promise<boolean> }
  now?: () => Date
  createId?: () => string
  /** Counts and outcome codes only. */
  report?: (event: string, fields?: Record<string, number | string>) => void
  /** The members' own switches (migration 079). Default: an in-memory store. */
  prefs?: CatTripPrefsStore
}

export type CatPrefsResult = { enabled: false } | { enabled: true; prefs: CatTripPrefs }
export type CatPrefsUpdateResult =
  | { outcome: "disabled" }
  | { outcome: "unavailable" }
  | { outcome: "saved"; prefs: CatTripPrefs }

export interface CatSouvenirView { key: string; rarity: CatSouvenirRarity }

export interface CatOwnerTripView {
  tripId: string
  kind: CatTripKind
  phase: Extract<CatTripPhase, "away" | "home">
  /** When the cat is back (or was). */
  returnsAt: string
  returnState?: CatReturnState
  /** Set once the cat is home. */
  souvenir?: CatSouvenirView
  revealed: boolean
  /** Only once the cat is home and the owner opened the reveal; never while it is away. */
  counterpartUserId?: string
}

export interface CatGuestView {
  tripId: string
  arrivedAt: string
  leavesAt: string
  /** The host tapped the cat: the collar tag flipped. */
  ownerRevealed: boolean
  ownerUserId?: string
}

export type CatStateResult =
  | { enabled: false }
  | {
      enabled: true
      serverTime: string
      /** "away" while a trip is under way, otherwise "home". */
      catPhase: "home" | "away"
      currentTrip: CatOwnerTripView | null
      pendingReveals: CatOwnerTripView[]
      souvenirs: Array<CatSouvenirView & { souvenirId: string; tripId: string | null; acquiredAt: string }>
    }

export type CatRevealResult =
  | { outcome: "disabled" }
  | { outcome: "not_found" }
  | { outcome: "not_yet" }
  | { outcome: "revealed"; tripId: string; role: CatTripRole; counterpartUserId: string }

export interface CatTripService {
  isEnabled(): Promise<boolean>
  getPrefs(userId: string): Promise<CatPrefsResult>
  /** Turning travel or hosting off sends any cat that is away right now home. */
  updatePrefs(userId: string, patch: CatTripPrefsPatch): Promise<CatPrefsUpdateResult>
  getState(userId: string): Promise<CatStateResult>
  getCurrentTrip(userId: string): Promise<{ enabled: false } | { enabled: true; currentTrip: CatOwnerTripView | null }>
  listGuests(userId: string): Promise<{ enabled: false } | { enabled: true; guests: CatGuestView[] }>
  acknowledgeReveal(userId: string, tripId: string): Promise<CatRevealResult>
  /** Right before a queued teaser goes out: is the trip it announces still on? */
  isTeaserCurrent(userId: string, tripId: string, role: CatTripRole): Promise<boolean>
  /** Block, unmatch or removal: the cat comes home at once. Safe to call when the feature is off. */
  endTripsBetween(userAId: string, userBId: string, reason: CatTripEndReason): Promise<number>
  /** Deletes trips older than the retention window (90 days). Runs whenever the tables exist, even with the flag off. */
  purgeExpired(): Promise<number>
  /** Erases everything a user owns or hosts (account deletion). Runs whenever the tables exist, even with the flag off. */
  deleteUserData(userId: string): Promise<number>
}

/** Bounds the per-process memo of granted souvenirs. */
const SOUVENIR_MEMO_MAX = 10_000

export function createCatTripService(options: CatTripServiceOptions): CatTripService {
  const { repository, world } = options
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? (() => `cat_${randomUUID()}`)
  const report = options.report ?? (() => undefined)
  const prefs = options.prefs ?? createCatTripPrefsStore(createInMemoryCatTripPrefsRepository())
  /** Days this process knows are planned, so a read costs no query. */
  const plannedDays = new Set<string>()

  async function isReady(): Promise<boolean> {
    if (!options.enabled) return false
    return options.schema ? options.schema.isReady() : true
  }

  /** The tables exist (migration 077 applied), whatever the feature flag says: data is erased either way. */
  async function tablesExist(): Promise<boolean> {
    return options.schema ? options.schema.isReady() : true
  }

  async function clockFor(userId: string): Promise<{ clock: CatLocalClock; settings: CatUserTimeSettings }> {
    const settings = await world.getTimeSettings(userId)
    const clock = createCatLocalClock({ timeZone: settings.timeZone, utcOffsetMinutes: settings.utcOffsetMinutes })
    return { clock, settings }
  }

  /**
   * One request's answers, keyed by its `at` instant: every check of a member or a pair runs once per
   * request, not once per window and trip (the planner asks about the same owner for every partner).
   */
  const requestMemos = new WeakMap<Date, Map<string, Promise<unknown>>>()
  function once<T>(at: Date, key: string, read: () => Promise<T>): Promise<T> {
    let memo = requestMemos.get(at)
    if (!memo) {
      memo = new Map()
      requestMemos.set(at, memo)
    }
    const found = memo.get(key)
    if (found) return found as Promise<T>
    const created = read()
    memo.set(key, created)
    return created
  }
  const isActive = (userId: string, at: Date) => once(at, `active|${userId}`, () => world.isUserActive(userId, at))
  const hasCat = (userId: string, at: Date) => once(at, `cat|${userId}`, () => world.hasCat(userId))
  const prefsOf = (userId: string, at: Date) => once(at, `prefs|${userId}`, () => prefs.read(userId))

  /** Why the pair may not travel together now, or null when it may. */
  async function pairProblem(ownerUserId: string, hostUserId: string, at: Date): Promise<CatTripEndReason | null> {
    return once(at, `pair|${ownerUserId}|${hostUserId}`, async () => {
      if (await world.hasBlockBetween(ownerUserId, hostUserId)) return "block"
      if (!(await isActive(ownerUserId, at)) || !(await isActive(hostUserId, at))) return "account"
      if (!(await world.isMutualMatch(ownerUserId, hostUserId))) return "unmatch"
      if (!(await hasCat(ownerUserId, at)) || !(await hasCat(hostUserId, at))) return "ineligible"
      // The owner turned travel off, or the host turned guests off: silently not eligible.
      if (!(await prefsOf(ownerUserId, at)).travelEnabled || !(await prefsOf(hostUserId, at)).hostEnabled) return "ineligible"
      return null
    })
  }

  async function candidatesFor(ownerUserId: string, since: Date, until: Date, at: Date): Promise<CatTripCandidate[]> {
    const counted = await world.countMessagesByPartner(ownerUserId, since, until)
    const eligible: CatTripCandidate[] = []
    for (const candidate of counted) {
      if (candidate.messageCount > 0 && await pairProblem(ownerUserId, candidate.partnerUserId, at) === null) {
        eligible.push(candidate)
      }
    }
    return eligible
  }

  async function ensurePlanned(ownerUserId: string, at: Date): Promise<void> {
    const { clock } = await clockFor(ownerUserId)
    const dayKey = clock.dayKey(at.getTime())
    const memoKey = `${ownerUserId}|${dayKey}`
    if (plannedDays.has(memoKey)) return
    if (await repository.isDayPlanned(ownerUserId, dayKey)) {
      plannedDays.add(memoKey)
      return
    }
    if (!(await isActive(ownerUserId, at)) || !(await hasCat(ownerUserId, at))) return
    // Travel off: nothing is planned, so turning it back on later today still plans the day.
    if (!(await prefsOf(ownerUserId, at)).travelEnabled) return

    const seed = createCatTripSeed(options.seedSecret, ownerUserId, dayKey)
    const dayStartMs = clock.dayStartMs(dayKey)
    const dayEndMs = clock.dayEndMs(dayKey)
    const carried = (await repository.listOwnerTrips(ownerUserId, new Date(dayStartMs - CAT_TRIP_MAX_MS).toISOString()))
      .filter((trip) => trip.status === "scheduled")
      .map((trip) => ({ startsAtMs: Date.parse(trip.startsAt), endsAtMs: Date.parse(trip.endsAt) }))
    const windows = planTripWindows({ seed, dayStartMs, dayEndMs, busy: carried })

    const trips: NewCatTrip[] = []
    for (const window of windows) {
      // A trip already in the past is judged by who the user was chatting with then, not now.
      const until = new Date(Math.min(window.startsAtMs, at.getTime()))
      const since = new Date(until.getTime() - CAT_CANDIDATE_WINDOW_MS)
      const candidates = await candidatesFor(ownerUserId, since, until, at)
      const pick = pickDestination(seed, window.slot, candidates)
      if (!pick) continue
      const returnState = pickReturnState(seed, window.slot)
      trips.push({
        tripId: createId(),
        ownerUserId,
        hostUserId: pick.partnerUserId,
        dayKey,
        slot: window.slot,
        startsAt: new Date(window.startsAtMs).toISOString(),
        endsAt: new Date(window.endsAtMs).toISOString(),
        kind: classifyTripKind(window, clock),
        ...(returnState ? { returnState } : {}),
        seedDigest: seed.digest,
        candidateCount: candidates.length,
        planVersion: CAT_PLAN_VERSION,
        createdAt: at.toISOString()
      })
    }
    const { created } = await repository.planDay({
      ownerUserId, dayKey, seedDigest: seed.digest, plannedAt: at.toISOString(), trips
    })
    plannedDays.add(memoKey)
    if (!created) return
    report("cat_trips_planned", { trips: trips.length })
    for (const trip of trips) await scheduleTeasers(trip, seed, at)
  }

  async function scheduleTeasers(trip: NewCatTrip, seed: CatTripSeed, at: Date): Promise<void> {
    const startsAt = Date.parse(trip.startsAt)
    const endsAt = Date.parse(trip.endsAt)
    const ownerWanted = endsAt + pushJitterMs(seed, `owner:${trip.slot}`, 20 * 60_000)
    const hostWanted = startsAt + 5 * 60_000 + pushJitterMs(seed, `host:${trip.slot}`, 25 * 60_000)
    const sides: Array<{ role: CatTripRole; userId: string; wantedMs: number; mustBeBeforeMs: number }> = [
      { role: "owner", userId: trip.ownerUserId, wantedMs: ownerWanted, mustBeBeforeMs: Number.POSITIVE_INFINITY },
      // A guest teaser after the cat left would be a lie.
      { role: "host", userId: trip.hostUserId, wantedMs: hostWanted, mustBeBeforeMs: endsAt - 30 * 60_000 }
    ]
    for (const side of sides) {
      try {
        if (!(await prefs.read(side.userId)).pushEnabled) {
          report("cat_push_dropped", { reason: "opted_out" })
          continue
        }
        const { clock, settings } = await clockFor(side.userId)
        const deferred = deferPastQuietHours(side.wantedMs, settings.quietHours, clock.minuteOfDay)
        if (deferred >= side.mustBeBeforeMs || deferred < at.getTime() - STALE_TEASER_MS) {
          report("cat_push_dropped", { reason: deferred >= side.mustBeBeforeMs ? "too_late" : "stale" })
          continue
        }
        const dayKey = clock.dayKey(deferred)
        const reserved = await repository.reserveTeaser({
          tripId: trip.tripId,
          role: side.role,
          at: new Date(deferred).toISOString(),
          dayStart: new Date(clock.dayStartMs(dayKey)).toISOString(),
          dayEnd: new Date(clock.dayEndMs(dayKey)).toISOString(),
          cap: CAT_PUSHES_PER_DAY
        })
        if (!reserved) {
          report("cat_push_dropped", { reason: "daily_cap" })
          continue
        }
        await world.queueTeaser({
          userId: side.userId,
          role: side.role,
          tripId: trip.tripId,
          availableAt: new Date(Math.max(deferred, at.getTime()))
        })
        report("cat_push_scheduled", { role: side.role })
      } catch {
        // A teaser is a courtesy: the plan stands even if the push cannot be queued.
        report("cat_push_dropped", { reason: "queue_failed" })
      }
    }
  }

  /** Cancels a trip whose pair no longer qualifies; returns the trip as it now stands. */
  async function revalidate(trip: CatTripRecord, at: Date): Promise<CatTripRecord> {
    if (trip.status !== "scheduled" || at.getTime() >= Date.parse(trip.endsAt)) return trip
    const problem = await pairProblem(trip.ownerUserId, trip.hostUserId, at)
    if (!problem) return trip
    const ended = await repository.endTrip({ tripId: trip.tripId, endedAt: at.toISOString(), reason: problem })
    report("cat_trip_cancelled", { reason: problem })
    return ended ?? trip
  }

  /** A souvenir never changes once granted, so each finished trip writes it once per process, not on every read. */
  const grantedSouvenirs = new Map<string, CatSouvenirView>()
  async function souvenirFor(trip: CatTripRecord): Promise<CatSouvenirView> {
    const known = grantedSouvenirs.get(trip.tripId)
    if (known) return known
    const view = await grantSouvenirOnce(trip)
    if (grantedSouvenirs.size >= SOUVENIR_MEMO_MAX) {
      const oldest = grantedSouvenirs.keys().next().value
      if (oldest !== undefined) grantedSouvenirs.delete(oldest)
    }
    grantedSouvenirs.set(trip.tripId, view)
    return view
  }

  async function grantSouvenirOnce(trip: CatTripRecord): Promise<CatSouvenirView> {
    const seed = createCatTripSeed(options.seedSecret, trip.ownerUserId, trip.dayKey)
    const drawn = pickSouvenir(seed, trip.slot)
    const stored = await repository.grantSouvenir({
      souvenirId: createId(), ownerUserId: trip.ownerUserId, tripId: trip.tripId,
      key: drawn.key, rarity: drawn.rarity, acquiredAt: trip.endsAt
    })
    return { key: stored.key, rarity: stored.rarity }
  }

  async function ownerView(trip: CatTripRecord, at: Date): Promise<CatOwnerTripView | null> {
    const phase = deriveCatTripPhase(trip, at.getTime())
    if (phase !== "away" && phase !== "home") return null
    const revealed = Boolean(trip.ownerRevealedAt)
    const view: CatOwnerTripView = {
      tripId: trip.tripId,
      kind: trip.kind,
      phase,
      returnsAt: trip.endsAt,
      ...(phase === "home" && trip.returnState ? { returnState: trip.returnState } : {}),
      revealed
    }
    if (phase === "home") {
      view.souvenir = await souvenirFor(trip)
      if (revealed && await pairProblem(trip.ownerUserId, trip.hostUserId, at) === null) view.counterpartUserId = trip.hostUserId
    }
    return view
  }

  async function ownerTrips(userId: string, at: Date): Promise<CatTripRecord[]> {
    const listed = await repository.listOwnerTrips(userId, new Date(at.getTime() - RECENT_RETURN_MS).toISOString())
    return Promise.all(listed.map((trip) => revalidate(trip, at)))
  }

  return {
    isEnabled: isReady,

    async getPrefs(userId) {
      if (!(await isReady())) return { enabled: false }
      return { enabled: true, prefs: await prefs.read(userId) }
    },

    async updatePrefs(userId, patch) {
      if (!(await isReady())) return { outcome: "disabled" }
      const at = now()
      const saved = await prefs.write(userId, pickPrefs(patch), at.toISOString())
      if (!saved) return { outcome: "unavailable" }
      if (!saved.travelEnabled || !saved.hostEnabled) {
        // Revalidating ends every trip the new switch no longer allows.
        const owned = saved.travelEnabled ? [] : await repository.listOwnerTrips(userId, at.toISOString())
        const hosted = saved.hostEnabled ? [] : await repository.listHostTrips(userId, at.toISOString())
        for (const trip of [...owned, ...hosted]) await revalidate(trip, at)
      }
      return { outcome: "saved", prefs: saved }
    },

    async getState(userId) {
      if (!(await isReady())) return { enabled: false }
      const at = now()
      await ensurePlanned(userId, at)
      const trips = await ownerTrips(userId, at)
      const views: CatOwnerTripView[] = []
      for (const trip of trips) {
        const view = await ownerView(trip, at)
        if (view) views.push(view)
      }
      const currentTrip = views.find((view) => view.phase === "away") ?? null
      const pendingReveals = views.filter((view) => view.phase === "home" && !view.revealed)
        .sort((a, b) => Date.parse(b.returnsAt) - Date.parse(a.returnsAt)).slice(0, MAX_PENDING_REVEALS)
      const shelf = await repository.listSouvenirs(userId, SOUVENIR_SHELF_LIMIT)
      return {
        enabled: true,
        serverTime: at.toISOString(),
        catPhase: currentTrip ? "away" : "home",
        currentTrip,
        pendingReveals,
        souvenirs: shelf.map((entry) => ({
          souvenirId: entry.souvenirId, tripId: entry.tripId, key: entry.key, rarity: entry.rarity, acquiredAt: entry.acquiredAt
        }))
      }
    },

    async getCurrentTrip(userId) {
      if (!(await isReady())) return { enabled: false }
      const at = now()
      await ensurePlanned(userId, at)
      for (const trip of await ownerTrips(userId, at)) {
        const view = await ownerView(trip, at)
        if (view?.phase === "away") return { enabled: true, currentTrip: view }
      }
      return { enabled: true, currentTrip: null }
    },

    async listGuests(userId) {
      if (!(await isReady())) return { enabled: false }
      const at = now()
      const listed = await repository.listHostTrips(userId, at.toISOString())
      const guests: CatGuestView[] = []
      for (const original of listed) {
        const trip = await revalidate(original, at)
        if (deriveCatTripPhase(trip, at.getTime()) !== "away") continue
        const ownerRevealed = Boolean(trip.hostRevealedAt)
        guests.push({
          tripId: trip.tripId,
          arrivedAt: trip.startsAt,
          leavesAt: trip.endsAt,
          ownerRevealed,
          ...(ownerRevealed ? { ownerUserId: trip.ownerUserId } : {})
        })
      }
      return { enabled: true, guests }
    },

    async acknowledgeReveal(userId, tripId) {
      if (!(await isReady())) return { outcome: "disabled" }
      const at = now()
      const found = await repository.findTrip(tripId)
      if (!found || (found.ownerUserId !== userId && found.hostUserId !== userId)) return { outcome: "not_found" }
      const role: CatTripRole = found.ownerUserId === userId ? "owner" : "host"
      const trip = await revalidate(found, at)
      const phase = deriveCatTripPhase(trip, at.getTime())
      // A cancelled trip is gone for both sides; so is a trip that has not begun.
      if (phase === "cancelled" || phase === "upcoming") return { outcome: "not_found" }
      // The owner learns the host's name only once the cat is home: until then it is a mystery.
      if (role === "owner" && phase !== "home") return { outcome: "not_yet" }
      const counterpartUserId = role === "owner" ? trip.hostUserId : trip.ownerUserId
      if (await pairProblem(trip.ownerUserId, trip.hostUserId, at) !== null) return { outcome: "not_found" }
      await repository.markRevealed({ tripId, role, at: at.toISOString() })
      return { outcome: "revealed", tripId, role, counterpartUserId }
    },

    async isTeaserCurrent(userId, tripId, role) {
      if (!(await isReady())) return false
      const found = await repository.findTrip(tripId)
      const party = role === "owner" ? found?.ownerUserId : found?.hostUserId
      if (!found || party !== userId) return false
      // Checked again at send time: the member may have turned cat news off since.
      if (!(await prefs.read(userId)).pushEnabled) return false
      const at = now()
      const trip = await revalidate(found, at)
      const phase = deriveCatTripPhase(trip, at.getTime())
      // The guest is announced only while the cat is there; the owner's note only for a trip that happened.
      return role === "host" ? phase === "away" : phase === "home" || phase === "away"
    },

    async endTripsBetween(userAId, userBId, reason) {
      if (!(await isReady())) return 0
      const ended = await repository.endTripsBetween({ userAId, userBId, endedAt: now().toISOString(), reason })
      if (ended > 0) report("cat_trip_cancelled", { reason, count: ended })
      return ended
    },

    async purgeExpired() {
      if (!(await tablesExist())) return 0
      return repository.purgeCreatedBefore(new Date(now().getTime() - CAT_TRIP_RETENTION_MS).toISOString())
    },

    async deleteUserData(userId) {
      if (!(await tablesExist())) return 0
      const removed = await repository.deleteUserData(userId)
      return removed + await prefs.deleteUser(userId)
    }
  }
}
