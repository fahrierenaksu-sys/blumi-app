import assert from "node:assert/strict"
import test from "node:test"
import { getRoomSetupCopy } from "./roomSetupCopy"
import {
  resolveRoomSetupMutationFeedback,
  resolveRoomSetupStatusLine
} from "./roomSetupPlacementFeedback"

const locales = ["tr", "en"] as const

test("a rejected room setup change reports the rejection and never shows success", () => {
  for (const locale of locales) {
    const copy = getRoomSetupCopy(locale)
    for (const action of ["placed", "rotated"] as const) {
      const rejected = resolveRoomSetupMutationFeedback({ accepted: false, action, copy })
      assert.equal(rejected.errorMessage, copy.feedback.mutationRejected)
      assert.equal(rejected.message, undefined)
      assert.equal(rejected.selectBed, false)

      const accepted = resolveRoomSetupMutationFeedback({ accepted: true, action, copy })
      assert.equal(accepted.errorMessage, "")
      assert.equal(accepted.message, copy.placement[action])
    }
    assert.equal(resolveRoomSetupMutationFeedback({ accepted: true, action: "placed", copy }).selectBed, true)
  }
})

test("a failed room save replaces any stale success copy", () => {
  for (const locale of locales) {
    const copy = getRoomSetupCopy(locale)
    const base = {
      errorMessage: "",
      message: copy.placement.placed,
      showMessage: true,
      copy
    }
    assert.deepEqual(
      resolveRoomSetupStatusLine({ ...base, persistenceState: "failed" }),
      { tone: "alert", text: copy.feedback.persistenceAttention }
    )
    assert.deepEqual(
      resolveRoomSetupStatusLine({
        ...base,
        persistenceState: "failed",
        errorMessage: copy.feedback.mutationRejected
      }),
      { tone: "alert", text: copy.feedback.persistenceAttention }
    )
    assert.deepEqual(
      resolveRoomSetupStatusLine({
        ...base,
        persistenceState: "ready",
        errorMessage: copy.feedback.mutationRejected
      }),
      { tone: "alert", text: copy.feedback.mutationRejected }
    )
    assert.deepEqual(
      resolveRoomSetupStatusLine({ ...base, persistenceState: "ready" }),
      { tone: "polite", text: copy.placement.placed }
    )
    assert.equal(resolveRoomSetupStatusLine({ ...base, persistenceState: "ready", showMessage: false }), null)
  }
})
