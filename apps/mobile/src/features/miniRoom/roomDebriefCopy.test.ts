import assert from "node:assert/strict"
import test from "node:test"
import { getRoomDebriefCopy } from "./roomDebriefCopy"

test("Room debrief closes the text-chat room journey in Turkish without implying audio is required", () => {
  const copy = getRoomDebriefCopy("tr")

  assert.equal(copy.eyebrow, "Oda sona erdi")
  assert.equal(copy.duration(30), "30 sn birlikte")
  assert.equal(copy.duration(120), "2 dk birlikte")
  assert.equal(copy.duration(125), "2 dk 5 sn birlikte")
  assert.equal(copy.notConnectedMeta, "Tam olarak bağlanamadınız")
  assert.equal(copy.passLabel, "Geç")
  assert.equal(copy.keepLabel, "Bu anı sakla")
  assert.match(copy.decisionPending, /Bağlantı geri geldiğinde/)
  assert.match(copy.decisionError, /kaydedemedik/)
  assert.match(copy.title("Ada", true), /Ada/)
  assert.equal(copy.title("Ada", false), "Bu oda tam olarak akmadı.")
  assert.match(copy.momentLine(false, 0), /belki/)
  assert.match(copy.momentLine(true, 12), /merhaba/)
  assert.match(copy.momentLine(true, 70), /kıvılcım/)
  assert.match(copy.momentLine(true, 120), /zaman ayırdınız/)
  assert.doesNotMatch(copy.subhead, /ses|audio/i)
})

test("Room debrief keeps the English completion decision clear", () => {
  const copy = getRoomDebriefCopy("en")

  assert.equal(copy.duration(60), "1 min together")
  assert.equal(copy.duration(61), "1 min 1s together")
  assert.equal(copy.duration(30), "30s together")
  assert.equal(copy.title("Ada", false), "That room did not quite land.")
  assert.match(copy.momentLine(false, 0), /soft maybe/)
  assert.match(copy.momentLine(true, 12), /quick hello/)
  assert.match(copy.momentLine(true, 70), /first spark/)
  assert.match(copy.momentLine(true, 120), /pocket of time/)
  assert.equal(copy.passAccessibilityLabel, "Pass on this connection")
  assert.equal(copy.keepAccessibilityLabel, "Keep this connection")
  assert.equal(copy.decideLater, "Decide later")
})
