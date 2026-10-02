import assert from "node:assert/strict"
import test from "node:test"
import { getInsertedText, reconcileComposerTextAfterSend } from "./chatComposerDraftModel"

test("a letter pressed together with Send keeps only the letter, not the sent message", () => {
  assert.deepEqual(
    reconcileComposerTextAfterSend({ next: "Nerdesinx", current: "", sentDraft: "Nerdesin" }),
    { text: "x", sentDraft: "Nerdesin" }
  )
  // The caret was not at the end: the letter is still the only thing kept.
  assert.deepEqual(
    reconcileComposerTextAfterSend({ next: "Nerxdesin", current: "", sentDraft: "Nerdesin" }),
    { text: "x", sentDraft: "Nerdesin" }
  )
})

test("several late keystrokes in a row are all reduced to the new characters", () => {
  const first = reconcileComposerTextAfterSend({ next: "Selamx", current: "", sentDraft: "Selam" })
  assert.deepEqual(first, { text: "x", sentDraft: "Selam" })
  const second = reconcileComposerTextAfterSend({ next: "Selamxy", current: first.text, sentDraft: first.sentDraft })
  assert.deepEqual(second, { text: "xy", sentDraft: "Selam" })
})

test("a late echo of the sent text leaves the input empty", () => {
  assert.deepEqual(
    reconcileComposerTextAfterSend({ next: "Nerdesin", current: "", sentDraft: "Nerdesin" }),
    { text: "", sentDraft: "Nerdesin" }
  )
})

test("ordinary typing after the send is never changed and ends the guard", () => {
  assert.deepEqual(reconcileComposerTextAfterSend({ next: "N", current: "", sentDraft: "Nerdesin" }), { text: "N", sentDraft: null })
  assert.deepEqual(reconcileComposerTextAfterSend({ next: "xy", current: "x", sentDraft: "Selam" }), { text: "xy", sentDraft: null })
  assert.deepEqual(reconcileComposerTextAfterSend({ next: "", current: "x", sentDraft: "Selam" }), { text: "", sentDraft: null })
  // A one-character message typed again is a new message, not an echo.
  assert.deepEqual(reconcileComposerTextAfterSend({ next: "?", current: "", sentDraft: "?" }), { text: "?", sentDraft: null })
  // Typing on top of the kept letter wins over reading it as a late change.
  assert.deepEqual(reconcileComposerTextAfterSend({ next: "xa", current: "x", sentDraft: "a" }), { text: "xa", sentDraft: null })
})

test("without a recent send the input shows exactly what was typed", () => {
  for (const next of ["", "hello", "Nerdesinx"]) {
    assert.deepEqual(reconcileComposerTextAfterSend({ next, current: "hell", sentDraft: null }), { text: next, sentDraft: null })
  }
})

test("an insertion is one contiguous run of new characters", () => {
  assert.equal(getInsertedText("abc", "abXc"), "X")
  assert.equal(getInsertedText("abc", "abc"), "")
  assert.equal(getInsertedText("abc", "Xabc"), "X")
  assert.equal(getInsertedText("abc", "ab"), null)
  assert.equal(getInsertedText("abc", "aXbYc"), null)
  assert.equal(getInsertedText("aa", "aaa"), "a")
})
