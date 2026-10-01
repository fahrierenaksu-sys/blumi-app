import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { createPushBadgeResolver } from "./pushBadge"
import type { PushNotification } from "./pushProvider"

const NOW = new Date("2026-10-01T10:00:00.000Z")

async function dispatchOne(resolveRecipientBadge?: (userId: string) => Promise<number | undefined>) {
  const sent: PushNotification[] = []
  const asked: string[] = []
  const service = createNotificationService({
    now: () => NOW,
    pushProvider: { async sendPush(_token, notification) { sent.push(notification) } },
    ...(resolveRecipientBadge
      ? { resolveRecipientBadge: async (userId: string) => { asked.push(userId); return resolveRecipientBadge(userId) } }
      : {})
  })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("recipient", {
    title: "Blumi", body: "You have a new message.",
    data: { type: "chat.message", threadId: "thread", messageId: "message" }
  })
  await service.dispatchDue(NOW)
  return { sent, asked }
}

test("every push carries the recipient's unread total as the iOS badge, read at dispatch", async () => {
  const { sent, asked } = await dispatchOne(async () => 4)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.delivery?.badge, 4)
  assert.equal(sent[0]?.delivery?.priority, "high", "the existing delivery options are kept")
  assert.deepEqual(asked, ["recipient"])
})

test("a read conversation clears the badge with an explicit zero", async () => {
  const { sent } = await dispatchOne(async () => 0)
  assert.equal(sent[0]?.delivery?.badge, 0)
})

test("a failed or missing badge lookup never blocks the push", async () => {
  const failed = await dispatchOne(async () => { throw new Error("database unavailable") })
  assert.equal(failed.sent.length, 1)
  assert.equal(failed.sent[0]?.delivery?.badge, undefined)
  const unconfigured = await dispatchOne()
  assert.equal(unconfigured.sent.length, 1)
  assert.equal(unconfigured.sent[0]?.delivery?.badge, undefined)
})

test("the badge resolver bounds slow lookups and rejects nonsense counts", async () => {
  const slow = createPushBadgeResolver(() => new Promise(() => {}), { timeoutMs: 5 })
  assert.equal(await slow("user"), undefined)
  for (const count of [-1, 1.5, Number.NaN]) {
    assert.equal(await createPushBadgeResolver(async () => count)("user"), undefined)
  }
  assert.equal(await createPushBadgeResolver(async () => 1_000_000)("user"), 99_999)
  assert.equal(await createPushBadgeResolver(undefined)("user"), undefined)
})
