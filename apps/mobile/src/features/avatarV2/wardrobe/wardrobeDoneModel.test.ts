import assert from "node:assert/strict"
import test from "node:test"
import { resolveWardrobeDoneDecision } from "./wardrobeDoneModel"

const idle = { isSaving: false, hasPendingTryOn: false, saveErrorMessage: null }

test("Done closes once nothing is pending and no save failed", () => {
  assert.equal(resolveWardrobeDoneDecision(idle), "close")
})

test("Done waits while a save is in flight or a try-on awaits confirmation", () => {
  assert.equal(resolveWardrobeDoneDecision({ ...idle, isSaving: true }), "wait")
  assert.equal(resolveWardrobeDoneDecision({ ...idle, hasPendingTryOn: true }), "wait")
})

test("Done never closes over a failed save", () => {
  assert.equal(
    resolveWardrobeDoneDecision({ ...idle, saveErrorMessage: "Could not save" }),
    "blocked"
  )
})

test("an in-flight save wins over an older error while it is being retried", () => {
  assert.equal(
    resolveWardrobeDoneDecision({ ...idle, isSaving: true, saveErrorMessage: "old" }),
    "wait"
  )
})
