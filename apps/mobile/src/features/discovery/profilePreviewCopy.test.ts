import assert from "node:assert/strict"
import test from "node:test"
import { getProfilePreviewCopy } from "./profilePreviewCopy"

test("profile preview explains server view-only capability in both release languages", () => {
  assert.match(getProfilePreviewCopy("en").viewOnlyExplanation, /not available for a decision/i)
  assert.match(getProfilePreviewCopy("tr").viewOnlyExplanation, /karar/i)
  assert.equal(getProfilePreviewCopy("en").loading, "Preparing view…")
  assert.equal(getProfilePreviewCopy("tr").backToDiscover, "Keşfet'e dön")
})

test("profile preview context actions read naturally in both release languages", () => {
  const english = getProfilePreviewCopy("en")
  const turkish = getProfilePreviewCopy("tr")
  assert.equal(english.backToChat, "Back to chat")
  assert.equal(turkish.backToChat, "Sohbete dön")
  assert.equal(english.inviteToRoom, "Invite to room")
  assert.equal(turkish.inviteToRoom, "Odaya davet et")
  assert.equal(turkish.yourMatch, "Eşleşmen")
  assert.match(turkish.inviteToRoomHint("Ada"), /Ada/)
  assert.match(turkish.selfPreviewNote, /Keşfet/)
  assert.deepEqual(Object.keys(turkish).sort(), Object.keys(english).sort())
})
