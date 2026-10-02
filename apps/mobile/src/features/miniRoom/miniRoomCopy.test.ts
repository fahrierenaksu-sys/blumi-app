import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"

test("MiniRoom copy has the same keys in both languages and names the partner it is given", () => {
  const tr = getMiniRoomCopy("tr")
  const en = getMiniRoomCopy("en")

  // Every key is translated: no language falls back to the other's text.
  assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort())
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(typeof tr[key], typeof en[key], key)
  }
  for (const key of ["connecting", "reconnecting", "connectionFailed", "sendFailedNotice", "historyFailed"] as const) {
    assert.notEqual(tr[key], en[key], key)
  }
  for (const copy of [tr, en]) {
    for (const key of ["roomSubtitle", "welcome", "partnerHere", "partnerBack", "partnerAway"] as const) {
      assert.match(copy[key]("Bora"), /Bora/, key)
    }
    const message = copy.messageFrom("Bora", "Selam")
    assert.match(message, /Bora/)
    assert.match(message, /Selam/)
  }
})

test("an unconfirmed room close reads calmly: the person is already out", () => {
  // 2026-10-01 owner report: the old banner sounded like a failure and asked
  // for a retry inside a room the person had already chosen to leave.
  for (const copy of [getMiniRoomCopy("tr"), getMiniRoomCopy("en")]) {
    assert.ok(copy.leftRoomUnconfirmed.trim().length > 0)
    assert.doesNotMatch(
      copy.leftRoomUnconfirmed,
      /doğrulanamadı|kontrol edip|tekrar dene|could not|check your connection|try again/i
    )
  }
})
