import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { createClockedReanimatedStub, loadClockedMotion } from "../../testing/reanimatedClock"
import { MOTION_SPRINGS } from "../../ui/motionTokens"
import type * as MeetingHook from "./useMatchMeeting"
import { createMatchFlightSourceStore, MATCH_FLIGHT_SOURCE_MAX_AGE_MS } from "./matchFlightSource"
import {
  createMatchArrivalGate,
  MATCH_HEART_LINE_MS,
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

/* -- The meeting on a clock ---------------------------------- */

// Reanimated calls a spring's completion only at rest, about 1.5x its
// visible duration. The heart line starts when both chibis have visibly
// arrived (delay + token duration), never that long after.
async function mountMeeting(t: TestContext) {
  const runtime = createFakeReactRuntime()
  const clock = createClockedReanimatedStub(runtime, { springRestFactor: 1.5 })
  const reactNative = createReactNativeStub({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined })
    }
  }).module
  const motion = loadClockedMotion(runtime, clock.module, reactNative) as { primeReducedMotionPreference: () => void }
  motion.primeReducedMotionPreference()
  await new Promise((resolve) => setImmediate(resolve))
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
  const { useMatchMeeting } = loadSourceWithFakeReact<typeof MeetingHook>("features/matches/useMatchMeeting.ts", runtime, {
    modules: {
      "react-native-reanimated": clock.module,
      "react-native-worklets": clock.worklets,
      "../../ui/motion": motion
    },
    real: ["./matchMeetingModel"]
  })
  let meeting: ReturnType<typeof useMatchMeeting> | undefined
  runtime.render(() => {
    meeting = useMatchMeeting()
    return null
  })
  // One millisecond at a time: a callback that starts the next animation
  // must see the clock at its own moment, not at the end of a long tick.
  const tick = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1) t.mock.timers.tick(1)
  }
  return { meeting: () => meeting!, tick }
}

const DELAY_MS = 120
const ARRIVED_MS = DELAY_MS + MOTION_SPRINGS.smooth.duration

test("the heart line starts as both chibis visibly arrive, and the contact follows the line", async (t) => {
  const { meeting, tick } = await mountMeeting(t)
  let contacts = 0
  meeting().start({
    plan: planMatchMeeting({ reduceMotion: false, hasFlightSource: false }),
    delayMs: DELAY_MS,
    onContact: () => { contacts += 1 }
  })
  tick(ARRIVED_MS + MATCH_HEART_LINE_MS - 1)
  assert.equal(contacts, 0, "the line is still drawing")
  tick(1)
  assert.equal(contacts, 1, "contact at delay + slide + line, not a spring's rest later")
  tick(2_000)
  assert.equal(contacts, 1)
})

test("a flown-in partner meets the slide as soon as it lands", async (t) => {
  const { meeting, tick } = await mountMeeting(t)
  let contacts = 0
  meeting().start({
    plan: planMatchMeeting({ reduceMotion: false, hasFlightSource: true }),
    delayMs: DELAY_MS,
    onContact: () => { contacts += 1 }
  })
  tick(200)
  meeting().partnerArrived()
  tick(ARRIVED_MS - 200 + MATCH_HEART_LINE_MS)
  assert.equal(contacts, 1)
})

test("a restarted meeting meets once, on its own timeline", async (t) => {
  const { meeting, tick } = await mountMeeting(t)
  const contacts: string[] = []
  const plan = planMatchMeeting({ reduceMotion: false, hasFlightSource: false })
  meeting().start({ plan, delayMs: DELAY_MS, onContact: () => contacts.push("first") })
  tick(ARRIVED_MS - 50)
  meeting().start({ plan, delayMs: DELAY_MS, onContact: () => contacts.push("second") })
  tick(ARRIVED_MS + MATCH_HEART_LINE_MS - 1)
  assert.deepEqual(contacts, [])
  tick(1)
  assert.deepEqual(contacts, ["second"])
  tick(2_000)
  assert.deepEqual(contacts, ["second"])
})
