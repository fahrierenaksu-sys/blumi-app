/**
 * What the server decided about the traveling cat, as the app reads it. The
 * app never picks a destination, a time or a souvenir. Everything that is
 * not well formed is dropped, never guessed.
 */

export type CatTripKind = "visit" | "sleepover"
export type CatReturnState = "sleepy" | "petals"
export type CatSouvenirRarity = "common" | "uncommon" | "rare"

export interface CatSouvenir {
  readonly key: string
  readonly rarity: CatSouvenirRarity
}

export interface CatOwnerTrip {
  readonly tripId: string
  readonly kind: CatTripKind
  readonly phase: "away" | "home"
  readonly returnsAt: string
  readonly returnState?: CatReturnState
  readonly souvenir?: CatSouvenir
  readonly revealed: boolean
}

export interface CatShelfSouvenir extends CatSouvenir {
  readonly souvenirId: string
  readonly acquiredAt: string
}

export type CatState =
  | { readonly enabled: false }
  | {
      readonly enabled: true
      readonly catPhase: "home" | "away"
      readonly currentTrip: CatOwnerTrip | null
      readonly pendingReveals: readonly CatOwnerTrip[]
      readonly souvenirs: readonly CatShelfSouvenir[]
    }

export interface CatGuest {
  readonly tripId: string
  readonly leavesAt: string
  readonly ownerRevealed: boolean
  readonly ownerUserId?: string
}

export type CatGuests = { readonly enabled: false } | { readonly enabled: true; readonly guests: readonly CatGuest[] }

export interface CatPrefs {
  readonly travelEnabled: boolean
  readonly hostEnabled: boolean
  readonly pushEnabled: boolean
}

export type CatPrefsState = { readonly enabled: false } | { readonly enabled: true; readonly prefs: CatPrefs }

const DISABLED = Object.freeze({ enabled: false as const })
const MAX_ID_LENGTH = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null
}

function readTime(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
}

function readSouvenir(value: unknown): CatSouvenir | null {
  if (!isRecord(value)) return null
  const key = readId(value.key)
  const rarity = value.rarity
  if (!key || (rarity !== "common" && rarity !== "uncommon" && rarity !== "rare")) return null
  return { key, rarity }
}

function readOwnerTrip(value: unknown): CatOwnerTrip | null {
  if (!isRecord(value)) return null
  const tripId = readId(value.tripId)
  const returnsAt = readTime(value.returnsAt)
  const { kind, phase } = value
  if (!tripId || !returnsAt) return null
  if (kind !== "visit" && kind !== "sleepover") return null
  if (phase !== "away" && phase !== "home") return null
  const souvenir = readSouvenir(value.souvenir)
  const returnState = value.returnState === "sleepy" || value.returnState === "petals" ? value.returnState : undefined
  return {
    tripId, kind, phase, returnsAt,
    revealed: value.revealed === true,
    ...(returnState ? { returnState } : {}),
    ...(souvenir ? { souvenir } : {})
  }
}

function readList<T>(value: unknown, read: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.map(read).filter((entry): entry is T => entry !== null)
}

/** `GET /v1/cat/state`; null when the payload is not a cat state at all. */
export function parseCatState(payload: unknown): CatState | null {
  if (!isRecord(payload)) return null
  if (payload.enabled === false) return DISABLED
  if (payload.enabled !== true) return null
  const catPhase = payload.catPhase === "away" ? "away" : "home"
  return {
    enabled: true,
    catPhase,
    currentTrip: readOwnerTrip(payload.currentTrip),
    pendingReveals: readList(payload.pendingReveals, readOwnerTrip).filter((trip) => trip.phase === "home"),
    souvenirs: readList(payload.souvenirs, (entry) => {
      const souvenir = readSouvenir(entry)
      if (!souvenir || !isRecord(entry)) return null
      const souvenirId = readId(entry.souvenirId)
      const acquiredAt = readTime(entry.acquiredAt)
      return souvenirId && acquiredAt ? { ...souvenir, souvenirId, acquiredAt } : null
    })
  }
}

/** `GET /v1/cat/guests`. */
export function parseCatGuests(payload: unknown): CatGuests | null {
  if (!isRecord(payload)) return null
  if (payload.enabled === false) return DISABLED
  if (payload.enabled !== true) return null
  return {
    enabled: true,
    guests: readList(payload.guests, (entry) => {
      if (!isRecord(entry)) return null
      const tripId = readId(entry.tripId)
      const leavesAt = readTime(entry.leavesAt)
      if (!tripId || !leavesAt) return null
      const ownerRevealed = entry.ownerRevealed === true
      const ownerUserId = ownerRevealed ? readId(entry.ownerUserId) : null
      return { tripId, leavesAt, ownerRevealed, ...(ownerUserId ? { ownerUserId } : {}) }
    })
  }
}

/** `GET` and `PUT /v1/cat/prefs`. */
export function parseCatPrefs(payload: unknown): CatPrefsState | null {
  if (!isRecord(payload)) return null
  if (payload.enabled === false) return DISABLED
  if (payload.enabled !== true || !isRecord(payload.prefs)) return null
  const { travelEnabled, hostEnabled, pushEnabled } = payload.prefs
  if (typeof travelEnabled !== "boolean" || typeof hostEnabled !== "boolean" || typeof pushEnabled !== "boolean") return null
  return { enabled: true, prefs: { travelEnabled, hostEnabled, pushEnabled } }
}

/** `POST /v1/cat/trips/:tripId/reveal-ack` → whose cat / whose home, by user id. */
export function parseCatRevealAck(payload: unknown): { counterpartUserId: string } | null {
  if (!isRecord(payload)) return null
  const counterpartUserId = readId(payload.counterpartUserId)
  return counterpartUserId ? { counterpartUserId } : null
}

export type CatReveal =
  | { readonly role: "owner"; readonly trip: CatOwnerTrip }
  | { readonly role: "host"; readonly guest: CatGuest }

/**
 * The one reveal the next foreground shows, if any: the owner's own cat that
 * came home first (newest), then a guest cat whose collar tag is still
 * unread. A reveal the member closed with "Sonra" is not shown again on the
 * same local day. With the feature off nothing is shown.
 */
export function pickCatReveal(input: {
  readonly isEnabled: boolean
  readonly state: CatState | null
  readonly guests: CatGuests | null
  readonly dismissedTripIds: ReadonlySet<string>
}): CatReveal | null {
  if (!input.isEnabled) return null
  const { state, guests, dismissedTripIds } = input
  if (state?.enabled) {
    const trip = state.pendingReveals.find((entry) => !entry.revealed && !dismissedTripIds.has(entry.tripId))
    if (trip) return { role: "owner", trip }
  }
  if (guests?.enabled) {
    const guest = guests.guests.find((entry) => !entry.ownerRevealed && !dismissedTripIds.has(entry.tripId))
    if (guest) return { role: "host", guest }
  }
  return null
}

/** While its own cat is on a trip, My Room draws no cat: the basket is empty. */
export function isOwnCatAway(isEnabled: boolean, state: CatState | null): boolean {
  return isEnabled && state?.enabled === true && state.catPhase === "away"
}

/** "Sonra" remembers a reveal for the rest of the member's local day only. */
export function localDayKey(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, "0")
  const day = String(at.getDate()).padStart(2, "0")
  return `${at.getFullYear()}-${month}-${day}`
}
