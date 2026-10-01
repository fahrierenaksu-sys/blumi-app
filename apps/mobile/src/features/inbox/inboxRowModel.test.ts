import assert from "node:assert/strict"
import test from "node:test"
import { getInboxCopy } from "../chat/inboxCopy"
import {
  buildInboxRowAccessibilityLabel,
  buildInboxRowPreview,
  createInboxTimeFormatter,
  formatInboxTimestamp,
  formatInboxUnreadBadge,
  getInboxClockRefreshDelayMs,
  resolveInboxDateLocale
} from "./inboxRowModel"

// Local-time dates keep day boundaries independent of the machine time zone.
const at = (day: number, hour: number, minute: number, month = 8, year = 2026) =>
  new Date(year, month, day, hour, minute).getTime()
const NOW = at(30, 14, 5)
const en = getInboxCopy("en")
const tr = getInboxCopy("tr")
const enFormat = createInboxTimeFormatter("en-US")
const gbFormat = createInboxTimeFormatter("en-GB")
const trFormat = createInboxTimeFormatter("tr-TR")
const iso = (ms: number) => new Date(ms).toISOString()

test("recent activity reads as now and minutes, live against the clock", () => {
  assert.deepEqual(formatInboxTimestamp(iso(at(30, 14, 4) + 30_000), NOW, en, enFormat), { label: "Now", spoken: "just now" })
  assert.deepEqual(formatInboxTimestamp(iso(at(30, 14, 0)), NOW, en, enFormat), { label: "5m", spoken: "5 minutes ago" })
  assert.deepEqual(formatInboxTimestamp(iso(at(30, 14, 4)), NOW, en, enFormat), { label: "1m", spoken: "1 minute ago" })
  assert.deepEqual(formatInboxTimestamp(iso(at(30, 14, 0)), NOW, tr, trFormat), { label: "5 dk", spoken: "5 dakika önce" })
  // A clock running slightly behind the server never shows a future time.
  assert.equal(formatInboxTimestamp(iso(NOW + 90_000), NOW, en, enFormat).label, "Now")
  // The same message ages as the clock moves on.
  assert.equal(formatInboxTimestamp(iso(at(30, 14, 0)), at(30, 14, 50), en, enFormat).label, "50m")
})

test("earlier today shows the clock time in the device's 12 or 24 hour style", () => {
  const morning = iso(at(30, 9, 7))
  assert.match(formatInboxTimestamp(morning, NOW, en, enFormat).label, /^9:07\sAM$/u)
  assert.equal(formatInboxTimestamp(morning, NOW, en, gbFormat).label, "09:07")
  assert.equal(formatInboxTimestamp(morning, NOW, tr, trFormat).label, "09:07")
})

test("older activity reads yesterday, a weekday, then a date, never '45 days'", () => {
  assert.deepEqual(formatInboxTimestamp(iso(at(29, 22, 0)), NOW, en, enFormat), { label: "Yesterday", spoken: "Yesterday" })
  assert.deepEqual(formatInboxTimestamp(iso(at(29, 22, 0)), NOW, tr, trFormat), { label: "Dün", spoken: "Dün" })
  // 2026-09-26 is a Saturday.
  assert.deepEqual(formatInboxTimestamp(iso(at(26, 12, 0)), NOW, en, enFormat), { label: "Sat", spoken: "Saturday" })
  assert.deepEqual(formatInboxTimestamp(iso(at(26, 12, 0)), NOW, tr, trFormat), { label: "Cmt", spoken: "Cumartesi" })
  const august = formatInboxTimestamp(iso(at(16, 12, 0, 7)), NOW, en, enFormat)
  assert.deepEqual(august, { label: "Aug 16", spoken: "August 16" })
  assert.deepEqual(formatInboxTimestamp(iso(at(16, 12, 0, 7)), NOW, tr, trFormat), { label: "16 Ağu", spoken: "16 Ağustos" })
  const lastYear = formatInboxTimestamp(iso(at(16, 12, 0, 7, 2025)), NOW, en, enFormat)
  assert.match(lastYear.label, /2025/)
  assert.doesNotMatch(lastYear.label, /\bdays?\b/)
})

test("missing or invalid times render nothing", () => {
  assert.deepEqual(formatInboxTimestamp(undefined, NOW, en, enFormat), { label: "", spoken: "" })
  assert.deepEqual(formatInboxTimestamp("not a date", NOW, en, enFormat), { label: "", spoken: "" })
})

test("the clock refreshes at the next minute boundary", () => {
  assert.equal(getInboxClockRefreshDelayMs(at(30, 14, 5)), 60_000 + 250)
  assert.equal(getInboxClockRefreshDelayMs(at(30, 14, 5) + 59_000), 1_000 + 250)
})

test("the date locale keeps the device region only when it speaks the app language", () => {
  assert.equal(resolveInboxDateLocale("en", "en-GB"), "en-GB")
  assert.equal(resolveInboxDateLocale("en", "tr-TR"), "en-US")
  assert.equal(resolveInboxDateLocale("tr", "tr-TR"), "tr-TR")
  assert.equal(resolveInboxDateLocale("tr", "en-US"), "tr-TR")
  assert.equal(resolveInboxDateLocale("tr", undefined), "tr-TR")
})

test("the preview names my own last message and the room invitation", () => {
  const base = { messageId: "m", threadId: "t", sentAt: "2026-09-30T10:00:00Z" }
  assert.deepEqual(
    buildInboxRowPreview({ lastMessage: { ...base, senderUserId: "me", body: "On my way" }, currentUserId: "me", copy: en }),
    { prefix: "You: ", body: "On my way" }
  )
  assert.deepEqual(
    buildInboxRowPreview({ lastMessage: { ...base, senderUserId: "me", body: "Geliyorum" }, currentUserId: "me", copy: tr }),
    { prefix: "Sen: ", body: "Geliyorum" }
  )
  assert.deepEqual(
    buildInboxRowPreview({ lastMessage: { ...base, senderUserId: "partner", body: "Hi!" }, currentUserId: "me", copy: en }),
    { prefix: undefined, body: "Hi!" }
  )
  assert.deepEqual(
    buildInboxRowPreview({ lastMessage: { ...base, senderUserId: "partner", body: " __room_invite__ " }, currentUserId: "me", copy: tr }),
    { prefix: undefined, body: "Blumi Oda daveti" }
  )
  // A multi-line message previews on one flowing line.
  assert.equal(
    buildInboxRowPreview({ lastMessage: { ...base, senderUserId: "partner", body: "one\n\ntwo  " }, currentUserId: "me", copy: en }).body,
    "one two"
  )
  assert.deepEqual(buildInboxRowPreview({ lastMessage: undefined, currentUserId: "me", copy: en }), { prefix: undefined, body: undefined })
})

test("the unread badge counts up to 99+", () => {
  assert.equal(formatInboxUnreadBadge(0), null)
  assert.equal(formatInboxUnreadBadge(-2), null)
  assert.equal(formatInboxUnreadBadge(3), "3")
  assert.equal(formatInboxUnreadBadge(99), "99")
  assert.equal(formatInboxUnreadBadge(140), "99+")
})

test("VoiceOver hears the name, unread count, preview and time in one label", () => {
  assert.equal(
    buildInboxRowAccessibilityLabel(en, {
      partnerName: "Ada", unreadCount: 3, preview: { prefix: undefined, body: "See you there" }, timeSpoken: "5 minutes ago"
    }),
    "Ada, 3 unread messages, See you there, 5 minutes ago"
  )
  assert.equal(
    buildInboxRowAccessibilityLabel(en, {
      partnerName: "Ada", unreadCount: 1, preview: { prefix: "You: ", body: "On my way" }, timeSpoken: "Yesterday"
    }),
    "Ada, 1 unread message, You: On my way, Yesterday"
  )
  assert.equal(
    buildInboxRowAccessibilityLabel(tr, {
      partnerName: "Ayşe", unreadCount: 2, preview: { prefix: "Sen: ", body: "Geliyorum" }, timeSpoken: "5 dakika önce"
    }),
    "Ayşe, 2 okunmamış mesaj, Sen: Geliyorum, 5 dakika önce"
  )
  assert.equal(
    buildInboxRowAccessibilityLabel(tr, {
      partnerName: "Ayşe", unreadCount: 0, preview: { prefix: undefined, body: undefined }, timeSpoken: ""
    }),
    "Ayşe, Bir kıvılcımla başla."
  )
})
