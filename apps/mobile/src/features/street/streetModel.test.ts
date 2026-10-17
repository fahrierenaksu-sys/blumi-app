import assert from "node:assert/strict"
import test from "node:test"
import type { StreetResponse, StreetWindow } from "@blumi/contracts"
import { fetchStreet, saveStreetWindowClosed } from "./streetApi"
import { getStreetCopy } from "./streetCopy"
import {
  EMPTY_STREET_DEVICE_STATE,
  buildStreetView,
  markStreetWindowOpened,
  nextStreetCollapsed,
  previousStreetSnapshot,
  reconcileStreetDeviceState,
  shouldPlayStreetWakeUp,
  streetWindowAccessibilityLabel
} from "./streetModel"

const copy = getStreetCopy("tr")
const ROOM = { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }

function window(threadId: string, overrides: Partial<StreetWindow> = {}): StreetWindow {
  return { threadId, displayName: threadId.toUpperCase(), closed: false, avatar: null, room: ROOM, change: null, unread: 0, ...overrides }
}

function street(windows: StreetWindow[], edition = "2026-10-17"): StreetResponse {
  return { edition, self: { closed: false, room: ROOM }, windows }
}

function jsonResponse(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

test("0 matches: your window, one find-neighbours slot and the inviting street text, never a zero", () => {
  const view = buildStreetView(street([]), copy, new Set())
  assert.deepEqual(view.slots.map((slot) => slot.kind), ["self", "empty"])
  assert.equal(view.footer, copy.buildingStreet)
  assert.ok(!/\b0\b/.test(`${view.note} ${view.footer}`))
})

test("1 match: your window, theirs and one find-neighbours slot", () => {
  const view = buildStreetView(street([window("ece")]), copy, new Set())
  assert.deepEqual(view.slots.map((slot) => slot.kind), ["self", "window", "empty"])
  assert.equal(view.footer, copy.growingStreet)
})

test("6 and 20 matches keep the server order with no empty windows; the note counts news", () => {
  const twenty = Array.from({ length: 20 }, (_, index) => window(`p${index}`, { change: index < 3 ? "dress" : null }))
  const view = buildStreetView(street(twenty), copy, new Set())
  assert.equal(view.slots.length, 21)
  assert.deepEqual(view.slots.slice(1, 4).map((slot) => slot.key), ["p0", "p1", "p2"])
  assert.equal(view.note, copy.newsNote(3))
  assert.equal(view.footer, null)
  const calm = buildStreetView(street(twenty.slice(3, 9)), copy, new Set())
  assert.equal(calm.note, copy.calmNote)
})

test("VoiceOver labels name the change and unread count but never a time", () => {
  const label = streetWindowAccessibilityLabel(window("ece", { change: "dress", unread: 2 }), copy, "Biri")
  assert.equal(label, "ECE. Bu sabah yeni elbise. 2 okunmamış mesaj.")
  assert.ok(!/\d{1,2}[:.]\d{2}|dakika|saat|gün önce/.test(label))
  assert.equal(streetWindowAccessibilityLabel(window("can", { closed: true }), copy, "Biri"), "CAN. Perdeleri kapalı.")
})

test("an unmatched window is purged from the device memory at the next fetch", () => {
  const fetched = reconcileStreetDeviceState(EMPTY_STREET_DEVICE_STATE, street([window("ece"), window("can")]))
  const opened = markStreetWindowOpened(fetched, window("ece"), "2026-10-17")
  const withBoth = markStreetWindowOpened(opened, window("can"), "2026-10-17")
  const after = reconcileStreetDeviceState(withBoth, street([window("can")]))
  assert.deepEqual(Object.keys(after.snapshots), ["can"])
  assert.deepEqual(after.seenThreadIds, ["can"])
})

test("Dün / Bugün is offered only for a changed window with yesterday's state on this device", () => {
  const yesterday = markStreetWindowOpened(EMPTY_STREET_DEVICE_STATE, window("ece"), "2026-10-16")
  const today = reconcileStreetDeviceState(yesterday, street([window("ece", { change: "rug" })]))
  assert.equal(previousStreetSnapshot(today, window("ece", { change: "rug" }), "2026-10-17")?.edition, "2026-10-16")
  assert.equal(previousStreetSnapshot(today, window("ece"), "2026-10-17"), null)
  const reopened = markStreetWindowOpened(today, window("ece", { change: "rug" }), "2026-10-17")
  assert.equal(reopened.snapshots.ece?.edition, "2026-10-16")
})

test("the wake-up plays once per edition and never under Reduce Motion", () => {
  assert.equal(shouldPlayStreetWakeUp(EMPTY_STREET_DEVICE_STATE, "2026-10-17", false), true)
  assert.equal(shouldPlayStreetWakeUp(EMPTY_STREET_DEVICE_STATE, "2026-10-17", true), false)
  assert.equal(shouldPlayStreetWakeUp({ ...EMPTY_STREET_DEVICE_STATE, wakeEdition: "2026-10-17" }, "2026-10-17", false), false)
})

test("the street collapses past 36 pt and opens only back at the top", () => {
  assert.equal(nextStreetCollapsed(false, 20), false)
  assert.equal(nextStreetCollapsed(false, 40), true)
  assert.equal(nextStreetCollapsed(true, 10), true)
  assert.equal(nextStreetCollapsed(true, 0), false)
})

test("flag off: a 404 reads as off, so the Chats tab renders no street", async () => {
  const result = await fetchStreet("https://api.test", "token", jsonResponse(404, { error: "Not found." }))
  assert.deepEqual(result, { kind: "off" })
})

test("a street response with presence or ids is refused", async () => {
  const leaky = { ...street([window("ece")]), windows: [{ ...window("ece"), lastSeen: "2026-10-17T08:00:00.000Z" }] }
  await assert.rejects(fetchStreet("https://api.test", "token", jsonResponse(200, leaky)))
  const ok = await fetchStreet("https://api.test", "token", jsonResponse(200, street([window("ece")])))
  assert.equal(ok.kind, "ready")
})

test("the window switch sends closed and reads back the server's answer", async () => {
  let sent: unknown
  const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ closed: true }), { status: 200, headers: { "content-type": "application/json" } })
  }
  assert.equal(await saveStreetWindowClosed("https://api.test", "token", true, fetcher as typeof fetch), true)
  assert.deepEqual(sent, { closed: true })
})
