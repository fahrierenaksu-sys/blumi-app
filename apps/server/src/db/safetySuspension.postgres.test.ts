import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"

test("a second, shorter suspension never shortens a longer one; a longer one extends it", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const repository = createPostgresSafetyRepository(pool)
  const suffix = randomUUID().slice(0, 8)
  const target = `suspend_target_${suffix}`
  const actors = [1, 2, 3].map((index) => `suspend_actor_${index}_${suffix}`)
  const now = new Date("2026-10-01T10:00:00.000Z")
  const days = (count: number) => new Date(now.getTime() + count * 86_400_000).toISOString()
  const suspendedUntil = async () => (await pool.query(
    "SELECT moderation_status, suspended_until FROM blumi_accounts WHERE user_id = $1", [target]
  )).rows[0] as { moderation_status: string; suspended_until: Date }

  try {
    for (const userId of [target, ...actors]) {
      await pool.query(
        `INSERT INTO blumi_accounts(account_id, user_id, phone_number, created_at, updated_at)
         VALUES($1, $1, $1, NOW(), NOW())`,
        [userId]
      )
    }
    const resolveWith = async (actor: string, until: string) => {
      const reportId = `report_${actor}`
      const report = {
        reportId, actorUserId: actor, reportedUserId: target, reason: "harassment" as const,
        createdAt: now.toISOString(), status: "pending" as const
      }
      await repository.saveReportAndBlock(report, { actorUserId: actor, blockedUserId: target, createdAt: report.createdAt })
      assert.equal(await repository.resolveReport(reportId, {
        action: "suspend", suspendedUntil: until, resolvedAt: now.toISOString(),
        resolvedByAdminId: "admin", resolvedByTokenId: "token"
      }), "resolved")
    }

    await resolveWith(actors[0]!, days(20))
    assert.equal((await suspendedUntil()).suspended_until.toISOString(), days(20))

    await resolveWith(actors[1]!, days(3))
    const kept = await suspendedUntil()
    assert.equal(kept.moderation_status, "suspended")
    assert.equal(kept.suspended_until.toISOString(), days(20), "the longer suspension stands")

    await resolveWith(actors[2]!, days(30))
    assert.equal((await suspendedUntil()).suspended_until.toISOString(), days(30))
  } finally {
    await pool.end()
  }
})
