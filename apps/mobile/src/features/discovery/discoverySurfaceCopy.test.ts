import assert from "node:assert/strict"
import test from "node:test"
import { getDiscoverySurfaceCopy } from "./discoverySurfaceCopy"

test("Discovery surface copy is complete and consistent in Turkish", () => {
  const copy = getDiscoverySurfaceCopy("tr")

  assert.equal(copy.actions.pass, "Geç")
  assert.equal(copy.actions.like, "Beğen")
  assert.equal(copy.card.likeStamp, "BEĞEN")
  assert.equal(copy.card.passStamp, "GEÇ")
  assert.equal(copy.empty.loadingTitle, "Sana uygun kişiler aranıyor…")
  assert.equal(copy.empty.errorAction, "Tekrar dene")
  assert.equal(copy.empty.refreshAction, "Tekrar kontrol et")
  assert.equal(copy.empty.quotaUsage(3, 10), "Bugün 3/10 karar kullandın.")
})

test("Discovery surface copy preserves a complete English experience", () => {
  const copy = getDiscoverySurfaceCopy("en")

  assert.equal(copy.actions.pass, "Pass")
  assert.equal(copy.actions.like, "Like")
  assert.equal(copy.card.privateLocation, "Location private")
  assert.equal(copy.empty.loadingBody, "This usually takes a moment.")
  assert.equal(copy.empty.quotaUsage(3, 10), "3/10 decisions used today.")
})
