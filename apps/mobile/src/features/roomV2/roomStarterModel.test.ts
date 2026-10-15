import assert from "node:assert/strict"
import test from "node:test"
import {
  canCompleteRoomSetup,
  STARTER_ROOM_BED_DEFAULT_POINT,
  STARTER_ROOM_BED_ITEM_ID,
  createStarterRoomDecor,
  hasPlacedStarterBed,
  placeStarterBed,
  resolveRoomSetupSummary,
  rotateStarterBed,
  saveOnboardingRoomKeepingSignupAlive
} from "./roomStarterModel"
import { getRoomSetupCopy } from "./roomSetupCopy"
import { ROOM_DECOR_UNOWNED_ITEM_MESSAGE } from "./personalRoomDecorErrors"
import { savePersonalRoomDecor } from "./personalRoomDecorApi"
import type { UserRoomDecor } from "./roomV2.types"

test("onboarding starts with one standard empty room", () => {
  const decor = createStarterRoomDecor("room-shell")

  assert.equal(decor.roomShellId, "room-shell")
  assert.deepEqual(decor.placedItems, [])
})

test("the user can place the granted bed at the chosen point", () => {
  const empty = createStarterRoomDecor("room-shell")
  const decor = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.deepEqual(decor.placedItems, [{
    instanceId: "starter-room-bed",
    itemId: STARTER_ROOM_BED_ITEM_ID,
    x: 0.62,
    y: 0.72,
    rotation: "front"
  }])
  assert.equal(hasPlacedStarterBed(decor), true)
  assert.deepEqual(empty.placedItems, [])
})

test("starter room decor returns fresh immutable placement objects", () => {
  const first = createStarterRoomDecor("room-shell")
  const second = createStarterRoomDecor("room-shell")

  assert.notEqual(first, second)
  assert.notEqual(first.placedItems, second.placedItems)
  assert.deepEqual(first.placedItems, [])
  assert.deepEqual(second.placedItems, [])
})

test("the starter bed rotates clockwise through every authored direction", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )

  const right = rotateStarterBed(placed)
  const back = rotateStarterBed(right)
  const left = rotateStarterBed(back)
  const front = rotateStarterBed(left)

  assert.equal(right.placedItems[0]?.rotation, "right")
  assert.equal(back.placedItems[0]?.rotation, "back")
  assert.equal(left.placedItems[0]?.rotation, "left")
  assert.equal(front.placedItems[0]?.rotation, "front")
  assert.equal(placed.placedItems[0]?.rotation, "front")
})

test("rotating the starter bed preserves unrelated room items", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )
  const table = {
    instanceId: "table-1",
    itemId: "room_v2_table",
    x: 0.4,
    y: 0.6,
    rotation: "front" as const
  }
  const rotated = rotateStarterBed({
    ...placed,
    placedItems: [table, ...placed.placedItems]
  })

  assert.deepEqual(rotated.placedItems[0], table)
  assert.equal(rotated.placedItems[1]?.rotation, "right")
  assert.notEqual(rotated.placedItems[0], table)
})
test("starter readiness requires exactly one placed bed", () => {
  const empty = createStarterRoomDecor("room-shell")
  const placed = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.equal(hasPlacedStarterBed(empty), false)
  assert.equal(hasPlacedStarterBed(placed), true)
  assert.equal(hasPlacedStarterBed({
    ...placed,
    placedItems: [...placed.placedItems, { ...placed.placedItems[0], instanceId: "duplicate" }]
  }), false)
})

test("room setup finishes on the empty default room while the starter bed has no art", () => {
  const empty = createStarterRoomDecor("room-shell")
  assert.equal(canCompleteRoomSetup({
    decor: empty, defaultRoomShellId: "room-shell", starterBedAvailable: false, placedBedIsValid: false
  }), true)
  assert.equal(canCompleteRoomSetup({
    decor: createStarterRoomDecor("other-shell"), defaultRoomShellId: "room-shell", starterBedAvailable: false, placedBedIsValid: false
  }), false)
})

test("with a drawable starter bed, room setup waits for the bed on a valid spot", () => {
  const empty = createStarterRoomDecor("room-shell")
  const placed = placeStarterBed(empty, { x: 0.5, y: 0.7 })
  const base = { defaultRoomShellId: "room-shell", starterBedAvailable: true }
  assert.equal(canCompleteRoomSetup({ ...base, decor: empty, placedBedIsValid: false }), false)
  assert.equal(canCompleteRoomSetup({ ...base, decor: placed, placedBedIsValid: false }), false)
  assert.equal(canCompleteRoomSetup({ ...base, decor: placed, placedBedIsValid: true }), true)
})

// Phase 2 closing review M2: until the starter bed has art, the setup step must not tell new users to place a free
// gift bed that is not on screen.
test("room setup promises no gift bed while the starter bed is not available", () => {
  for (const locale of ["tr", "en"] as const) {
    const copy = getRoomSetupCopy(locale)
    const withoutBed = resolveRoomSetupSummary({ starterBedAvailable: false, starterRoomReady: false, copy })
    assert.equal(withoutBed.showGiftBadge, false)
    assert.ok(withoutBed.text.length > 0)
    assert.notEqual(withoutBed.text, copy.bedPendingSummary)
    assert.notEqual(withoutBed.text, copy.bedPlacedSummary)
    assert.doesNotMatch(withoutBed.text, /Pembe|Pink|Yatak|Bed/i)

    const pending = resolveRoomSetupSummary({ starterBedAvailable: true, starterRoomReady: false, copy })
    assert.deepEqual(pending, { text: copy.bedPendingSummary, showGiftBadge: true })
    const placed = resolveRoomSetupSummary({ starterBedAvailable: true, starterRoomReady: true, copy })
    assert.deepEqual(placed, { text: copy.bedPlacedSummary, showGiftBadge: true })
  }
})

const BED_ROOM = () => placeStarterBed(createStarterRoomDecor("room-shell"), STARTER_ROOM_BED_DEFAULT_POINT)

function sendRoom(sent: number[], fetcher: (init: RequestInit) => Response | Promise<Response>) {
  return (decor: UserRoomDecor) => savePersonalRoomDecor(
    "https://api.blumi.test",
    "session-token",
    { expectedRevision: 0, decor },
    async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)).decor.placedItems.length)
      return fetcher(init ?? {})
    }
  )
}

const SAVED_BODY = JSON.stringify({
  roomDecor: {
    userId: "u",
    revision: 1,
    decor: { roomShellId: "room-shell", placedItems: [] },
    updatedAt: "2026-10-13T00:00:00.000Z"
  }
})

test("an older server that refuses the starter bed as unowned still lets the account finish with the empty room", async () => {
  const room = BED_ROOM()
  const sent: number[] = []
  const result = await saveOnboardingRoomKeepingSignupAlive(room, sendRoom(sent, () =>
    sent.length === 1
      ? new Response(JSON.stringify({ error: ROOM_DECOR_UNOWNED_ITEM_MESSAGE }), { status: 400 })
      : new Response(SAVED_BODY, { status: 200 })
  ))
  assert.equal(result.kind, "saved")
  assert.deepEqual(sent, [1, 0])
  assert.equal(room.placedItems.length, 1, "the caller's room is not changed")
})

test("a timeout, network failure or 5xx keeps the user's bed and surfaces the error without a second save", async () => {
  const timeout = Object.assign(new Error("This is taking too long. Check your connection and try again."), { name: "TimeoutError" })
  const failures: [string, () => Response | Promise<Response>, RegExp][] = [
    ["timeout", () => { throw timeout }, /taking too long/],
    ["network", () => { throw new TypeError("Network request failed") }, /Network request failed/],
    ["5xx", () => new Response(JSON.stringify({ error: "Try again soon." }), { status: 503 }), /Try again soon/],
    ["400 other", () => new Response(JSON.stringify({ error: "Refresh your room and try again." }), { status: 400 }), /Refresh your room/],
    ["unowned message on a 5xx", () => new Response(JSON.stringify({ error: ROOM_DECOR_UNOWNED_ITEM_MESSAGE }), { status: 500 }), /do not own/]
  ]
  for (const [label, respond, expected] of failures) {
    const room = BED_ROOM()
    const sent: number[] = []
    await assert.rejects(saveOnboardingRoomKeepingSignupAlive(room, sendRoom(sent, respond)), expected, label)
    assert.deepEqual(sent, [1], `${label}: the bed room is saved once and never replaced by the empty room`)
    assert.equal(room.placedItems.length, 1, label)
  }
})

test("a plain error that only repeats the refusal text is not treated as the ownership refusal", async () => {
  const sent: number[] = []
  await assert.rejects(
    saveOnboardingRoomKeepingSignupAlive(BED_ROOM(), async (decor) => {
      sent.push(decor.placedItems.length)
      throw new Error(ROOM_DECOR_UNOWNED_ITEM_MESSAGE)
    }),
    /do not own/
  )
  assert.deepEqual(sent, [1])
})

test("the onboarding room save keeps the bed when the server accepts it, and still reports the first error when the empty room fails too", async () => {
  const room = BED_ROOM()
  const sent: number[] = []
  const result = await saveOnboardingRoomKeepingSignupAlive(room, sendRoom(sent, () => new Response(SAVED_BODY, { status: 200 })))
  assert.equal(result.kind, "saved")
  assert.deepEqual(sent, [1])

  const bothFail: number[] = []
  await assert.rejects(
    saveOnboardingRoomKeepingSignupAlive(room, sendRoom(bothFail, () =>
      bothFail.length === 1
        ? new Response(JSON.stringify({ error: ROOM_DECOR_UNOWNED_ITEM_MESSAGE }), { status: 400 })
        : new Response(JSON.stringify({ error: "Try again soon." }), { status: 503 })
    )),
    /do not own/
  )
  assert.deepEqual(bothFail, [1, 0])
})
