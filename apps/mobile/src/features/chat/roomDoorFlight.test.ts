import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import * as flightModel from "../../ui/flight/flightModel"
import { createLiveFlightSources } from "../../ui/flight/flightSources"
import type { FlightRequest } from "../../ui/flight/flightStore"
import type * as RoomDoor from "./roomDoorFlight"

const cardFrame = { x: 10, y: 500, width: 320, height: 300 }

function mount() {
  const runtime = createFakeReactRuntime()
  const sources = createLiveFlightSources(1_500)
  const requests: FlightRequest[] = []
  const loaded = loadSourceWithFakeReact<typeof RoomDoor>("features/chat/roomDoorFlight.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({
        Dimensions: { get: () => ({ width: 390, height: 844 }) }
      }).module,
      "../../ui/flight/FlightLayer": {
        launchFlight: (request: FlightRequest) => { requests.push(request); return "door-flight" }
      },
      "../../ui/flight/flightSources": { createLiveFlightSources: () => sources },
      "../../ui/flight/flightModel": flightModel,
      "../../ui/theme": { uiTheme: { colors: { surfaceRaised: "#FFFDFE" }, radius: { lg: 24 } } }
    }
  })
  return { loaded, sources, requests }
}

test("the accepted card zooms from its place to the whole window on flat surfaces", () => {
  const f = mount()
  f.loaded.roomDoorSources.attach(f.loaded.getRoomDoorKey("thread-a"), () => cardFrame)

  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "thread-a", reduceMotion: false }), true)
  assert.equal(f.requests.length, 1)
  const request = f.requests[0]!
  // The whole card grows, not a small drawing stretched to the screen.
  assert.deepEqual(request.source, cardFrame)
  assert.deepEqual(request.targetFrame, { x: 0, y: 0, width: 390, height: 844 })
  assert.equal(request.content, undefined, "no artwork is upscaled")
  assert.notEqual(request.sourceSurface.backgroundColor, "transparent")
  assert.ok(request.sourceSurface.radius > 0, "starts as the rounded card")
  assert.equal(request.targetSurface.radius, 0, "lands as the full-screen room backdrop")
})

test("Reduce Motion leaves the live source available for ordinary room entry", () => {
  const f = mount()
  f.loaded.roomDoorSources.attach(f.loaded.getRoomDoorKey("thread-a"), () => cardFrame)

  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "thread-a", reduceMotion: true }), false)
  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "thread-a", reduceMotion: false }), true)
  assert.equal(f.requests.length, 1)
})

test("missing and offscreen invitation doors skip the flight without delaying room entry", () => {
  const f = mount()
  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "missing", reduceMotion: false }), false)

  f.loaded.roomDoorSources.attach("room-door:offscreen", () => ({ ...cardFrame, y: 900 }))
  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "offscreen", reduceMotion: false }), false)
  assert.equal(f.requests.length, 0)
})
