import assert from "node:assert/strict"
import test from "node:test"
import { forEachWithConcurrency } from "./boundedConcurrency"
import { createNotificationService } from "./notificationService"
import { createInMemoryNotificationRepository, type NotificationRepository } from "./notificationRepository"

const NOW = new Date("2026-10-01T10:00:00.000Z")

/** Counts open authorized-send transactions, as PostgreSQL would hold pooled connections. */
function trackingRepository(): { repository: NotificationRepository; maxOpen: () => number } {
  const inner = createInMemoryNotificationRepository()
  let open = 0
  let maxOpen = 0
  const repository: NotificationRepository = {
    ...inner,
    async withAuthorizedDelivery(delivery, now, send) {
      open++
      maxOpen = Math.max(maxOpen, open)
      try { return await inner.withAuthorizedDelivery(delivery, now, send) } finally { open-- }
    }
  }
  return { repository, maxOpen: () => maxOpen }
}

test("a large due batch never holds more than three dispatch transactions open across provider calls", async () => {
  const { repository, maxOpen } = trackingRepository()
  let inFlight = 0
  let maxInFlight = 0
  let sent = 0
  const service = createNotificationService({
    now: () => NOW,
    repository,
    pushProvider: {
      async sendPush() {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 2))
        inFlight--
        sent++
        return { ticketId: `ticket-${sent}` }
      }
    }
  })
  for (let index = 0; index < 75; index++) {
    await service.registerDevice(`user-${index}`, { platform: "ios", pushToken: `token-${index}` })
    await service.sendPushToUser(`user-${index}`, { title: "Blumi", body: "Update" })
  }
  await service.dispatchDue(NOW)
  assert.equal(sent, 75, "every claimed round is drained in the same cycle")
  assert.equal(maxInFlight, 3)
  assert.equal(maxOpen(), 3)
  assert.deepEqual(await repository.listPendingDeliveries(), [])
})

test("per-ticket receipt polling is bounded the same way", async () => {
  let inFlight = 0
  let maxInFlight = 0
  let ticket = 0
  const service = createNotificationService({
    now: () => NOW,
    pushProvider: {
      async sendPush() { return { ticketId: `ticket-${++ticket}` } },
      async getReceipt() {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 2))
        inFlight--
        return { status: "ok" as const }
      }
    }
  })
  for (let index = 0; index < 20; index++) {
    await service.registerDevice(`user-${index}`, { platform: "ios", pushToken: `token-${index}` })
    await service.sendPushToUser(`user-${index}`, { title: "Blumi", body: "Update" })
  }
  await service.dispatchDue(NOW)
  await service.dispatchDue(new Date(NOW.getTime() + 15 * 60_000))
  assert.equal((await service.repository.listReceiptResults()).length, 20)
  assert.equal(maxInFlight, 3)
})

test("bounded concurrency runs every item once and rejects a nonsense limit", async () => {
  const seen: number[] = []
  await forEachWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => { seen.push(item) })
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5])
  await forEachWithConcurrency([], 3, async () => { throw new Error("never") })
  await assert.rejects(() => forEachWithConcurrency([1], 0, async () => {}))
  assert.throws(() => createNotificationService({ dispatchConcurrency: 0 }))
})
