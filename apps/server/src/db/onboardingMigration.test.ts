import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import test from "node:test"

test("account onboarding migration is additive and backfills existing users", async () => {
  const migrationDirectory = resolve(__dirname, "../../db/migrations")
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
  const migrations = await Promise.all(
    migrationFiles.map(async (fileName) => ({
      fileName,
      sql: await readFile(join(migrationDirectory, fileName), "utf8")
    }))
  )
  const onboardingMigration = migrations.find(({ sql }) =>
    /onboarding_profile_complete/i.test(sql)
  )

  assert.ok(
    onboardingMigration,
    "add a forward-only migration for durable account onboarding"
  )
  assert.match(onboardingMigration.sql, /onboarding_profile_complete\s+BOOLEAN/i)
  assert.match(onboardingMigration.sql, /onboarding_avatar_complete\s+BOOLEAN/i)
  assert.match(onboardingMigration.sql, /onboarding_room_complete\s+BOOLEAN/i)
  assert.match(onboardingMigration.sql, /onboarding_completed_at\s+TIMESTAMPTZ/i)
  assert.match(
    onboardingMigration.sql,
    /UPDATE\s+blumi_accounts[\s\S]*onboarding_profile_complete\s*=\s*FALSE[\s\S]*onboarding_avatar_complete\s*=\s*TRUE[\s\S]*onboarding_room_complete\s*=\s*TRUE[\s\S]*onboarding_completed_at\s*=\s*NULL/i,
    "legacy accounts should confirm their public name without replaying avatar and room setup"
  )
})
