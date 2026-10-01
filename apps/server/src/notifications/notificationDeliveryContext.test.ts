import assert from "node:assert/strict"
import test from "node:test"
import {
  createNotificationRelevanceCheck,
  createRecipientLocaleResolver
} from "./notificationDeliveryContext"

const NOW = new Date("2026-09-30T10:00:00.000Z")

function createCheck(overrides: {
  allowed?: Set<string>
  blocked?: Array<[string, string]>
  threads?: Record<string, string[]>
  invites?: Record<string, { status: string; expiresAt?: string; senderUserId: string; recipientUserId: string }>
} = {}) {
  const allowed = overrides.allowed ?? new Set(["recipient", "partner"])
  const blocked = overrides.blocked ?? []
  return createNotificationRelevanceCheck({
    isUserAllowed: async (userId) => allowed.has(userId),
    hasBlockBetween: async (a, b) => blocked.some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
    findThread: async (threadId) => overrides.threads?.[threadId]
      ? { participantUserIds: overrides.threads[threadId]! }
      : null,
    findRoomInvite: async (inviteId) => overrides.invites?.[inviteId] ?? null
  })
}

const push = (data: Record<string, string>) => ({
  userId: "recipient",
  notification: { title: "Blumi", body: "Update", data }
})

test("banned, suspended or deleted recipients receive nothing", async () => {
  const check = createCheck({ allowed: new Set(["partner"]) })
  assert.equal(await check(push({ type: "discovery.match", matchId: "m", partnerUserId: "partner" }), NOW), false)
  assert.equal(await check({ userId: "recipient", notification: { title: "Blumi", body: "Update" } }, NOW), false)
})

test("a block or a removed conversation cancels queued chat and invite pushes", async () => {
  const threads = { thread_1: ["recipient", "partner"] }
  const invites = { invite_1: { status: "pending", expiresAt: "2026-09-30T10:10:00.000Z", senderUserId: "partner", recipientUserId: "recipient" } }
  const message = push({ type: "chat.message", threadId: "thread_1", messageId: "m1" })
  const invite = push({ type: "chat.room_invite", threadId: "thread_1", inviteId: "invite_1" })
  assert.equal(await createCheck({ threads, invites })(message, NOW), true)
  assert.equal(await createCheck({ threads, invites })(invite, NOW), true)
  assert.equal(await createCheck({ threads, invites, blocked: [["partner", "recipient"]] })(message, NOW), false)
  assert.equal(await createCheck({ threads, invites, blocked: [["recipient", "partner"]] })(invite, NOW), false)
  assert.equal(await createCheck({ invites })(message, NOW), false)
  assert.equal(await createCheck({ threads: { thread_1: ["partner", "someone_else"] } })(message, NOW), false)
})

test("an answered, cancelled, expired or foreign room invite is not pushed", async () => {
  const threads = { thread_1: ["recipient", "partner"] }
  const invite = (status: string, expiresAt = "2026-09-30T10:10:00.000Z", recipientUserId = "recipient") =>
    createCheck({ threads, invites: { invite_1: { status, expiresAt, senderUserId: "partner", recipientUserId } } })(
      push({ type: "chat.room_invite", threadId: "thread_1", inviteId: "invite_1" }), NOW)
  assert.equal(await invite("pending"), true)
  assert.equal(await invite("accepted"), false)
  assert.equal(await invite("declined"), false)
  assert.equal(await invite("cancelled"), false)
  assert.equal(await invite("pending", "2026-09-30T09:59:59.000Z"), false)
  assert.equal(await invite("pending", undefined, "partner"), false)
  assert.equal(await createCheck({ threads })(push({ type: "chat.room_invite", threadId: "thread_1", inviteId: "gone" }), NOW), false)
})

test("likes, matches and Discovery Watch pushes stop once either side blocks", async () => {
  const blocked: Array<[string, string]> = [["recipient", "partner"]]
  assert.equal(await createCheck()(push({ type: "discovery.like", sourceUserId: "partner" }), NOW), true)
  assert.equal(await createCheck({ blocked })(push({ type: "discovery.like", sourceUserId: "partner" }), NOW), false)
  assert.equal(await createCheck({ blocked })(push({ type: "discovery.match", matchId: "m", partnerUserId: "partner" }), NOW), false)
  assert.equal(await createCheck({ blocked })(push({ type: "discovery.watch_match", profileId: "partner" }), NOW), false)
  assert.equal(await createCheck({ blocked })(push({ type: "discovery.match", matchId: "legacy_without_partner" }), NOW), true)
})

test("the recipient locale comes from the stored terms acceptance and defaults to unknown", async () => {
  const accounts: Record<string, { acceptedTerms?: { locale: "en" | "tr" } } | null> = {
    tr_user: { acceptedTerms: { locale: "tr" } },
    en_user: { acceptedTerms: { locale: "en" } },
    no_terms: {},
    missing: null
  }
  const resolve = createRecipientLocaleResolver({ findAccountByUserId: async (userId) => accounts[userId] ?? null })
  assert.equal(await resolve("tr_user"), "tr")
  assert.equal(await resolve("en_user"), "en")
  assert.equal(await resolve("no_terms"), undefined)
  assert.equal(await resolve("missing"), undefined)
})
