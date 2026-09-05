import assert from "node:assert/strict"
import test from "node:test"
import { getProfilePreviewCopy } from "./profilePreviewCopy"

test("profile preview explains server view-only capability in both release languages", () => {
  assert.match(getProfilePreviewCopy("en").viewOnlyExplanation, /not available for a decision/i)
  assert.match(getProfilePreviewCopy("tr").viewOnlyExplanation, /karar/i)
  assert.equal(getProfilePreviewCopy("en").loading, "Preparing view…")
  assert.equal(getProfilePreviewCopy("tr").backToDiscover, "Keşfet'e dön")
})
