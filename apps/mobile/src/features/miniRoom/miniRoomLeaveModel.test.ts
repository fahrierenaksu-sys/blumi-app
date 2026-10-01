import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"
import { getMiniRoomLeaveConfirmation, resolveMiniRoomRemoval } from "./miniRoomLeaveModel"

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
