import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { findThreadForPartner } from "../chat/chatStore"
import type { SessionActor } from "../session/sessionModel"
import { acknowledgeCatReveal, fetchCatGuests, fetchCatState } from "./catTripApi"
import { firstName } from "./catTripCopy"
import { IS_BLUMI_CAT_TRIPS_ENABLED } from "./catTripFlag"
import {
  isOwnCatAway,
  localDayKey,
  pickCatReveal,
  type CatGuests,
  type CatReveal,
  type CatState
} from "./catTripModel"

/** Reveals closed with "Sonra", per local day; the next day starts empty. */
const dismissedByDay = new Map<string, Set<string>>()

function dismissedToday(): Set<string> {
  const key = localDayKey(new Date())
  for (const day of dismissedByDay.keys()) if (day !== key) dismissedByDay.delete(day)
  const existing = dismissedByDay.get(key)
  if (existing) return existing
  const created = new Set<string>()
  dismissedByDay.set(key, created)
  return created
}

export interface CatCounterpart {
  readonly name: string | null
  readonly threadId: string | null
}

/** The other member as this device already knows them from the chat list; never fetched by id. */
export function resolveCatCounterpart(userId: string): CatCounterpart {
  const thread = findThreadForPartner(userId)
  const participant = thread?.participants.find((entry) => entry.userId === userId)
  return { name: firstName(participant?.displayName), threadId: thread?.threadId ?? null }
}

/**
 * The traveling cat for My Room: what the server decided (own cat away or
 * home, keepsakes, a guest) and the one reveal to show on this focus. Off
 * (flag, demo session or server) it requests nothing and returns nothing.
 */
export function useCatTrips(input: { sessionActor: SessionActor; isFocused: boolean; isEnabled?: boolean }) {
  const { sessionActor, isFocused } = input
  const isEnabled = (input.isEnabled ?? IS_BLUMI_CAT_TRIPS_ENABLED) && sessionActor.session.mode === "production"
  const token = sessionActor.session.sessionToken
  const [state, setState] = useState<CatState | null>(null)
  const [guests, setGuests] = useState<CatGuests | null>(null)
  // A copy of today's "Sonra" set, so a dismissal re-renders and a new focus picks up a new day.
  const [dismissedTripIds, setDismissedTripIds] = useState<ReadonlySet<string>>(() => new Set(dismissedToday()))
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    if (!isEnabled || !token) return
    const current = (generation.current += 1)
    setDismissedTripIds(new Set(dismissedToday()))
    const [nextState, nextGuests] = await Promise.allSettled([
      fetchCatState(MOBILE_HTTP_BASE_URL, token),
      fetchCatGuests(MOBILE_HTTP_BASE_URL, token)
    ])
    if (current !== generation.current) return
    // A failed read keeps the room as it was; the cat is a courtesy, never a blocker.
    if (nextState.status === "fulfilled") setState(nextState.value)
    if (nextGuests.status === "fulfilled") setGuests(nextGuests.value)
  }, [isEnabled, token])

  useEffect(() => {
    if (isFocused) void refresh()
  }, [isFocused, refresh])

  useEffect(() => {
    if (isEnabled) return
    generation.current += 1
    setState(null)
    setGuests(null)
  }, [isEnabled])

  const reveal: CatReveal | null = useMemo(
    () => pickCatReveal({ isEnabled, state, guests, dismissedTripIds }),
    [isEnabled, state, guests, dismissedTripIds]
  )

  const dismiss = useCallback((tripId: string) => {
    dismissedToday().add(tripId)
    setDismissedTripIds(new Set(dismissedToday()))
  }, [])

  const acknowledge = useCallback(async (tripId: string): Promise<CatCounterpart | null> => {
    if (!isEnabled || !token) return null
    const result = await acknowledgeCatReveal(MOBILE_HTTP_BASE_URL, token, tripId)
    return result ? resolveCatCounterpart(result.counterpartUserId) : null
  }, [isEnabled, token])

  return {
    isEnabled,
    isOwnCatAway: isOwnCatAway(isEnabled, state),
    hasGuest: Boolean(guests?.enabled && guests.guests.length > 0),
    souvenirs: state?.enabled ? state.souvenirs : [],
    reveal,
    acknowledge,
    dismiss,
    refresh
  }
}
