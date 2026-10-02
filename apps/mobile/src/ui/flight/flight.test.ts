import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createInertModule,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../../testing/hookHarness"
import { createClockedReanimatedStub, findElements, loadClockedMotion } from "../../testing/reanimatedClock"
import { MOTION_DURATIONS, MOTION_SPRINGS } from "../motionTokens"
import type * as FlightLayerModule from "./FlightLayer"
import * as model from "./flightModel"
import { createFlightStore, type FlightRequest } from "./flightStore"
import { createLiveFlightSources } from "./flightSources"
import * as entranceModel from "../../features/chat/thread/chatTimelineEntranceModel"

// The FlightLayer decorates actions and must never cost one: a target is
// always revealed, claims follow send order, and an unmeasurable end skips
// the flight instead of waiting for it.

const surface = { backgroundColor: "#fff", radius: 10 }
const request = (match: string, channel = "chat-send:thread-a"): FlightRequest => ({
  channel,
  match,
  source: { x: 10, y: 600, width: 300, height: 44 },
  sourceSurface: surface,
  targetSurface: surface
})

function fakeTarget(events: string[], name: string) {
  return { handle: name, reveal: () => events.push(`reveal ${name}`) }
}

/* ── Store ─────────────────────────────────────────────────── */

test("rapid sends of the same text land on their own rows, in order", () => {
  const store = createFlightStore()
  const first = store.launch(request("hi"))
  const second = store.launch(request("hi"))
  const other = store.launch(request("hey"))
  assert.equal(store.claim("chat-send:thread-a", "hi"), first)
  assert.equal(store.claim("chat-send:thread-a", "hi"), second)
  assert.equal(store.claim("chat-send:thread-a", "hi"), null, "a row never steals a claimed flight")
  assert.equal(store.claim("chat-send:thread-b", "hey"), null, "another conversation never claims it")
  assert.equal(store.claim("chat-send:thread-a", "hey"), other)
  assert.equal(store.getFlights().length, 3)
})

test("a landed or abandoned flight always reveals its target", () => {
  const store = createFlightStore()
  const events: string[] = []
  const id = store.launch(request("hi"))
  store.claim("chat-send:thread-a", "hi")
  store.attachTarget(id, fakeTarget(events, "bubble"))
  assert.equal(store.getTarget(id)?.handle, "bubble")
  store.finish(id)
  store.finish(id)
  assert.deepEqual(events, ["reveal bubble"])
  assert.equal(store.getFlights().length, 0)

  // The flight timed out before its row mounted: the row shows at once.
  store.attachTarget(id, fakeTarget(events, "late bubble"))
  assert.deepEqual(events, ["reveal bubble", "reveal late bubble"])
})

test("a target that leaves mid-flight ends the flight", () => {
  const store = createFlightStore()
  const events: string[] = []
  const id = store.launch(request("hi"))
  let flightChanges = 0
  store.subscribeToFlight(id, () => { flightChanges += 1 })
  store.attachTarget(id, fakeTarget(events, "bubble"))
  store.detachTarget(id)
  assert.deepEqual(events, [], "the unmounted row has nothing left to show")
  assert.equal(store.getFlights().length, 0)
  assert.ok(flightChanges >= 1)
})

test("a flight settles exactly once: on landing, or when it ends any other way", () => {
  const store = createFlightStore()
  const settled: string[] = []
  const record = (name: string) => (landed: boolean) => settled.push(`${name}:${landed}`)
  const landed = store.launch({ ...request("a"), onSettled: record("landed") })
  store.land(landed)
  store.land(landed)
  store.finish(landed)
  assert.deepEqual(settled, ["landed:true"], "landing, then the fade-out end, is one settle")

  const abandoned = store.launch({ ...request("b"), onSettled: record("abandoned") })
  store.finish(abandoned)
  const left = store.launch({ ...request("c"), onSettled: record("left") })
  store.claim("chat-send:thread-a", "c")
  store.attachTarget(left, fakeTarget([], "row"))
  store.detachTarget(left)
  assert.deepEqual(settled, ["landed:true", "abandoned:false", "left:false"], "no ending loses the settle")
  store.land("unknown")
})

test("the layer re-renders only when flights start or end", () => {
  const store = createFlightStore()
  let renders = 0
  store.subscribe(() => { renders += 1 })
  const id = store.launch(request("hi"))
  const snapshot = store.getFlights()
  store.claim("chat-send:thread-a", "hi")
  store.attachTarget(id, fakeTarget([], "bubble"))
  assert.equal(renders, 1)
  assert.equal(store.getFlights(), snapshot, "claims and targets keep the list snapshot")
  store.finish(id)
  assert.equal(renders, 2)
})

test("a flight reports its contact once: landed, or not when it ends without a target", () => {
  const store = createFlightStore()
  const settled: boolean[] = []
  const landing = store.launch({ ...request("hi"), onSettled: (landed) => settled.push(landed) })
  store.attachTarget(landing, fakeTarget([], "bubble"))
  store.land(landing)
  store.land(landing)
  store.finish(landing)
  assert.deepEqual(settled, [true], "the fade after the landing is not a second contact")

  const lost = store.launch({ ...request("hey"), onSettled: (landed) => settled.push(landed) })
  store.finish(lost)
  store.land(lost)
  assert.deepEqual(settled, [true, false])
})

/* ── Frame math ────────────────────────────────────────────── */

test("flights need a usable frame on screen at both ends", () => {
  const viewport = { width: 390, height: 844 }
  assert.equal(model.isFlightFrameVisible({ x: 20, y: 500, width: 120, height: 40 }, viewport), true)
  assert.equal(model.isFlightFrameVisible({ x: 20, y: 900, width: 120, height: 40 }, viewport), false)
  assert.equal(model.isFlightFrameVisible({ x: 20, y: -60, width: 120, height: 40 }, viewport), false)
  assert.equal(model.isFlightFrameVisible({ x: 20, y: 500, width: 0, height: 40 }, viewport), false)
  assert.equal(model.isFlightFrameVisible(null, viewport), false)
  assert.equal(model.isFlightFrameUsable({ x: Number.NaN, y: 0, width: 10, height: 10 }), false)
})

test("the clone travels from the source frame to the target frame", () => {
  const source = { x: 10, y: 600, width: 300, height: 44 }
  const target = { x: 200, y: 520, width: 120, height: 38 }
  assert.deepEqual(model.mixFlightFrame(source, target, 0), source)
  assert.deepEqual(model.mixFlightFrame(source, target, 1), target)
  const halfway = model.mixFlightFrame(source, target, 0.5)
  assert.equal(halfway.x, 105)
  assert.equal(halfway.width, 210)
  // Each surface is drawn at its own size and only scaled to the frame.
  assert.deepEqual(model.flightLayerScale(target, target), { scaleX: 1, scaleY: 1 })
  assert.deepEqual(model.flightLayerScale(source, { width: 150, height: 22 }), { scaleX: 2, scaleY: 2 })
})

test("the target surface takes over and the carried words fade only as they land", () => {
  assert.equal(model.flightTargetSurfaceOpacity(0), 0)
  assert.equal(model.flightTargetSurfaceOpacity(1), 1)
  assert.equal(model.flightContentOpacity(0), 1)
  assert.equal(model.flightContentOpacity(0.5), 1)
  assert.equal(model.flightContentOpacity(1), 0)
  let previous = 1
  for (let step = 0; step <= 20; step += 1) {
    const value = model.flightContentOpacity(step / 20)
    assert.ok(value <= previous)
    previous = value
  }
})

test("a carried hero keeps its proportions and stays centred in every frame", () => {
  const source = { x: 40, y: 200, width: 200, height: 200 }
  // A tall landing spot: the chibi scales to fit, never stretches.
  const fit = model.flightCarriedContentTransform({ x: 0, y: 0, width: 100, height: 160 }, source)
  assert.equal(fit.scale, 0.5)
  assert.equal(fit.translateX, 0)
  assert.equal(fit.translateY, 30)
  assert.deepEqual(model.flightCarriedContentTransform(source, source), { scale: 1, translateX: 0, translateY: 0 })
})

/* ── Live sources (the invitation card's door) ─────────────── */

const card = { x: 16, y: 640, width: 280, height: 120 }

test("a source on screen is measured when the flight starts", () => {
  const sources = createLiveFlightSources(1_200)
  const detach = sources.attach("door:a", () => card)
  assert.deepEqual(sources.take("door:a"), card)
  assert.equal(sources.take("door:b"), null, "another key has no source")
  detach()
})

test("a source that left a moment ago still counts once; an older one does not", () => {
  const sources = createLiveFlightSources(1_200)
  let now = 1_000
  sources.attach("door:a", () => card, () => now)()
  assert.deepEqual(sources.take("door:a", now + 300), card)
  assert.equal(sources.take("door:a", now + 400), null, "one flight per source")
  now = 5_000
  sources.attach("door:a", () => card, () => now)()
  assert.equal(sources.take("door:a", now + 1_201), null)
})

test("an unmeasurable source starts no flight, and a replaced one keeps the newest", () => {
  const sources = createLiveFlightSources(1_200)
  const detachHidden = sources.attach("door:a", () => null)
  assert.equal(sources.take("door:a"), null)
  detachHidden()
  assert.equal(sources.take("door:a"), null)
  const first = sources.attach("door:b", () => ({ ...card, y: 1 }))
  sources.attach("door:b", () => card)
  first()
  assert.deepEqual(sources.take("door:b"), card, "the old view leaving does not unhook the new one")
})

test("my sent row arrives under Reduce Motion too, without the entrance animation", () => {
  for (const reduceMotion of [false, true]) {
    const runtime = createFakeReactRuntime()
    const { useChatTimelineEntrances } = loadSourceWithFakeReact<{
      useChatTimelineEntrances: (input: { timeline: unknown[]; isListPresented: boolean }) => {
        enteringKeys: ReadonlySet<string>
        arrivedKeys: ReadonlySet<string>
      }
    }>("features/chat/thread/useChatTimelineEntrances.ts", runtime, {
      modules: {
        "react-native-reanimated": createInertModule("reanimated"),
        "../../../ui/animations": { useReducedMotion: () => reduceMotion },
        "./chatTimelineEntranceModel": entranceModel
      }
    })
    const message = (id: string, sentAt: string) => ({
      kind: "message",
      createdAt: sentAt,
      message: { messageId: id, senderUserId: "me", body: id, sentAt }
    })
    let timeline: unknown[] = [message("old", "2026-10-01T10:00:00.000Z")]
    const render = () => runtime.render(() => useChatTimelineEntrances({ timeline, isListPresented: true }))
    const initial = render()
    assert.equal(initial.arrivedKeys.size, 0, "history never arrives")
    timeline = [...timeline, message("new", "2026-10-01T10:01:00.000Z")]
    const next = render()
    assert.equal(next.arrivedKeys.size, 1)
    assert.equal(next.enteringKeys.size, reduceMotion ? 0 : 1)
  }
})

/* -- The clone on a clock ------------------------------------ */

// Reanimated calls a spring's completion only at rest, about 1.5x its
// visible duration. A flight touches down (onSettled(true), the haptic, the
// match meeting's partner arrival) when it visibly lands, not that later.
test("a flight lands when it visibly arrives, reports it once, then fades out", async (t) => {
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
  const layer = loadSourceWithFakeReact<typeof FlightLayerModule>("ui/flight/FlightLayer.tsx", runtime, {
    modules: {
      "react-native": reactNative,
      "react-native-reanimated": { ...clock.module, measure: () => null, useAnimatedRef: () => ({ current: null }) },
      "react-native-worklets": { ...clock.worklets, scheduleOnUI: (worklet: () => void) => worklet() },
      "../motion": motion
    },
    real: ["./flightModel", "./flightStore"]
  })
  const settled: boolean[] = []
  const id = layer.launchFlight({
    ...request("landing", "fixed-frame"),
    content: null,
    targetFrame: { x: 40, y: 80, width: 200, height: 120 },
    onSettled: (landed) => settled.push(landed)
  })
  assert.ok(id)
  // The layer and its one clone render together, as the app nests them.
  let flying = true
  runtime.render(() => {
    const tree = layer.FlightLayer({})
    const clone = findElements(tree, (element) => element.props.flight !== undefined)[0]
    flying = clone !== undefined
    return clone ? (clone.type as (props: unknown) => unknown)(clone.props) : null
  })
  const tick = (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1) t.mock.timers.tick(1)
  }
  tick(MOTION_SPRINGS.snappy.duration - 1)
  assert.deepEqual(settled, [], "still in the air")
  tick(1)
  assert.deepEqual(settled, [true], "contact when it visibly lands, not a spring's rest later")
  tick(MOTION_DURATIONS.fadeOut)
  assert.equal(flying, false, "the clone is gone after its fade")
  assert.deepEqual(settled, [true], "reported exactly once")
})
