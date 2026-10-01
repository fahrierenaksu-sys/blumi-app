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
  assert.equal(copy.unknownPartner, "Biri")
  assert.equal(copy.youPrefix, "Sen")
  assert.equal(copy.unreadMessages(2), "2 okunmamış mesaj")
  assert.equal(copy.openChatHint, "Sohbeti açar.")
  assert.equal(copy.time.yesterday, "Dün")
  assert.equal(copy.time.minutes(5), "5 dk")
})

test("inbox copy retains the English journey", () => {
  const copy = getInboxCopy("en")

  assert.equal(copy.title, "Chats")
  assert.equal(copy.emptyTitle, "No chats yet")
  assert.equal(copy.discoverPeople, "Discover people")
  assert.equal(copy.tryAgain, "Try again")
  assert.equal(copy.unknownPartner, "Someone")
  assert.equal(copy.youPrefix, "You")
  assert.equal(copy.unreadMessages(1), "1 unread message")
  assert.equal(copy.unreadMessages(4), "4 unread messages")
  assert.equal(copy.openChatHint, "Opens the conversation.")
  assert.equal(copy.time.minutesSpoken(1), "1 minute ago")
})
