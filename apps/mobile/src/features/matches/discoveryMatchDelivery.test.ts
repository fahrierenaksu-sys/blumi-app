import assert from "node:assert/strict"
import test from "node:test"
import {
  createDiscoveryMatchDelivery,
  discoveryMatchMiniRoomId,
  parseDiscoveryMatchId
} from "./discoveryMatchDelivery"

const ME = "user_me"
const PARTNER = "user_partner"
const MATCH_ID = "match_1"
const MINI_ROOM_ID = discoveryMatchMiniRoomId(MATCH_ID)

function counter() {
  const calls = { count: 0 }
  return { calls, present: () => { calls.count += 1 } }
}

test("discovery match ids round-trip and room connection ids are not discovery matches", () => {
  assert.equal(MINI_ROOM_ID, "match_match_1")
  assert.equal(parseDiscoveryMatchId(MINI_ROOM_ID), MATCH_ID)
  assert.equal(parseDiscoveryMatchId("mini_room_abc"), null)
  assert.equal(parseDiscoveryMatchId("match_"), null)
})

test("no like in flight: the partner's realtime match presents at once", () => {
  const delivery = createDiscoveryMatchDelivery()
  const { calls, present } = counter()
  assert.equal(delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present), "present")
  assert.equal(calls.count, 0, "the caller presents; the registry only decides")
})

test("double show: realtime before the swiper's matched answer is dropped once the route opens", () => {
  const delivery = createDiscoveryMatchDelivery()
  const { calls, present } = counter()
  delivery.beginLike(ME, PARTNER)
  assert.equal(delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present), "deferred")
  delivery.settleLike(ME, PARTNER, { matchId: MATCH_ID })
  assert.equal(calls.count, 0)
})

test("double show: realtime after the swiper's matched answer is suppressed", () => {
  const delivery = createDiscoveryMatchDelivery()
  const { calls, present } = counter()
  delivery.beginLike(ME, PARTNER)
  delivery.settleLike(ME, PARTNER, { matchId: MATCH_ID })
  assert.equal(delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present), "suppressed")
  assert.equal(calls.count, 0)
})

test("never show: a simultaneous like answered 'not matched' still presents the realtime match exactly once", () => {
  const delivery = createDiscoveryMatchDelivery()
  const { calls, present } = counter()
  delivery.beginLike(ME, PARTNER)
  // The partner's like created the match; its event arrives twice before ours settles.
  delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present)
  delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present)
  assert.equal(calls.count, 0)
  delivery.settleLike(ME, PARTNER, null)
  assert.equal(calls.count, 1)
  delivery.settleLike(ME, PARTNER, null)
  assert.equal(calls.count, 1)
})

test("never show: a like that failed for good releases the parked match", () => {
  const delivery = createDiscoveryMatchDelivery()
  const { calls, present } = counter()
  delivery.beginLike(ME, PARTNER)
  delivery.beginLike(ME, PARTNER)
  delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present)
  delivery.settleLike(ME, PARTNER, null)
  assert.equal(calls.count, 0, "waits for every in-flight like of that partner")
  delivery.settleLike(ME, PARTNER, null)
  assert.equal(calls.count, 1)
})

test("another account's state never suppresses or parks a match, and reset forgets everything", () => {
  const delivery = createDiscoveryMatchDelivery()
  delivery.beginLike("user_other", PARTNER)
  delivery.settleLike("user_other", PARTNER, { matchId: MATCH_ID })
  delivery.beginLike("user_other", PARTNER)
  const { present } = counter()
  assert.equal(delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present), "present")
  delivery.beginLike(ME, PARTNER)
  delivery.settleLike(ME, PARTNER, { matchId: MATCH_ID })
  delivery.reset()
  assert.equal(delivery.routeRealtimeMatch(ME, { miniRoomId: MINI_ROOM_ID, partnerUserId: PARTNER }, present), "present")
})
