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
  const artwork = () => null
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
      "./ChatRoomInviteScene": {
        ROOM_INVITE_DOOR_GEOMETRY: { width: 98, height: 146, bottom: 28 },
        ROOM_INVITE_SCENE_HEIGHT: 210,
        RoomInviteDoorFlightArtwork: artwork
      }
    }
  })
  return { loaded, sources, requests, artwork }
}

test("the room flight carries only the invitation door and leaves the arriving room visible", () => {
  const f = mount()
  f.loaded.roomDoorSources.attach(f.loaded.getRoomDoorKey("thread-a"), () => cardFrame)

  assert.equal(f.loaded.launchRoomDoorFlight({ sourceThreadId: "thread-a", reduceMotion: false }), true)
  assert.equal(f.requests.length, 1)
  const request = f.requests[0]!
  assert.deepEqual(request.source, { x: 121, y: 537, width: 98, height: 146 })
  assert.equal(request.contentMode, "carry")
  assert.equal((request.content as { type: unknown }).type, f.artwork)
  assert.equal(request.sourceSurface.backgroundColor, "transparent")
  assert.equal(request.targetSurface.backgroundColor, "transparent")
  assert.deepEqual(request.targetFrame, { x: 0, y: 0, width: 390, height: 844 })
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
