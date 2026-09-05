import assert from "node:assert/strict"
import test from "node:test"
import { getInboxCopy } from "./inboxCopy"

test("inbox copy keeps the Turkish empty state honest and actionable", () => {
  const copy = getInboxCopy("tr")

  assert.equal(copy.title, "Sohbetler")
  assert.equal(copy.emptyTitle, "Henüz sohbet yok")
  assert.match(copy.emptyBody, /eşleşme/i)
  assert.equal(copy.discoverPeople, "Keşfet")
  assert.equal(copy.tryAgain, "Tekrar dene")
})

test("inbox copy retains the English journey", () => {
  const copy = getInboxCopy("en")

  assert.equal(copy.title, "Chats")
  assert.equal(copy.emptyTitle, "No chats yet")
  assert.equal(copy.discoverPeople, "Discover people")
  assert.equal(copy.tryAgain, "Try again")
})
