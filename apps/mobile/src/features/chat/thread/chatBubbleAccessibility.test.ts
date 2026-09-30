import assert from "node:assert/strict"
import test from "node:test"
import { getChatBubbleAccessibilityLabel } from "./chatBubbleAccessibility"
import { CHAT_COPY } from "./chatThreadCopy"

test("my delivered message reads sender, words, time, then delivery state", () => {
  const label = getChatBubbleAccessibilityLabel({
    body: "Selam!",
    time: "14:32",
    isMe: true,
    deliveryState: "sent",
    partnerName: "Deniz",
    copy: CHAT_COPY.tr
  })
  assert.equal(label, "Sen, Selam!, 14:32, gönderildi")
})

test("my pending and failed messages announce their state", () => {
  const base = {
    body: "Hi",
    time: "09:05",
    isMe: true,
    partnerName: "Deniz",
    copy: CHAT_COPY.en
  }
  assert.equal(
    getChatBubbleAccessibilityLabel({ ...base, deliveryState: "sending" }),
    "You, Hi, 09:05, sending"
  )
  assert.equal(
    getChatBubbleAccessibilityLabel({ ...base, deliveryState: "failed" }),
    "You, Hi, 09:05, not sent"
  )
})

test("the partner's message names the partner and never reports a delivery state", () => {
  const label = getChatBubbleAccessibilityLabel({
    body: "Nasılsın?",
    time: "10:00",
    isMe: false,
    deliveryState: "sent",
    partnerName: "Deniz",
    copy: CHAT_COPY.tr
  })
  assert.equal(label, "Deniz, Nasılsın?, 10:00")
})

test("an unparseable time is left out instead of reading an empty part", () => {
  const label = getChatBubbleAccessibilityLabel({
    body: "Hey",
    time: "",
    isMe: false,
    deliveryState: "sent",
    partnerName: "Deniz",
    copy: CHAT_COPY.en
  })
  assert.equal(label, "Deniz, Hey")
})

test("a blank partner name falls back to the unknown-partner copy", () => {
  const label = getChatBubbleAccessibilityLabel({
    body: "Hey",
    time: "10:00",
    isMe: false,
    deliveryState: "sent",
    partnerName: "   ",
    copy: CHAT_COPY.en
  })
  assert.equal(label, `${CHAT_COPY.en.unknownPartner}, Hey, 10:00`)
})
