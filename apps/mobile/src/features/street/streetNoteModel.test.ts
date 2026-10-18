import assert from "node:assert/strict"
import test from "node:test"
import {
  STREET_NOTE_MAX_LENGTH,
  normalizeStreetNote,
  streetLightForHour,
  streetNoteCharactersLeft
} from "./streetNoteModel"

test("a note is one trimmed line; only spaces is no note", () => {
  assert.equal(normalizeStreetNote("  Bu akşam\n\nfilm   önerisi lazım  "), "Bu akşam film önerisi lazım")
  assert.equal(normalizeStreetNote(" \n\t "), null)
})

test("a long note is cut at 60 characters and an emoji counts once", () => {
  const long = "a".repeat(STREET_NOTE_MAX_LENGTH + 10)
  assert.equal(normalizeStreetNote(long), "a".repeat(STREET_NOTE_MAX_LENGTH))
  const emojiNote = `${"🍿".repeat(STREET_NOTE_MAX_LENGTH)}!`
  assert.equal(Array.from(normalizeStreetNote(emojiNote) ?? "").length, STREET_NOTE_MAX_LENGTH)
  assert.equal(streetNoteCharactersLeft("🍿🍿"), STREET_NOTE_MAX_LENGTH - 2)
  assert.equal(streetNoteCharactersLeft("a".repeat(STREET_NOTE_MAX_LENGTH + 5)), 0)
})

test("the window light follows the hour: morning, day, evening, night", () => {
  assert.equal(streetLightForHour(7), "morning")
  assert.equal(streetLightForHour(13), "day")
  assert.equal(streetLightForHour(19), "evening")
  assert.equal(streetLightForHour(23), "night")
  assert.equal(streetLightForHour(3), "night")
})
