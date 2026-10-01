import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomArrivalBanner,
  getRoomArrivalClosedTitle,
  resolveReadyRoomArrival,
  ROOM_ARRIVAL_BANNER_MS
} from "./roomArrivalModel"

// UX audit ROOM-09: when the partner accepts, the inviter was pulled into the
// room from anywhere (Shop, mid-sentence). Only the invite's own chat enters
// directly; anywhere else a "X is in the room · Join" banner is shown.

test("the invite's own chat enters the room directly", () => {
  assert.equal(resolveReadyRoomArrival({
    requestedByUser: false,
    currentRouteName: "ChatThread",
    currentRouteParams: { threadId: "thread-1" },
    sourceThreadId: "thread-1"
  }), "enter")
})

test("anywhere else the room is announced instead of taking over the screen", () => {
  for (const [currentRouteName, currentRouteParams] of [
    ["Shop", undefined],
    ["Lobby", {}],
    ["ChatThread", { threadId: "another-thread" }],
    ["ChatThread", { partnerId: "user-two" }],
    [undefined, undefined]
  ] as const) {
    assert.equal(resolveReadyRoomArrival({
      requestedByUser: false,
      currentRouteName,
      currentRouteParams,
      sourceThreadId: "thread-1"
    }), "announce", String(currentRouteName))
  }
  assert.equal(resolveReadyRoomArrival({
    requestedByUser: false,
    currentRouteName: "ChatThread",
    currentRouteParams: { threadId: "thread-1" },
    sourceThreadId: undefined
  }), "announce", "a room without a source chat is never entered by surprise")
})

test("a room the user asked for (accept, join, demo) always opens", () => {
  assert.equal(resolveReadyRoomArrival({
    requestedByUser: true,
    currentRouteName: "Shop",
    currentRouteParams: undefined,
    sourceThreadId: "thread-1"
  }), "enter")
})

test("the banner names the partner and offers to join in Turkish and English", () => {
  assert.deepEqual(getRoomArrivalBanner("tr", "Ayşe"), {
    title: "Ayşe odada",
    body: "Katılmak için dokun",
    accessibilityLabel: "Ayşe odada. Katılmak için dokun"
  })
  assert.deepEqual(getRoomArrivalBanner("en", "Ayşe"), {
    title: "Ayşe is in the room",
    body: "Tap to join",
    accessibilityLabel: "Ayşe is in the room. Tap to join"
  })
  assert.equal(getRoomArrivalClosedTitle("tr"), "Bu oda kapandı")
  assert.equal(getRoomArrivalClosedTitle("en"), "This room has closed")
  // Long enough to notice and tap, short enough not to linger.
  assert.ok(ROOM_ARRIVAL_BANNER_MS >= 6_000 && ROOM_ARRIVAL_BANNER_MS <= 12_000)
})
