import { Pool } from "pg"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { DUMMY_PROFILES } from "../../mobile/src/features/demo/dummyProfiles"

async function main(): Promise<void> {
  if (process.argv[2] !== "--apply") {
    throw new Error("Use --apply to seed the configured database deliberately.")
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.")
  if (DUMMY_PROFILES.length !== 16) throw new Error("Expected exactly 16 test profiles.")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const marker = await client.query("SELECT to_regclass('public.blumi_test_personas') AS table_name")
    if (!marker.rows[0]?.table_name) throw new Error("Run migration 060 first.")

    for (const [index, profile] of DUMMY_PROFILES.entries()) {
      const suffix = String(index + 1).padStart(3, "0")
      const userId = `test-persona-${suffix}`
      const accountId = `test-persona-account-${suffix}`
      const phoneNumber = `+1202555${String(100 + index).padStart(4, "0")}`
      const existing = await client.query(
        `SELECT a.user_id, t.user_id AS marked_user_id
           FROM blumi_accounts a LEFT JOIN blumi_test_personas t ON t.user_id = a.user_id
          WHERE a.user_id = $1 OR a.account_id = $2 OR a.phone_number = $3`,
        [userId, accountId, phoneNumber]
      )
      if (existing.rows.some((row) => row.user_id !== userId || !row.marked_user_id)) {
        throw new Error(`Test persona identity ${suffix} conflicts with an existing account.`)
      }
      if (existing.rows.length === 0) {
        const avatar = profile.gender === "man"
          ? DEFAULT_MALE_AVATAR_LOADOUT
          : DEFAULT_FEMALE_AVATAR_LOADOUT
        await client.query(
          `INSERT INTO blumi_accounts (
            account_id, user_id, phone_number, display_name, age, bio,
            gender, identity_gender, interests, avatar_preset_id,
            avatar_selection, avatar_revision, created_at, updated_at,
            onboarding_profile_complete, onboarding_avatar_complete,
            onboarding_room_complete, onboarding_completed_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $7, $8, $9,
            $10::jsonb, 0, NOW(), NOW(), TRUE, TRUE, TRUE, NOW()
          )`,
          [accountId, userId, phoneNumber, profile.displayName, profile.age,
            profile.bio, profile.gender, profile.signals, avatar.bodyId,
            JSON.stringify(avatar)]
        )
        await client.query(
          `INSERT INTO blumi_test_personas (user_id, greeting, replies)
           VALUES ($1, $2, $3::text[])`,
          [userId, profile.greeting, profile.replies]
        )
      }
    }

    // Existing real accounts can test mutual matches immediately. This does not
    // manufacture decisions on behalf of real people.
    await client.query(
      `INSERT INTO blumi_discovery_decisions (from_user_id, to_user_id, decision, decided_at)
       SELECT persona.user_id, account.user_id, 'like', NOW()
         FROM blumi_test_personas persona
         JOIN blumi_accounts account ON account.user_id <> persona.user_id
        WHERE NOT EXISTS (SELECT 1 FROM blumi_test_personas other WHERE other.user_id = account.user_id)
       ON CONFLICT (from_user_id, to_user_id) DO NOTHING`
    )
    await client.query("COMMIT")
    const count = await client.query("SELECT count(*)::int AS count FROM blumi_test_personas")
    process.stdout.write(`Test profiles ready: ${count.rows[0]?.count ?? 0}\n`)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
