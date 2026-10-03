import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import {
  createInMemoryNotificationRepository,
  type DeviceRegistration,
  type NotificationRepository
} from "./notificationRepository"

const dispatchAt = new Date("2026-10-03T10:00:00.000Z")

async function createQueue(repository: NotificationRepository) {
  const device: DeviceRegistration = {
    userId: "fixture_recipient",
    pushToken: "fixture_token",
    registrationId: "fixture_registration",
    platform: "ios",
    registeredAt: dispatchAt.toISOString()
  }
  await repository.saveDevice(device)
  let sequence = 0
  return async (count: number, createdAt = dispatchAt) => {
    for (let index = 0; index < count; index++) {
      await repository.enqueueDelivery({
        ...device,
        deliveryId: `fixture_delivery_${++sequence}`,
        notification: { title: "Blumi", body: "You have an update." },
        attemptCount: 0,
        availableAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString()
      })
    }
  }
}

test("a continuously replenished backlog yields to receipts and retains work for the next cycle", async () => {
  const repository = createInMemoryNotificationRepository()
  const enqueue = await createQueue(repository)
  const receiptCreatedAt = new Date(dispatchAt.getTime() - 16 * 60_000)
  await enqueue(1, receiptCreatedAt)
  const [previousDelivery] = await repository.claimDueDeliveries({ now: receiptCreatedAt, limit: 1, leaseMs: 30_000 })
  await repository.markDeliverySent({
    deliveryId: previousDelivery!.deliveryId,
    leaseToken: previousDelivery!.leaseToken!,
    attempt: 1,
    now: receiptCreatedAt,
    ticketId: "fixture_ticket"
  })
  await enqueue(30)
  let refill = true
  let replenished = 0
  const service = createNotificationService({
    repository,
    dispatchMaxBatches: 2,
    monotonicNow: () => 0,
    pushProvider: {
      async sendPush() {
        // Finite fallback also makes the old unbounded implementation finish
        // with a failing assertion rather than leaving a runaway test process.
        if (refill && replenished++ < 240) await enqueue(1)
      },
      async getReceipts(ticketIds) {
        return new Map(ticketIds.map((ticketId) => [ticketId, { status: "ok" as const }]))
      }
    }
  })

  await service.dispatchDue(dispatchAt)

  assert.deepEqual(await repository.listReceiptResults(), [
    { ticketId: "fixture_ticket", outcome: "provider_handoff" }
  ], "receipt work is not starved by newly arriving deliveries")
  const remaining = await repository.listPendingDeliveries()
  assert.equal(remaining.length, 30)
  assert.equal(replenished, 60, "the configured cycle ceiling bounds a continuously full queue")
  assert.ok(remaining.every((delivery) => !delivery.leaseToken && delivery.attemptCount === 0),
    "the next cycle's work remains available and has not consumed an attempt")

  refill = false
  await service.dispatchDue(dispatchAt)
  assert.equal((await repository.listPendingDeliveries()).length, 0)
  assert.ok((await repository.listDeliveryAudits()).every((audit) => audit.outcome === "sent"))
})

test("an elapsed cycle budget finishes the admitted batch and resumes remaining durable deliveries", async () => {
  const repository = createInMemoryNotificationRepository()
  const enqueue = await createQueue(repository)
  await enqueue(75)
  let elapsedMs = 0
  let slow = true
  let sent = 0
  const service = createNotificationService({
    repository,
    dispatchBudgetMs: 5,
    monotonicNow: () => elapsedMs,
    pushProvider: {
      async sendPush() {
        sent++
        if (slow) elapsedMs += 5
      }
    }
  })

  await service.dispatchDue(dispatchAt)

  assert.equal(sent, 30, "time expiry does not abandon the already leased batch")
  const remaining = await repository.listPendingDeliveries()
  assert.equal(remaining.length, 45)
  assert.ok(remaining.every((delivery) => !delivery.leaseToken && delivery.attemptCount === 0))

  slow = false
  await service.dispatchDue(dispatchAt)
  assert.equal(sent, 75)
  assert.equal((await repository.listPendingDeliveries()).length, 0)
})

test("dispatch admission limits cannot disable the bounded-cycle policy", () => {
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => createNotificationService({ dispatchMaxBatches: value }), /positive integers/)
    assert.throws(() => createNotificationService({ dispatchBudgetMs: value }), /positive integers/)
  }
})
