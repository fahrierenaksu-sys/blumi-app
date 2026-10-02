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

test("a ready event stays in the invitation chat until the user presses enter", () => {
  assert.equal(resolveReadyRoomArrival({
    requestedByUser: false,
    currentRouteName: "ChatThread",
    currentRouteParams: { threadId: "thread-1" },
    sourceThreadId: "thread-1"
  }), "stay")
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
  const tr = getRoomArrivalBanner("tr", "Ayşe")
  const en = getRoomArrivalBanner("en", "Ayşe")
  for (const banner of [tr, en]) {
    assert.match(banner.title, /Ayşe/)
    assert.match(banner.accessibilityLabel, /Ayşe/)
    assert.ok(banner.body.trim().length > 0)
  }
  assert.notEqual(tr.title, en.title)
  assert.notEqual(tr.body, en.body)
  for (const locale of ["tr", "en"] as const) {
    assert.ok(getRoomArrivalClosedTitle(locale).trim().length > 0)
  }
  // Long enough to notice and tap, short enough not to linger.
  assert.ok(ROOM_ARRIVAL_BANNER_MS >= 6_000 && ROOM_ARRIVAL_BANNER_MS <= 12_000)
})
