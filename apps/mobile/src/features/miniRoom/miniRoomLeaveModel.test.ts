import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"
import {
  classifyMiniRoomLeaveFailure,
  CLOSED_MINI_ROOM_LEAVE_PROMPT,
  getMiniRoomExitDestination,
  getMiniRoomLeaveConfirmation,
  MINI_ROOM_LEAVE_EXIT_WAIT_MS,
  MINI_ROOM_LEAVE_RETRY_DELAYS_MS,
  nextMiniRoomLeavePrompt,
  resolveMiniRoomRemoval,
  countScreensAboveRoom
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
  const en = getMiniRoomLeaveConfirmation(getMiniRoomCopy("en"))
  for (const confirmation of [tr, en]) {
    assert.ok(confirmation.title.trim().length > 0)
    assert.ok(confirmation.message.trim().length > 0)
    assert.deepEqual(
      confirmation.buttons.map(({ style, action }) => ({ style, action })),
      [{ style: "cancel", action: "stay" }, { style: "destructive", action: "leave" }]
    )
    for (const button of confirmation.buttons) assert.ok(button.text.trim().length > 0)
  }
  assert.notEqual(tr.title, en.title)
  assert.notEqual(tr.message, en.message)
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

test("the leave prompt never outlives the room and never leaves a room that already ended", () => {
  // Arrange
  const open = nextMiniRoomLeavePrompt(CLOSED_MINI_ROOM_LEAVE_PROMPT, "ask", false).prompt

  // Act
  const ended = nextMiniRoomLeavePrompt(open, "roomEnded", false)
  const askedAfterExit = nextMiniRoomLeavePrompt(CLOSED_MINI_ROOM_LEAVE_PROMPT, "ask", true)
  const lateLeave = nextMiniRoomLeavePrompt(open, "leave", true)
  const leaveWithoutPrompt = nextMiniRoomLeavePrompt(CLOSED_MINI_ROOM_LEAVE_PROMPT, "leave", false)

  // Assert
  assert.equal(open.visible, true)
  assert.deepEqual(ended, { prompt: CLOSED_MINI_ROOM_LEAVE_PROMPT, requestLeave: false })
  assert.equal(askedAfterExit.prompt.visible, false)
  assert.equal(lateLeave.requestLeave, false)
  assert.equal(leaveWithoutPrompt.requestLeave, false)
})

test("the leave prompt leaves a live room once on confirm and closes on stay", () => {
  const open = nextMiniRoomLeavePrompt(CLOSED_MINI_ROOM_LEAVE_PROMPT, "ask", false).prompt

  const leave = nextMiniRoomLeavePrompt(open, "leave", false)
  const stay = nextMiniRoomLeavePrompt(open, "stay", false)

  assert.deepEqual(leave, { prompt: CLOSED_MINI_ROOM_LEAVE_PROMPT, requestLeave: true })
  assert.deepEqual(stay, { prompt: CLOSED_MINI_ROOM_LEAVE_PROMPT, requestLeave: false })
})

test("a removal of the live room while another screen covers it closes that screen first and asks in the room", () => {
  // A deep link pushed the wardrobe over the live room; a later link (blumi://room) pops back past the room.
  assert.equal(resolveMiniRoomRemoval({ exited: false, roomFocused: false }), "revealAndConfirm")
  const stack = [{ key: "home" }, { key: "chat" }, { key: "room" }, { key: "wardrobe" }]
  assert.equal(countScreensAboveRoom(stack, "room"), 1)
})

test("a removal of the room on screen asks in place, and an ended room always goes", () => {
  assert.equal(resolveMiniRoomRemoval({ exited: false, roomFocused: true }), "confirm")
  assert.equal(resolveMiniRoomRemoval({ exited: true, roomFocused: false }), "allow")
  assert.equal(countScreensAboveRoom([{ key: "home" }, { key: "room" }], "room"), 0)
  assert.equal(countScreensAboveRoom([{ key: "home" }], "room"), 0)
})
