import assert from "node:assert/strict"
import test from "node:test"
import { isCatTripsEnabled } from "./catTripFlag"
import {
  isOwnCatAway,
  parseCatGuests,
  parseCatPrefs,
  parseCatState,
  pickCatReveal,
  type CatGuests,
  type CatState
} from "./catTripModel"

const HOME_TRIP = { tripId: "t-home", kind: "sleepover", phase: "home", returnsAt: "2026-10-17T07:00:00.000Z", revealed: false,
  souvenir: { key: "ribbon", rarity: "common" } }
const STATE_PAYLOAD = {
  enabled: true, serverTime: "2026-10-17T09:00:00.000Z", catPhase: "home", currentTrip: null,
  pendingReveals: [HOME_TRIP, { ...HOME_TRIP, tripId: "bad", kind: "teleport" }],
  souvenirs: [{ souvenirId: "s1", tripId: "t-home", key: "ribbon", rarity: "common", acquiredAt: "2026-10-17T07:00:00.000Z" }]
}

test("the cat flag is off unless exactly 1", () => {
  for (const raw of [undefined, "", "0", "true", "yes"]) assert.equal(isCatTripsEnabled(raw), false, String(raw))
  assert.equal(isCatTripsEnabled("1"), true)
})

test("flags off: nothing is revealed and the own cat is never hidden", () => {
  const state = parseCatState({ ...STATE_PAYLOAD, catPhase: "away" })
  const guests = parseCatGuests({ enabled: true, guests: [{ tripId: "g1", leavesAt: "2026-10-17T12:00:00.000Z", ownerRevealed: false }] })
  assert.equal(pickCatReveal({ isEnabled: false, state, guests, dismissedTripIds: new Set() }), null)
  assert.equal(isOwnCatAway(false, state), false)
  // The server's own flag off: the same quiet.
  const serverOff = parseCatState({ enabled: false })
  assert.deepEqual(serverOff, { enabled: false })
  assert.equal(pickCatReveal({ isEnabled: true, state: serverOff, guests: parseCatGuests({ enabled: false }), dismissedTripIds: new Set() }), null)
  assert.equal(isOwnCatAway(true, serverOff), false)
})

test("malformed trips are dropped, never guessed", () => {
  const state = parseCatState(STATE_PAYLOAD) as Extract<CatState, { enabled: true }>
  assert.deepEqual(state.pendingReveals.map((trip) => trip.tripId), ["t-home"])
  assert.equal(state.souvenirs.length, 1)
  assert.equal(parseCatState("nope"), null)
  assert.equal(parseCatState({ enabled: "yes" }), null)
})

test("the owner's returned cat comes first, then an unread guest, and Sonra hides it for the day", () => {
  const state = parseCatState(STATE_PAYLOAD)
  const guests = parseCatGuests({ enabled: true, guests: [{ tripId: "g1", leavesAt: "2026-10-17T12:00:00.000Z", ownerRevealed: false }] })
  const first = pickCatReveal({ isEnabled: true, state, guests, dismissedTripIds: new Set() })
  assert.equal(first?.role, "owner")
  const second = pickCatReveal({ isEnabled: true, state, guests, dismissedTripIds: new Set(["t-home"]) })
  assert.equal(second?.role, "host")
  assert.equal(pickCatReveal({ isEnabled: true, state, guests, dismissedTripIds: new Set(["t-home", "g1"]) }), null)
})

test("a guest's owner is unknown until the host tapped the collar tag", () => {
  const guests = parseCatGuests({ enabled: true, guests: [
    { tripId: "g1", leavesAt: "2026-10-17T12:00:00.000Z", ownerRevealed: false, ownerUserId: "smuggled" },
    { tripId: "g2", leavesAt: "2026-10-17T12:00:00.000Z", ownerRevealed: true, ownerUserId: "user_owner" }
  ] }) as Extract<CatGuests, { enabled: true }>
  assert.equal(guests.guests[0]!.ownerUserId, undefined)
  assert.equal(guests.guests[1]!.ownerUserId, "user_owner")
})

test("while the own cat travels, My Room draws an empty basket", () => {
  assert.equal(isOwnCatAway(true, parseCatState({ ...STATE_PAYLOAD, catPhase: "away" })), true)
  assert.equal(isOwnCatAway(true, parseCatState(STATE_PAYLOAD)), false)
})

test("switches parse only as three booleans", () => {
  assert.deepEqual(parseCatPrefs({ enabled: true, prefs: { travelEnabled: true, hostEnabled: false, pushEnabled: false } }),
    { enabled: true, prefs: { travelEnabled: true, hostEnabled: false, pushEnabled: false } })
  assert.equal(parseCatPrefs({ enabled: true, prefs: { travelEnabled: "1", hostEnabled: false, pushEnabled: false } }), null)
  assert.deepEqual(parseCatPrefs({ enabled: false }), { enabled: false })
})
