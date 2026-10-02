import assert from "node:assert/strict"
import test from "node:test"
import { createMatchFlightSourceStore, MATCH_FLIGHT_SOURCE_MAX_AGE_MS } from "./matchFlightSource"
import {
  createMatchArrivalGate,
  matchHeartLine,
  matchMeetingArrival,
  planMatchMeeting
} from "./matchMeetingModel"

// The match moment: two chibis meet, and their contact is the one success
// tap. It must never stall, never fire twice, and never move under Reduce
// Motion.

test("the contact comes only once both chibis are in, whatever lands first", () => {
  for (const order of [["me", "partner"], ["partner", "me"]] as const) {
    let contacts = 0
    const arrive = createMatchArrivalGate(() => { contacts += 1 })
    arrive(order[0])
    arrive(order[0])
    assert.equal(contacts, 0, "one chibi alone is not a meeting")
    arrive(order[1])
    arrive(order[1])
    arrive(order[0])
    assert.equal(contacts, 1)
  }
})

test("the liked card's chibi flies in; without its frame the partner slides in", () => {
  assert.equal(planMatchMeeting({ reduceMotion: false, hasFlightSource: true }).partnerArrival, "flight")
  const slide = planMatchMeeting({ reduceMotion: false, hasFlightSource: false })
  assert.equal(slide.partnerArrival, "slide")
  assert.equal(slide.meArrival, "slide")
  assert.equal(slide.line, "draw")
  assert.ok(slide.confettiPieces > 0 && slide.confettiPieces < 12, "a light celebration")
})

test("Reduce Motion: nothing travels, the moment crossfades and still meets", () => {
  const plan = planMatchMeeting({ reduceMotion: true, hasFlightSource: true })
  assert.deepEqual(plan, { partnerArrival: "fade", meArrival: "fade", line: "fade", confettiPieces: 0 })
  for (const progress of [0, 0.3, 1]) {
    for (const side of ["me", "partner"] as const) {
      const arrival = matchMeetingArrival(progress, side, true)
      assert.equal(arrival.translateX, 0)
      assert.equal(arrival.opacity, progress)
    }
    assert.equal(matchHeartLine(progress, false).scaleX, 1)
    assert.equal(matchHeartLine(progress, false).opacity, progress)
  }
})

test("the chibis come from opposite sides and settle on their slots", () => {
  const me = matchMeetingArrival(0, "me", false)
  const partner = matchMeetingArrival(0, "partner", false)
  assert.ok(me.translateX < 0 && partner.translateX > 0)
  assert.equal(me.opacity, 0)
  assert.deepEqual(matchMeetingArrival(1, "me", false), { opacity: 1, translateX: 0 })
  assert.deepEqual(matchMeetingArrival(1, "partner", false), { opacity: 1, translateX: 0 })
  // The heart line grows from nothing to its full length.
  assert.equal(matchHeartLine(0, true).opacity, 0)
  assert.deepEqual(matchHeartLine(1, true), { opacity: 1, scaleX: 1 })
})

test("a liked chibi's frame is used once, for that partner, while it is fresh", () => {
  const store = createMatchFlightSourceStore()
  const frame = { x: 40, y: 220, width: 260, height: 260 }
  store.remember("partner-a", frame, 1_000)
  assert.equal(store.take("partner-b", 1_100), null, "another partner's match never flies this chibi")
  assert.deepEqual(store.take("partner-a", 1_200), frame)
  assert.equal(store.take("partner-a", 1_300), null, "a replayed match does not fly again")

  store.remember("partner-a", frame, 1_000)
  assert.equal(store.take("partner-a", 1_000 + MATCH_FLIGHT_SOURCE_MAX_AGE_MS + 1), null, "a late answer slides in instead")

  store.remember("partner-a", frame, 1_000)
  store.clear()
  assert.equal(store.take("partner-a", 1_100), null, "signing out forgets it")
})
