import assert from "node:assert/strict"
import test from "node:test"
import { formatRoomOwnerLabel, turkishGenitiveSuffix } from "./roomOwnerLabel"

test("Turkish genitive follows vowel harmony and buffers a final vowel", () => {
  assert.equal(turkishGenitiveSuffix("Evren"), "in")
  assert.equal(turkishGenitiveSuffix("Arda"), "nın")
  assert.equal(turkishGenitiveSuffix("Ayşe"), "nin")
  assert.equal(turkishGenitiveSuffix("Doğu"), "nun")
  assert.equal(turkishGenitiveSuffix("Mert"), "in")
  assert.equal(turkishGenitiveSuffix("Burak"), "ın")
  assert.equal(turkishGenitiveSuffix("Umut"), "un")
  assert.equal(turkishGenitiveSuffix("Göktürk"), "ün")
  assert.equal(turkishGenitiveSuffix("Işıl"), "ın")
  assert.equal(turkishGenitiveSuffix("İpek"), "in")
  assert.equal(turkishGenitiveSuffix("Zoë"), "nin")
})

test("the room label uses the first name in the app language", () => {
  assert.equal(formatRoomOwnerLabel("Evren Aksu", "tr"), "Evren’in odası")
  assert.equal(formatRoomOwnerLabel("  Arda ", "tr"), "Arda’nın odası")
  assert.equal(formatRoomOwnerLabel("Evren Aksu", "en"), "Evren’s room")
})

test("no label without a usable name", () => {
  assert.equal(formatRoomOwnerLabel("", "tr"), null)
  assert.equal(formatRoomOwnerLabel(null, "en"), null)
  assert.equal(formatRoomOwnerLabel("   ", "tr"), null)
  assert.equal(formatRoomOwnerLabel("123", "tr"), null)
})
