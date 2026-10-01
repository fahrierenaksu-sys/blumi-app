import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"
import {
  getMiniRoomNoticeText,
  INITIAL_MINI_ROOM_NOTICE_CURSOR,
  resolveMiniRoomNotice,
  type MiniRoomNoticeKind
} from "./miniRoomNoticeModel"

type Step = { joined: boolean; partnerPresent: boolean; refusalRevision?: number; localSeatTakenCount?: number }

function run(steps: Step[]): (MiniRoomNoticeKind | null)[] {
  let cursor = INITIAL_MINI_ROOM_NOTICE_CURSOR
  return steps.map((step) => {
    const result = resolveMiniRoomNotice(cursor, { localSeatTakenCount: 0, ...step })
    cursor = result.cursor
    return result.notice
  })
}

test("the partner arriving, stepping away and coming back each get one notice", () => {
  assert.deepEqual(run([
    { joined: false, partnerPresent: false },
    { joined: true, partnerPresent: false },
    { joined: true, partnerPresent: true },
    { joined: true, partnerPresent: true },
    { joined: true, partnerPresent: false },
    { joined: true, partnerPresent: true }
  ]), [null, null, "partner_here", null, "partner_away", "partner_back"])
})

test("a partner already in the room when this phone joins is announced once", () => {
  assert.deepEqual(run([{ joined: true, partnerPresent: true }, { joined: true, partnerPresent: true }]),
    ["partner_here", null])
})

test("this phone's own reconnect or background gap is never reported as the partner leaving", () => {
  assert.deepEqual(run([
    { joined: true, partnerPresent: true },
    { joined: false, partnerPresent: false },
    { joined: true, partnerPresent: true }
  ]), ["partner_here", null, null])
})

test("a refused seat claim and a tap on a seat the partner holds both say the seat is taken, once each", () => {
  assert.deepEqual(run([
    { joined: true, partnerPresent: true },
    { joined: true, partnerPresent: true, refusalRevision: 4 },
    { joined: true, partnerPresent: true, refusalRevision: 4 },
    { joined: true, partnerPresent: true, refusalRevision: 4, localSeatTakenCount: 1 },
    { joined: true, partnerPresent: true, refusalRevision: 4, localSeatTakenCount: 1 }
  ]), ["partner_here", "seat_taken", null, "seat_taken", null])
})

test("notice text is localized and carries only the partner's first name", () => {
  assert.equal(getMiniRoomNoticeText("partner_away", getMiniRoomCopy("tr"), "Bora"), "Bora odadan uzaklaştı")
  assert.equal(getMiniRoomNoticeText("seat_taken", getMiniRoomCopy("en"), "Bora"), "That seat is taken")
})
