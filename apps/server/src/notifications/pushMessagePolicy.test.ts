import assert from "node:assert/strict"
import test from "node:test"
import {
  PUSH_ROUTED_TYPES,
  resolvePushCopy,
  resolvePushDeliveryOptions,
  toOutgoingPushNotification
} from "./pushMessagePolicy"

test("every routed push type has neutral Turkish and English copy without personal data", () => {
  for (const type of PUSH_ROUTED_TYPES) {
    for (const locale of ["en", "tr"] as const) {
      const copy = resolvePushCopy(type, locale)
      assert.ok(copy, `${type} ${locale} copy`)
      assert.ok(copy.title.length > 0 && copy.title.length <= 120)
      assert.ok(copy.body.length > 0 && copy.body.length <= 240)
      assert.doesNotMatch(`${copy.title} ${copy.body}`, /\$\{|\{\{|undefined/)
    }
    assert.notDeepEqual(resolvePushCopy(type, "en"), resolvePushCopy(type, "tr"))
  }
  assert.equal(resolvePushCopy("chat.message", "tr")?.body, "Yeni bir mesajın var.")
  assert.equal(resolvePushCopy("unknown.type", "en"), null)
  assert.equal(resolvePushCopy(undefined, "en"), null)
})

test("the device payload carries routing ids and the recipient only, never server-side ids", () => {
  const outgoing = (type: string, data: Record<string, string>) =>
    toOutgoingPushNotification({
      userId: "user_recipient",
      notification: { title: "Blumi", body: "Update", data: { type, ...data } }
    }).data

  assert.deepEqual(outgoing("chat.message", { threadId: "t1", messageId: "m1", text: "secret" }),
    { type: "chat.message", threadId: "t1", messageId: "m1", recipientUserId: "user_recipient" })
  assert.deepEqual(outgoing("chat.room_invite", {
    threadId: "t1", inviteId: "i1", expiresAt: "2026-09-30T10:10:00.000Z", senderName: "Ada"
  }), {
    type: "chat.room_invite", threadId: "t1", inviteId: "i1",
    expiresAt: "2026-09-30T10:10:00.000Z", recipientUserId: "user_recipient"
  })
  assert.deepEqual(outgoing("discovery.like", { sourceUserId: "liker" }),
    { type: "discovery.like", recipientUserId: "user_recipient" })
  assert.deepEqual(outgoing("discovery.match", { matchId: "match_1", partnerUserId: "partner" }),
    { type: "discovery.match", matchId: "match_1", recipientUserId: "user_recipient" })
  assert.deepEqual(outgoing("discovery.watch_match", { profileId: "candidate", eventId: "discovery-watch:user_recipient:g1" }),
    { type: "discovery.watch_match", recipientUserId: "user_recipient" })
  assert.deepEqual(outgoing("something.else", { secret: "value" }),
    { type: "something.else", recipientUserId: "user_recipient" })
  assert.deepEqual(toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "Update" }
  }).data, { recipientUserId: "user_recipient" })
})

test("delivery options group per conversation, stay within APNs limits and follow the event lifetime", () => {
  const longThreadId = `thread_match_${"x".repeat(120)}`
  const chat = resolvePushDeliveryOptions({ type: "chat.message", threadId: longThreadId, messageId: "m1" })
  const sameThread = resolvePushDeliveryOptions({ type: "chat.message", threadId: longThreadId, messageId: "m2" })
  const otherThread = resolvePushDeliveryOptions({ type: "chat.message", threadId: "thread_other", messageId: "m3" })
  assert.equal(chat.priority, "high")
  assert.equal(chat.channelId, "default")
  assert.ok(chat.collapseId && Buffer.byteLength(chat.collapseId) <= 64)
  assert.equal(chat.collapseId, sameThread.collapseId)
  assert.notEqual(chat.collapseId, otherThread.collapseId)
  assert.equal(chat.threadId, sameThread.threadId)
  assert.doesNotMatch(chat.collapseId ?? "", /thread_match/)

  const invite = resolvePushDeliveryOptions({
    type: "chat.room_invite", threadId: longThreadId, inviteId: "i1", expiresAt: "2026-09-30T10:10:00.000Z"
  })
  assert.equal(invite.priority, "high")
  assert.equal(invite.expiration, Date.parse("2026-09-30T10:10:00.000Z") / 1000)
  assert.equal(invite.threadId, chat.threadId, "invites group with their conversation")
  assert.notEqual(invite.collapseId, chat.collapseId, "an invite never replaces a message notification")

  const like = resolvePushDeliveryOptions({ type: "discovery.like", sourceUserId: "liker" })
  assert.equal(like.priority, undefined)
  assert.equal(like.ttlSeconds, 24 * 60 * 60)
  assert.equal(like.collapseId, "likes")

  const match = resolvePushDeliveryOptions({ type: "discovery.match", matchId: "match_1" })
  assert.equal(match.priority, "high")
  assert.ok(match.collapseId && Buffer.byteLength(match.collapseId) <= 64)

  assert.equal(resolvePushDeliveryOptions({ type: "chat.room_invite", threadId: "t", inviteId: "i", expiresAt: "not-a-date" }).expiration, undefined)
  assert.deepEqual(resolvePushDeliveryOptions(undefined), { channelId: "default" })
})

test("a chat message push reads like a messaging app: sender name, sender picture and the message text", () => {
  const imageUrl = "https://api.example.test/v1/notification-portraits/sealed"
  const message = toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "Yeni bir mesajın var.", data: { type: "chat.message", threadId: "thread_1", messageId: "message_1" } },
    sender: { displayName: "  Ada‮  Lovelace ", imageUrl, messageText: "Hello\n\nthere   friend" },
    locale: "tr"
  })
  assert.equal(message.title, "Ada Lovelace")
  assert.equal(message.body, "Hello there friend")
  assert.equal(message.data?.senderImage, imageUrl)
  assert.equal(message.delivery?.categoryId, "CHAT_MESSAGE")
  assert.equal(message.delivery?.mutableContent, true)
  assert.equal(message.delivery?.imageUrl, imageUrl)
  assert.ok(message.delivery?.collapseId, "grouping and dedupe options are kept")
  for (const id of ["thread_1", "message_1", "user_recipient"]) {
    assert.ok(!`${message.title} ${message.body}`.includes(id), "no ids in visible text")
  }

  const long = toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "x", data: { type: "chat.message", threadId: "t", messageId: "m" } },
    sender: { displayName: "Ada", messageText: "ç".repeat(500) }
  })
  assert.equal(Array.from(long.body).length, 140)
  assert.ok(long.body.endsWith("…"))
  assert.equal(long.data?.senderImage, undefined)
  assert.equal(long.delivery?.mutableContent, undefined, "no picture, no extension run")

  const empty = (locale: "en" | "tr") => toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "x", data: { type: "chat.message", threadId: "t", messageId: "m" } },
    sender: { displayName: "Ada", messageText: "  " },
    locale
  }).body
  assert.equal(empty("tr"), "Sana bir mesaj gönderdi")
  assert.equal(empty("en"), "sent you a message")
})

test("a room invite push names the sender in the recipient's language and carries the invite category", () => {
  const invite = (locale: "en" | "tr") => toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "neutral", data: { type: "chat.room_invite", threadId: "t1", inviteId: "i1", expiresAt: "2026-09-30T10:10:00.000Z" } },
    sender: { displayName: "Ada", imageUrl: "https://api.example.test/p", messageText: "never shown" },
    locale
  })
  assert.deepEqual([invite("tr").title, invite("tr").body], ["Ada", "Ada seni odasına davet etti"])
  assert.deepEqual([invite("en").title, invite("en").body], ["Ada", "Ada invited you to their room"])
  assert.equal(invite("en").delivery?.categoryId, "ROOM_INVITE")
  assert.equal(invite("en").delivery?.mutableContent, true)
  assert.equal(invite("en").data?.inviteId, "i1", "routing data is unchanged")
})

test("without a known sender the neutral copy is sent, and other types never take sender details", () => {
  const neutral = toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Blumi", body: "You have a new message.", data: { type: "chat.message", threadId: "t", messageId: "m" } },
    sender: { imageUrl: "javascript:alert(1)", messageText: "secret" }
  })
  assert.deepEqual([neutral.title, neutral.body], ["Blumi", "You have a new message."])
  assert.equal(neutral.data?.senderImage, undefined)
  assert.equal(neutral.delivery?.categoryId, "CHAT_MESSAGE")

  const like = toOutgoingPushNotification({
    userId: "user_recipient",
    notification: { title: "Someone likes your vibe", body: "Open Blumi", data: { type: "discovery.like" } },
    sender: { displayName: "Ada", imageUrl: "https://api.example.test/p", messageText: "secret" }
  })
  assert.deepEqual([like.title, like.body], ["Someone likes your vibe", "Open Blumi"])
  assert.equal(like.data?.senderImage, undefined)
  assert.equal(like.delivery?.categoryId, undefined)
})
