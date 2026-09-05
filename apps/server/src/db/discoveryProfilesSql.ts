/** Shared eligibility/ranking query. Snapshot storage returns only IDs to SQL. */
export function discoveryProfilesSql(): string {
  return `WITH viewer AS (
           SELECT COALESCE(identity_gender, gender) AS viewer_gender,
                  interests AS viewer_vibes
             FROM blumi_accounts
            WHERE user_id = $1
         ), eligible AS (
           SELECT user_id, display_name, age, updated_at,
                  COALESCE(identity_gender, gender) AS gender,
                  bio, profile_prompts, interests AS vibe_tags,
                  avatar_preset_id, avatar_selection, avatar_revision,
                  EXISTS (
                    SELECT 1
                      FROM blumi_discovery_decisions resurfaced
                     WHERE resurfaced.from_user_id = $1
                       AND resurfaced.to_user_id = blumi_accounts.user_id
                       AND resurfaced.decision = 'pass'
                       AND (
                         resurfaced.decided_at <= NOW() - INTERVAL '30 days'
                         OR (
                           blumi_accounts.updated_at > resurfaced.decided_at
                           AND resurfaced.decided_at <= NOW() - INTERVAL '7 days'
                         )
                       )
                  ) AS is_resurfaced,
                  CASE
                    WHEN updated_at >= NOW() - INTERVAL '1 day' THEN 30
                    WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 20
                    WHEN updated_at >= NOW() - INTERVAL '30 days' THEN 10
                    ELSE 0
                  END
                  + CASE WHEN EXISTS (
                      SELECT 1
                        FROM unnest(COALESCE(interests, ARRAY[]::text[])) own_vibe(value)
                       WHERE lower(trim(own_vibe.value)) = ANY(
                         ARRAY(SELECT lower(trim(v)) FROM unnest(COALESCE(viewer.viewer_vibes, ARRAY[]::text[])) v)
                       )
                    ) THEN 25 ELSE 0 END
                  + LEAST(15,
                      CASE WHEN char_length(trim(COALESCE(bio, ''))) >= 20 THEN 5 ELSE 0 END
                      + LEAST(cardinality(COALESCE(interests, ARRAY[]::text[])), 2) * 2
                      + CASE WHEN jsonb_array_length(COALESCE(profile_prompts, '[]'::jsonb)) > 0 THEN 6 ELSE 0 END
                    )
                  + CASE WHEN updated_at >= NOW() - INTERVAL '14 days' THEN 10 ELSE 0 END
                    AS base_rank_score
             FROM blumi_accounts
             CROSS JOIN viewer
            WHERE user_id <> $1
            AND display_name <> ''
            AND age IS NOT NULL
            AND char_length(trim(display_name)) >= 2
            AND COALESCE(identity_gender, gender) IN ('woman', 'man')
            AND onboarding_profile_complete = TRUE
            AND onboarding_avatar_complete = TRUE
            AND onboarding_room_complete = TRUE
            AND age BETWEEN $2 AND $3
            AND (
              cardinality($4::text[]) = 0
              OR lower(trim(COALESCE(identity_gender, gender))) = ANY($4::text[])
            )
            AND (
              cardinality($5::text[]) = 0
              OR EXISTS (
                SELECT 1
                  FROM unnest(COALESCE(interests, ARRAY[]::text[])) AS vibe(value)
                 WHERE lower(trim(vibe.value)) = ANY($5::text[])
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
            )
         ), ranked AS (
           SELECT *, base_rank_score AS rank_score
             FROM eligible
         ), capped AS (
           SELECT *,
                  CASE WHEN is_resurfaced THEN
                    ROW_NUMBER() OVER (
                      PARTITION BY is_resurfaced
                      ORDER BY rank_score DESC, user_id ASC
                    )
                  ELSE 1 END AS resurfaced_rank
             FROM ranked
         )
         SELECT user_id, display_name, age, updated_at, gender, bio, profile_prompts,
                vibe_tags, avatar_preset_id, avatar_selection, avatar_revision,
                rank_score
           FROM capped
          WHERE NOT is_resurfaced OR resurfaced_rank = 1
          ORDER BY rank_score DESC, user_id ASC`
}
