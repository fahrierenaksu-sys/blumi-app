/**
 * One match moment per Discover match on this phone.
 *
 * The swiper learns of a match from the decision response (MatchResult route);
 * both people also get a realtime `connection.matched` keyed `match_<matchId>`
 * (the partner on any screen). The two can arrive in either order, and with
 * simultaneous likes the swiper's own answer can say "not matched" while the
 * partner's like created the match. So a realtime match for a partner whose
 * like is still in flight waits for that like to settle: a matched answer
 * (the route opens) drops it, any other outcome presents it. A match the
 * route already showed is suppressed. State is per account and reset on
 * session end.
 */
export type DiscoveryRealtimeMatchRoute = "present" | "deferred" | "suppressed"

export interface DiscoveryMatchDelivery {
  /** A like decision for this partner started (one per request, retries included). */
  beginLike(accountUserId: string, partnerUserId: string): void
  /** That like settled: the server's match, or null (not matched, refused, failed). */
  settleLike(accountUserId: string, partnerUserId: string, match: { matchId: string } | null): void
  routeRealtimeMatch(
    accountUserId: string,
    event: { miniRoomId: string; partnerUserId: string },
    present: () => void
  ): DiscoveryRealtimeMatchRoute
  reset(): void
}

const DISCOVERY_MATCH_PREFIX = "match_"
const SHOWN_LIMIT = 200

/** The realtime and chat key of a Discover match (`match_<matchId>`). */
export function discoveryMatchMiniRoomId(matchId: string): string {
  return `${DISCOVERY_MATCH_PREFIX}${matchId}`
}

/** The Discover match id of a realtime match, or null for a room connection. */
export function parseDiscoveryMatchId(miniRoomId: string): string | null {
  if (!miniRoomId.startsWith(DISCOVERY_MATCH_PREFIX)) return null
  const matchId = miniRoomId.slice(DISCOVERY_MATCH_PREFIX.length)
  return matchId.length > 0 ? matchId : null
}

interface AccountState {
  inFlight: Map<string, number>
  parked: Map<string, Map<string, () => void>>
  shownByRoute: string[]
}

export function createDiscoveryMatchDelivery(): DiscoveryMatchDelivery {
  let accounts = new Map<string, AccountState>()
  const stateFor = (accountUserId: string): AccountState => {
    let state = accounts.get(accountUserId)
    if (!state) {
      state = { inFlight: new Map(), parked: new Map(), shownByRoute: [] }
      accounts.set(accountUserId, state)
    }
    return state
  }
  return {
    beginLike(accountUserId, partnerUserId) {
      const state = stateFor(accountUserId)
      state.inFlight.set(partnerUserId, (state.inFlight.get(partnerUserId) ?? 0) + 1)
    },
    settleLike(accountUserId, partnerUserId, match) {
      const state = stateFor(accountUserId)
      const remaining = Math.max(0, (state.inFlight.get(partnerUserId) ?? 0) - 1)
      if (remaining === 0) state.inFlight.delete(partnerUserId)
      else state.inFlight.set(partnerUserId, remaining)
      if (match) {
        const miniRoomId = discoveryMatchMiniRoomId(match.matchId)
        if (!state.shownByRoute.includes(miniRoomId)) {
          state.shownByRoute = [...state.shownByRoute, miniRoomId].slice(-SHOWN_LIMIT)
        }
        state.parked.get(partnerUserId)?.delete(miniRoomId)
      }
      if (remaining > 0) return
      const parked = state.parked.get(partnerUserId)
      state.parked.delete(partnerUserId)
      for (const [miniRoomId, present] of parked ?? []) {
        if (!state.shownByRoute.includes(miniRoomId)) present()
      }
    },
    routeRealtimeMatch(accountUserId, event, present) {
      const state = stateFor(accountUserId)
      if (state.shownByRoute.includes(event.miniRoomId)) return "suppressed"
      if ((state.inFlight.get(event.partnerUserId) ?? 0) > 0) {
        const parked = state.parked.get(event.partnerUserId) ?? new Map<string, () => void>()
        if (!parked.has(event.miniRoomId)) parked.set(event.miniRoomId, present)
        state.parked.set(event.partnerUserId, parked)
        return "deferred"
      }
      return "present"
    },
    reset() {
      accounts = new Map()
    }
  }
}

/** The app-wide instance shared by Discover decisions and the match modal. */
export const discoveryMatchDelivery = createDiscoveryMatchDelivery()
