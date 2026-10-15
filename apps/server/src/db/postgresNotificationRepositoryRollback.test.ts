import assert from "node:assert/strict"
import test from "node:test"
import type { PushDelivery } from "../notifications/notificationRepository"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"

const DELIVERY: PushDelivery = {
  deliveryId: "delivery_1",
  userId: "user_1",
  pushToken: "token_1",
  registrationId: "registration_1",
  leaseToken: "lease_1",
  notification: { title: "t", body: "b" },
  attemptCount: 0,
  availableAt: "2026-10-14T10:00:00.000Z",
  createdAt: "2026-10-14T10:00:00.000Z"
}

function createFakePool(options: { rollbackError?: Error }) {
  const released: unknown[] = []
  const client = {
    async query(text: string) {
      if (text === "ROLLBACK" && options.rollbackError) throw options.rollbackError
      // Device and outbox rows exist, so the provider call is admitted.
      return { rows: [{ ok: 1 }] }
    },
    release(error?: Error) {
      released.push(error)
    }
  }
  const pool = { query: client.query, connect: async () => client }
  return { pool, released }
}

test("a failed ROLLBACK destroys the dispatch connection and the send error still surfaces", async () => {
  const rollbackError = new Error("connection lost during ROLLBACK")
  const sendError = new Error("provider timed out")
  const { pool, released } = createFakePool({ rollbackError })

  await assert.rejects(
    createPostgresNotificationRepository(pool).withAuthorizedDelivery(DELIVERY, new Date(), async () => {
      throw sendError
    }),
    (error: unknown) => error === sendError
  )

  assert.equal(released.length, 1)
  assert.equal(released[0], rollbackError)
})

test("a clean ROLLBACK releases the dispatch connection for reuse", async () => {
  const sendError = new Error("provider timed out")
  const { pool, released } = createFakePool({})

  await assert.rejects(
    createPostgresNotificationRepository(pool).withAuthorizedDelivery(DELIVERY, new Date(), async () => {
      throw sendError
    }),
    (error: unknown) => error === sendError
  )

  assert.deepEqual(released, [undefined])
})
