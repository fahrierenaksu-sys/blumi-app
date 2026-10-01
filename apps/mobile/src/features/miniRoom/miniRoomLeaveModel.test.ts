import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"
import {
  classifyMiniRoomLeaveFailure,
  getMiniRoomExitDestination,
  getMiniRoomLeaveConfirmation,
  MINI_ROOM_LEAVE_EXIT_WAIT_MS,
  MINI_ROOM_LEAVE_RETRY_DELAYS_MS,
  resolveMiniRoomRemoval
} from "./miniRoomLeaveModel"

test("room exit returns to the existing conversation without another match decision", () => {
  assert.deepEqual(getMiniRoomExitDestination("existing_thread"), { name: "ChatThread", threadId: "existing_thread" })
  assert.deepEqual(getMiniRoomExitDestination(undefined), { name: "Inbox" })
  assert.deepEqual(getMiniRoomExitDestination("existing_thread", true), { name: "Inbox" }, "a blocked partner's chat must not reopen")
})

// UX audit ROOM-08: the top-left arrow looks like a plain back button but
// ended the room for both people at once. Leaving now asks first, and the
// Android back button / any other removal goes through the same question.

test("leaving the room asks first, in Turkish and English", () => {
  const tr = getMiniRoomLeaveConfirmation(getMiniRoomCopy("tr"))
  assert.equal(tr.title, "Odadan ayrılmak istiyor musun?")
  assert.equal(tr.message, "Oda ikiniz için de kapanır.")
  assert.deepEqual(tr.buttons, [
    { text: "Kal", style: "cancel", action: "stay" },
    { text: "Odadan ayrıl", style: "destructive", action: "leave" }
  ])

  const en = getMiniRoomLeaveConfirmation(getMiniRoomCopy("en"))
  assert.equal(en.title, "Leave the room?")
  assert.equal(en.message, "The room closes for both of you.")
  assert.deepEqual(en.buttons.map((button) => button.text), ["Stay", "Leave room"])
})

test("the room screen is removed without asking only once the room has ended", () => {
  assert.equal(resolveMiniRoomRemoval({ exited: false }), "confirm")
  assert.equal(resolveMiniRoomRemoval({ exited: true }), "allow")
})

// 2026-10-01 owner report: the back arrow kept people inside a connected room
// with "Odadan çıkış sunucuda doğrulanamadı…" whenever the leave request got
// anything but 200 (a replaced session token, a request limit, a database
// blip, a timeout, or a room that no longer exists). The answer now decides
// only how the close is confirmed; the person always gets out.
test("a leave answer is read as closed, worth retrying, or not confirmable", () => {
  // Nothing left to close: the room ended or no longer exists.
  assert.equal(classifyMiniRoomLeaveFailure(404), "left")
  assert.equal(classifyMiniRoomLeaveFailure(410), "left")
  // No answer, a timeout, a limit, a race or a server/database failure.
  for (const status of [null, 0, 408, 409, 425, 429, 500, 502, 503, 504]) {
    assert.equal(classifyMiniRoomLeaveFailure(status), "retry", String(status))
  }
  // Answers the same request cannot change by retrying.
  for (const status of [400, 401, 403, 413]) {
    assert.equal(classifyMiniRoomLeaveFailure(status), "stop", String(status))
  }
})

test("the leave flow waits briefly for the server and retries a bounded number of times", () => {
  assert.ok(MINI_ROOM_LEAVE_EXIT_WAIT_MS <= 5_000, "a slow network never holds the person in the room for long")
  assert.ok(MINI_ROOM_LEAVE_RETRY_DELAYS_MS.length > 0 && MINI_ROOM_LEAVE_RETRY_DELAYS_MS.length <= 4)
  const total = MINI_ROOM_LEAVE_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0)
  assert.ok(total <= 30_000, "background retries end within half a minute")
})
