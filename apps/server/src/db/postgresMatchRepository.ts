import {
  normalizeUserProfilePrompts,
  type DiscoveryDecisionQuota,
  type DiscoveryFilters,
  type DiscoveryGender,
  type DiscoveryWatchRecord
} from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import { discoveryProfilesSql } from "./discoveryProfilesSql"
import { discoveryWatchLockCte } from "./discoveryWatchLock"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import type {
  DiscoverProfileRecord,
  DiscoveryDecisionRecord,
  MatchRecord,
  MatchRepository,
  PersistedDiscoveryDecision
} from "../matches/matchRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresMatchRepository(
  pool: QueryExecutor
): MatchRepository {
  return {
    async listDiscoverProfiles(currentUserId, filters, page) {
      const normalizedFilters = normalizeFilters(filters)
      const normalizedPage = normalizePage(page)
      const accountResult = await pool.query(
        `${discoveryProfilesSql()} LIMIT $6 OFFSET $7`,
        [
          currentUserId,
          normalizedFilters.ageMin,
          normalizedFilters.ageMax,
          normalizedFilters.genders,
          normalizedFilters.vibes,
          normalizedPage.limit,
          normalizedPage.offset
        ]
      )
      return accountResult.rows.flatMap(mapAccountProfileSafely)
    },

    async findDiscoverProfile(userId) {
      const accountResult = await pool.query(
        `SELECT user_id, display_name, age, updated_at,
                COALESCE(identity_gender, gender) AS gender,
                bio, profile_prompts,
                interests AS vibe_tags,
                avatar_preset_id, avatar_selection, avatar_revision
           FROM blumi_accounts
          WHERE user_id = $1
            AND display_name <> ''
            AND age IS NOT NULL
            AND age BETWEEN 18 AND 99
            AND char_length(trim(display_name)) >= 2
            AND COALESCE(identity_gender, gender) IN ('woman', 'man')
            AND onboarding_profile_complete = TRUE
            AND onboarding_avatar_complete = TRUE
            AND onboarding_room_complete = TRUE`,
        [userId]
      )
      return accountResult.rows[0]
        ? mapAccountProfileSafely(accountResult.rows[0])[0] ?? null
        : null
    },

    async findEligibleDiscoverProfile(currentUserId, targetUserId, filters) {
      const normalizedFilters = normalizeFilters(filters)
      const accountResult = await pool.query(
        `WITH viewer AS (
           SELECT COALESCE(identity_gender, gender) AS viewer_gender
             FROM blumi_accounts
            WHERE user_id = $1
         )
         SELECT blumi_accounts.user_id, display_name, age, updated_at,
                COALESCE(identity_gender, gender) AS gender,
                bio, profile_prompts, interests AS vibe_tags,
                avatar_preset_id, avatar_selection, avatar_revision
           FROM blumi_accounts
           CROSS JOIN viewer
          WHERE blumi_accounts.user_id = $2
            AND display_name <> ''
            AND age BETWEEN 18 AND 99
            AND char_length(trim(display_name)) >= 2
            AND COALESCE(identity_gender, gender) IN ('woman', 'man')
            AND onboarding_profile_complete = TRUE
            AND onboarding_avatar_complete = TRUE
            AND onboarding_room_complete = TRUE
            AND age BETWEEN $3 AND $4
            AND (
              cardinality($5::text[]) = 0
              OR lower(trim(COALESCE(identity_gender, gender))) = ANY($5::text[])
            )
            AND (
              cardinality($6::text[]) = 0
              OR EXISTS (
                SELECT 1
                  FROM unnest(COALESCE(interests, ARRAY[]::text[])) AS vibe(value)
                 WHERE lower(trim(vibe.value)) = ANY($6::text[])
              )
            )
            AND NOT EXISTS (
              SELECT 1
                FROM blumi_discovery_decisions d
               WHERE d.from_user_id = $1
                 AND d.to_user_id = blumi_accounts.user_id
                 AND (
                   d.decision = 'like'
                   OR (
                     d.decision = 'pass'
                     AND NOT (
                       d.decided_at <= NOW() - INTERVAL '30 days'
                       OR (
                         blumi_accounts.updated_at > d.decided_at
                         AND d.decided_at <= NOW() - INTERVAL '7 days'
                       )
                     )
                   )
                 )
            )
            AND NOT EXISTS (
              SELECT 1
                FROM blumi_matches m
               WHERE (
                 m.participant_a_user_id = $1
                 AND m.participant_b_user_id = blumi_accounts.user_id
               ) OR (
                 m.participant_b_user_id = $1
                 AND m.participant_a_user_id = blumi_accounts.user_id
               )
            )
            AND (
              cardinality(COALESCE(discovery_genders, ARRAY[]::text[])) = 0
              OR viewer.viewer_gender = ANY(discovery_genders)
            )`,
        [
          currentUserId,
          targetUserId,
          normalizedFilters.ageMin,
          normalizedFilters.ageMax,
          normalizedFilters.genders,
          normalizedFilters.vibes
        ]
      )
      return accountResult.rows[0]
        ? mapAccountProfileSafely(accountResult.rows[0])[0] ?? null
        : null
    },

    async saveDecision(decision) {
      await pool.query(
        `INSERT INTO blumi_discovery_decisions (
            from_user_id, to_user_id, decision, decided_at
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
            decision = EXCLUDED.decision,
            decided_at = EXCLUDED.decided_at`,
        [
          decision.fromUserId,
          decision.toUserId,
          decision.decision,
          new Date(decision.decidedAt)
        ]
      )
    },

    async consumeDecisionQuota(decision, now, reconsiderationOf) {
      const result = await pool.query(
        `SELECT outcome, decision, decided_at, created,
                decision_limit AS limit, extension_decisions, used, remaining, resets_at
           FROM blumi_consume_discovery_decision($1, $2, $3, $4, $5)`,
        [
          decision.fromUserId,
          decision.toUserId,
          decision.decision,
          now,
          reconsiderationOf ? new Date(reconsiderationOf) : null
        ]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Discovery quota persistence did not return a result.")
      const quota = mapDecisionQuota(row)
      if (row.outcome === "quota_exhausted") {
        return { decision: null, created: false, quota }
      }
      return {
        decision: {
          fromUserId: decision.fromUserId,
          toUserId: decision.toUserId,
          decision: row.decision === "pass" ? "pass" : "like",
          decidedAt: new Date(row.decided_at as string | number | Date).toISOString()
        },
        created: row.created === true,
        quota
      } satisfies PersistedDiscoveryDecision
    },

    async getDecisionQuota(userId, now) {
      const result = await pool.query(
        `SELECT decision_limit AS limit, extension_decisions, used, remaining, resets_at
           FROM blumi_discovery_decision_quota($1, $2)`,
        [userId, now]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Discovery quota lookup did not return a result.")
      return mapDecisionQuota(row)
    },

    async findDecision(fromUserId, toUserId) {
      const result = await pool.query(
        `SELECT from_user_id, to_user_id, decision, decided_at
           FROM blumi_discovery_decisions
          WHERE from_user_id = $1 AND to_user_id = $2`,
        [fromUserId, toUserId]
      )
      return result.rows[0] ? mapDecision(result.rows[0]) : null
    },

    async findMatchBetween(userAId, userBId) {
      const result = await pool.query(
        `SELECT match_id, participant_a_user_id, participant_b_user_id, matched_at
           FROM blumi_matches
          WHERE participant_key = $1`,
        [matchKey(userAId, userBId)]
      )
      return result.rows[0] ? mapMatch(result.rows[0]) : null
    },

    async createMatch(match) {
      const result = await pool.query(
        `INSERT INTO blumi_matches (
            match_id, participant_a_user_id, participant_b_user_id, matched_at
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (participant_key) DO UPDATE SET
            matched_at = blumi_matches.matched_at
          RETURNING match_id, participant_a_user_id,
                    participant_b_user_id, matched_at`,
        [
          match.matchId,
          match.participantUserIds[0],
          match.participantUserIds[1],
          new Date(match.matchedAt)
        ]
      )
      const canonicalRow = result.rows[0]
      if (!canonicalRow) {
        throw new Error("Match persistence did not return a canonical row.")
      }
      return mapMatch(canonicalRow)
    },

    async findDiscoveryWatch(userId) {
      const result = await pool.query(
        `SELECT user_id, status, age_min, age_max, genders, vibes,
                radius_km, updated_at, expires_at
           FROM blumi_discovery_watches
          WHERE user_id = $1 AND completed_at IS NULL AND cancelled_at IS NULL`,
        [userId]
      )
      return result.rows[0] ? mapDiscoveryWatch(result.rows[0]) : null
    },

    async claimNextDiscoveryWatch(now) {
      const result = await pool.query(
        `UPDATE blumi_discovery_watches SET claim_token = gen_random_uuid()::text,
                lease_until = $1 + INTERVAL '60 seconds'
          WHERE user_id = (
            SELECT user_id
              FROM blumi_discovery_watches
             WHERE expires_at > $1 AND completed_at IS NULL AND cancelled_at IS NULL
               AND (lease_until IS NULL OR lease_until <= $1)
             ORDER BY updated_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
          )
          RETURNING user_id, status, age_min, age_max, genders, vibes,
                    radius_km, updated_at, expires_at, claim_token, generation`,
        [now]
      )
      return result.rows[0] ? { ...mapDiscoveryWatch(result.rows[0]), claimToken: String(result.rows[0].claim_token), generation: String(result.rows[0].generation) } : null
    },

    async restoreDiscoveryWatch(watch) {
      await pool.query(`UPDATE blumi_discovery_watches SET claim_token = NULL, lease_until = NULL, updated_at = $3
        WHERE user_id = $1 AND claim_token = $2`, [watch.userId, watch.claimToken, new Date(watch.updatedAt)])
      return watch
    },
    async completeDiscoveryWatch(watch) {
      const result = await pool.query(`UPDATE blumi_discovery_watches SET completed_at = NOW(), claim_token = NULL, lease_until = NULL
        WHERE user_id = $1 AND claim_token = $2 AND generation = $3 AND cancelled_at IS NULL RETURNING user_id`, [watch.userId, watch.claimToken, watch.generation])
      return result.rows.length > 0
    },
    async isDiscoveryWatchClaimCurrent(watch, now) {
      const result = await pool.query(`SELECT user_id FROM blumi_discovery_watches WHERE user_id = $1 AND claim_token = $2 AND lease_until > $3 AND expires_at > $3
        AND generation = $4 AND completed_at IS NULL AND cancelled_at IS NULL`, [watch.userId, watch.claimToken, now, watch.generation])
      return result.rows.length > 0
    },
    async upsertDiscoveryWatch(watch) {
      const result = await pool.query(
        `${discoveryWatchLockCte} INSERT INTO blumi_discovery_watches (
           user_id, status, age_min, age_max, genders, vibes,
           radius_km, updated_at, expires_at
         ) SELECT $1, 'active', $2, $3, $4, $5, $6, $7, $8 FROM watch_authority
         ON CONFLICT (user_id) DO UPDATE SET
           generation = gen_random_uuid()::text,
           completed_at = NULL,
           cancelled_at = NULL,
           claim_token = NULL,
           lease_until = NULL,
           status = 'active',
           age_min = EXCLUDED.age_min,
           age_max = EXCLUDED.age_max,
           genders = EXCLUDED.genders,
           vibes = EXCLUDED.vibes,
           radius_km = EXCLUDED.radius_km,
           updated_at = EXCLUDED.updated_at,
           expires_at = EXCLUDED.expires_at
         RETURNING user_id, status, age_min, age_max, genders, vibes,
                   radius_km, updated_at, expires_at`,
        [
          watch.userId,
          watch.preferences.ageMin,
          watch.preferences.ageMax,
          watch.preferences.genders,
          watch.preferences.vibes,
          LEGACY_DISCOVERY_WATCH_RADIUS_KM,
          new Date(watch.updatedAt),
          new Date(watch.expiresAt)
        ]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Discovery watch persistence did not return a row.")
      return mapDiscoveryWatch(row)
    },

    async deleteDiscoveryWatch(userId) {
      await pool.query(
        `${discoveryWatchLockCte} UPDATE blumi_discovery_watches SET generation = gen_random_uuid()::text,
          cancelled_at = NOW(), claim_token = NULL, lease_until = NULL FROM watch_authority WHERE user_id = $1`,
        [userId]
      )
    }
  }
}

function mapDiscoveryWatch(row: QueryResultRow): DiscoveryWatchRecord {
  const genders = normalizeTextArray(row.genders)
    .filter((value): value is DiscoveryGender => value === "woman" || value === "man")
  return {
    userId: String(row.user_id),
    status: "active",
    preferences: {
      ageMin: Number(row.age_min),
      ageMax: Number(row.age_max),
      genders,
      vibes: normalizeTextArray(row.vibes)
    },
    updatedAt: new Date(row.updated_at as string | number | Date).toISOString(),
    expiresAt: new Date(row.expires_at as string | number | Date).toISOString()
  }
}

// The deployed watch table keeps this non-null legacy column. It is no longer
// read or exposed, so it cannot alter global Discovery eligibility.
const LEGACY_DISCOVERY_WATCH_RADIUS_KM = 25

function normalizePage(page: {
  offset: number
  limit: number
} | undefined): { offset: number; limit: number } {
  return {
    offset: Math.max(0, Math.floor(page?.offset ?? 0)),
    limit: Math.max(1, Math.min(101, Math.floor(page?.limit ?? 101)))
  }
}

export function mapAccountProfileSafely(row: QueryResultRow): DiscoverProfileRecord[] {
  try {
    return [mapAccountProfile(row)]
  } catch {
    return []
  }
}

function mapAccountProfile(row: QueryResultRow): DiscoverProfileRecord {
  const vibeTags = normalizeTextArray(row.vibe_tags)
  const avatar = normalizeStoredAvatarSelection({
    presetId: row.avatar_preset_id,
    loadout: row.avatar_selection,
    revision: row.avatar_revision
  })
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    age: Number(row.age),
    bio: row.bio ? String(row.bio) : undefined,
    prompts: normalizeUserProfilePrompts(row.profile_prompts),
    gender: row.gender ? String(row.gender) : undefined,
    distanceLabel: "Vibe match",
    vibeTags,
    avatar,
    avatarPresetId: avatar.presetId,
    updatedAt: row.updated_at
      ? new Date(row.updated_at as string | number | Date).toISOString()
      : undefined
  }
}

export function normalizeFilters(filters: DiscoveryFilters): DiscoveryFilters {
  return {
    ageMin: filters.ageMin,
    ageMax: filters.ageMax,
    genders: [...filters.genders],
    vibes: filters.vibes.map((vibe) => vibe.trim().toLowerCase())
  }
}

function mapDecision(row: QueryResultRow): DiscoveryDecisionRecord {
  return {
    fromUserId: String(row.from_user_id),
    toUserId: String(row.to_user_id),
    decision: row.decision === "pass" ? "pass" : "like",
    decidedAt: new Date(row.decided_at).toISOString()
  }
}

function mapDecisionQuota(row: QueryResultRow): DiscoveryDecisionQuota {
  const limit = Number(row.limit)
  const extensionDecisions = Number(row.extension_decisions)
  const used = Number(row.used)
  const remaining = Number(row.remaining)
  if (
    !Number.isInteger(limit) || limit < 10 ||
    !Number.isInteger(extensionDecisions) || extensionDecisions < 0 ||
    !Number.isInteger(used) || used < 0 ||
    !Number.isInteger(remaining) || remaining < 0
  ) {
    throw new Error("Discovery quota persistence returned invalid metadata.")
  }
  return {
    limit,
    extensionDecisions,
    used,
    remaining,
    resetsAt: new Date(row.resets_at as string | number | Date).toISOString(),
    // No verification adapter is configured. The client must not offer an unlock.
    rewardedAd: { available: false, extensionDecisions: 10 }
  }
}

function mapMatch(row: QueryResultRow): MatchRecord {
  return {
    matchId: String(row.match_id),
    participantUserIds: [
      String(row.participant_a_user_id),
      String(row.participant_b_user_id)
    ],
    matchedAt: new Date(row.matched_at).toISOString()
  }
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  return []
}

function matchKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(":")
}
