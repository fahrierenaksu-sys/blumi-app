import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"
import { createNotificationService } from "../notifications/notificationService"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../notifications/notificationRepository"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("PostgreSQL cancels old-account retry and guards already claimed ownership changes", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const repository = createPostgresNotificationRepository(pool)
  const now = new Date("2026-09-05T10:00:00Z")
  let calls = 0
  const service = createNotificationService({ repository, now: () => now,
    pushProvider: { async sendPush() { calls++; throw new Error("unavailable") } } })
  try {
    await service.updatePreferences("dst_user", { ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 }, quietHoursTimeZone: "Europe/Berlin", quietHoursUtcOffsetMinutes: 60 })
    assert.equal((await service.getPreferences("dst_user")).quietHoursTimeZone, "Europe/Berlin")
    const stalePreferences = await service.getPreferences("dst_user")
    await service.updatePreferences("dst_user", { ...stalePreferences, messagesEnabled: false }, ["messagesEnabled"])
    await service.updatePreferences("dst_user", { ...stalePreferences, quietHoursTimeZone: "Europe/Berlin" }, ["quietHoursTimeZone"])
    assert.equal((await service.getPreferences("dst_user")).messagesEnabled, false)
    await service.updatePreferences("dst_user", { ...stalePreferences, messagesEnabled: true }, ["messagesEnabled"])
    for (const [iso, expected] of [["2026-01-05T20:30:00Z", "queued"], ["2026-07-05T20:30:00Z", "quiet_hours"],
      ["2026-07-05T22:00:00Z", "quiet_hours"], ["2026-07-05T05:00:00Z", "queued"]] as const) {
      const result = await repository.claimPolicyDecision({ userId: "dst_user", notificationType: "message", dedupeKey: iso, now: new Date(iso) })
      assert.equal(result.reason, expected)
    }
    await service.registerDevice("ownership_a", { platform: "ios", pushToken: "ownership_token" }, now)
    await service.sendPushToUser("ownership_a", { title: "Blumi", body: "Private", data: { type: "chat.message", messageId: "ownership_m" } })
    const [queued] = await repository.listPendingDeliveries()
    assert.ok(queued.registrationId)
    await service.dispatchDue(now)
    assert.equal(calls, 1)
    assert.equal((await repository.listPendingDeliveries())[0]?.attemptCount, 1)
    await service.registerDevice("ownership_b", { platform: "ios", pushToken: "ownership_token" }, now)
    assert.equal((await repository.listPendingDeliveries()).length, 0)
    const receiptService = createNotificationService({ repository, now: () => now, pushProvider: {
      async sendPush() { return { ticketId: "postgres_receipt" } },
      async getReceipt() { return { status: "error" as const, errorCode: "DeviceNotRegistered" } }
    } })
    await receiptService.registerDevice("receipt_owner", { platform: "ios", pushToken: "receipt_token" })
    await receiptService.sendPushToUser("receipt_owner", { title: "Blumi", body: "Update" })
    await receiptService.dispatchDue(now)
    assert.equal((await repository.listPendingDeliveries()).length, 0)
    await receiptService.dispatchDue(new Date(now.getTime() + 15 * 60_000))
    assert.equal((await repository.listReceiptResults())[0]?.outcome, "rejected")
    const terminalReceipt = await pool.query("SELECT user_id, push_token, registration_id FROM blumi_push_receipts WHERE ticket_id = 'postgres_receipt'")
    assert.deepEqual(terminalReceipt.rows[0], { user_id: "", push_token: "", registration_id: "" })
    assert.equal((await repository.listDevices("receipt_owner")).length, 0)
    await service.dispatchDue(new Date(now.getTime() + 2000))
    assert.equal(calls, 1)

    await service.sendPushToUser("ownership_b", { title: "Blumi", body: "Private" })
    const claim = repository.claimDueDeliveries.bind(repository)
    const racingService = createNotificationService({
      repository: { ...repository, async claimDueDeliveries(input) {
        const claimed = await claim(input)
        await service.registerDevice("ownership_c", { platform: "ios", pushToken: "ownership_token" }, now)
        return claimed
      } },
      pushProvider: { async sendPush() { calls++ } }
    })
    await racingService.dispatchDue(now)
    assert.equal(calls, 1)
    assert.equal((await repository.listPendingDeliveries()).length, 0)
    assert.equal((await repository.listDevices("ownership_c")).length, 1)
    for (const operation of ["reregister", "remove", "removeAll"] as const) {
      await service.registerDevice("ownership_c", { platform: "ios", pushToken: "ownership_token" }, now)
      await service.sendPushToUser("ownership_c", { title: "Blumi", body: "Update" })
      assert.equal((await repository.listPendingDeliveries()).length, 1)
      if (operation === "reregister") {
        const before = (await repository.listDevices("ownership_c"))[0]
        const refreshed = await service.registerDevice("ownership_c", { platform: "ios", pushToken: "ownership_token" }, now)
        assert.equal(refreshed.registrationId, before.registrationId)
        assert.equal((await repository.listPendingDeliveries()).length, 1)
        await service.removeDevice("ownership_c", "ownership_token")
        const recreated = await service.registerDevice("ownership_c", { platform: "ios", pushToken: "ownership_token" }, now)
        assert.notEqual(recreated.registrationId, before.registrationId)
      }
      if (operation === "remove") await service.removeDevice("ownership_c", "ownership_token")
      if (operation === "removeAll") await repository.removeAllDevices("ownership_c")
      assert.equal((await repository.listPendingDeliveries()).length, 0)
    }
    await repository.enqueueDelivery({ deliveryId: "legacy_delivery", userId: "ownership_c", pushToken: "ownership_token",
      notification: { title: "Old", body: "private" }, attemptCount: 0,
      availableAt: now.toISOString(), createdAt: now.toISOString() })
    await service.dispatchDue(now)
    assert.equal(calls, 1)
    assert.equal((await repository.listDeliveryAudits()).at(-1)?.errorCode, "registration_changed")
    await pool.query("INSERT INTO blumi_push_devices(user_id, platform, push_token) VALUES ('legacy_a', 'ios', 'legacy_token')")
    const [legacyBefore] = await repository.listDevices("legacy_a")
    assert.ok(legacyBefore.registrationId)
    await service.sendPushToUser("legacy_a", { title: "Blumi", body: "Update" })
    for (const user of ["legacy_b", "legacy_a"]) {
      await pool.query(`INSERT INTO blumi_push_devices(user_id, platform, push_token)
        VALUES ($1, 'ios', 'legacy_token') ON CONFLICT(push_token) DO UPDATE SET user_id = EXCLUDED.user_id`, [user])
    }
    assert.notEqual((await repository.listDevices("legacy_a"))[0]?.registrationId, legacyBefore.registrationId)
    assert.equal((await repository.listPendingDeliveries()).length, 0)
  } finally {
    await pool.end()
  }
})
