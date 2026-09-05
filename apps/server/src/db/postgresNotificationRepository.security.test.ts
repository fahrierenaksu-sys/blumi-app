import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"

test("postgres push registration transfers a token to its current account", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresNotificationRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [] }
    }
  })

  await repository.saveDevice({
    userId: "current_user",
    platform: "ios",
    pushToken: "shared_token",
    registeredAt: "2026-07-14T10:00:00.000Z"
  })

  assert.match(calls[0]?.text ?? "", /ON CONFLICT \(push_token\)/)
  assert.match(calls[0]?.text ?? "", /user_id = EXCLUDED\.user_id/)
  assert.match(calls[0]?.text ?? "", /WHEN blumi_push_devices.user_id = EXCLUDED.user_id THEN blumi_push_devices.registration_id/)
  assert.match(String(calls[0]?.values?.[4]), /^[a-f0-9-]{36}$/)
  assert.deepEqual(calls[0]?.values?.slice(0, 3), [
    "current_user",
    "ios",
    "shared_token"
  ])
})

test("postgres push outbox claims deliveries with a lease and row-level skip locking", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresNotificationRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [] }
    }
  })

  await repository.claimDueDeliveries({
    now: new Date("2026-07-22T10:00:00.000Z"),
    limit: 25,
    leaseMs: 30_000
  })

  assert.match(calls[0]?.text ?? "", /FOR UPDATE SKIP LOCKED/)
  assert.match(calls[0]?.text ?? "", /lease_token/)
  assert.match(calls[0]?.text ?? "", /outbox\.registration_id/)
  assert.deepEqual(calls[0]?.values?.slice(1, 2), [25])
})

test("postgres roundtrips a delivery registration identity", async () => {
  const repository = createPostgresNotificationRepository({ async query() {
    return { rows: [{ delivery_id: "delivery", user_id: "a", push_token: "token", registration_id: "generation",
      title: "Blumi", body: "Update", attempt_count: 0, available_at: new Date(0), created_at: new Date(0) }] }
  } })
  assert.equal((await repository.listPendingDeliveries())[0]?.registrationId, "generation")
})

test("postgres notification policy serializes an account decision and audits suppression", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresNotificationRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{ reason: "quiet_hours" }] }
    }
  })

  const decision = await repository.claimPolicyDecision({
    userId: "user_one",
    notificationType: "message",
    dedupeKey: "message:message_one",
    now: new Date("2026-07-22T22:00:00.000Z")
  })

  assert.deepEqual(decision, { allowed: false, reason: "quiet_hours" })
  assert.match(calls[0]?.text ?? "", /pg_advisory_xact_lock/)
  assert.match(calls[0]?.text ?? "", /blumi_notification_policy_audit/)
  assert.match(calls[0]?.text ?? "", /ON CONFLICT \(user_id, notification_type, dedupe_key\) DO NOTHING/)
  assert.deepEqual(calls[0]?.values?.slice(0, 3), ["user_one", "message", "message:message_one"])
})

test("postgres policy claim and its outbox rows are one atomic statement", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresNotificationRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{ reason: "queued", delivery_count: 1 }] }
    }
  })

  const result = await repository.claimPolicyAndEnqueueDeliveries({
    userId: "user_one",
    notificationType: "message",
    dedupeKey: "message:message_one",
    now: new Date("2026-07-22T10:00:00.000Z"),
    deliveries: [{
      deliveryId: "delivery_one",
      userId: "user_one",
      pushToken: "token_one",
      notification: { title: "New message", body: "A message is waiting." },
      attemptCount: 0,
      availableAt: "2026-07-22T10:00:00.000Z",
      createdAt: "2026-07-22T10:00:00.000Z"
    }]
  })

  assert.deepEqual(result, { allowed: true, reason: "queued", deliveryCount: 1 })
  assert.equal(calls.length, 1)
  assert.match(calls[0]?.text ?? "", /WITH account_lock AS MATERIALIZED/)
  assert.match(calls[0]?.text ?? "", /INSERT INTO blumi_notification_policy_events/)
  assert.match(calls[0]?.text ?? "", /INSERT INTO blumi_push_delivery_outbox/)
  assert.match(calls[0]?.text ?? "", /CROSS JOIN resolved[\s\S]*WHERE resolved\.reason = 'queued'/)
  assert.match(calls[0]?.text ?? "", /jsonb_to_recordset\(\$5::jsonb\)/)
})
