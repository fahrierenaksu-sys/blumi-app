import assert from "node:assert/strict"
import test from "node:test"
import type { Pool } from "pg"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import type { AccountRecord } from "../auth/authStore"
import type { PendingOtp, SessionRecord } from "../auth/authStore"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"

const DEFAULT_LOADOUT = {
  schemaVersion: 1 as const,
  bodyId: "avatar_v2_body_default",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe",
  noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile",
  hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
  accessoryIds: [] as string[]
}

const ACCOUNT: AccountRecord = {
  accountId: "account_123",
  userId: "user_123",
  phoneNumber: "+905551112233",
  onboarding: {
    profile: "incomplete",
    avatar: "incomplete",
    room: "incomplete"
  },
  createdAt: "2026-07-11T10:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z",
  profile: {
    userId: "user_123",
    displayName: "Mina",
    age: 24,
    avatar: {
      presetId: DEFAULT_LOADOUT.bodyId,
      loadout: DEFAULT_LOADOUT,
      revision: 0
    }
  }
}

const PENDING_OTP: PendingOtp = {
  phoneNumber: "+905551112233",
  otpId: "otp-request-123",
  codeDigest: "a".repeat(64),
  expiresAt: Date.parse("2026-07-11T10:05:00.000Z"),
  attemptCount: 0
}

test("every account lookup selects moderation and stored acceptance", async () => {
  const terms = { version: "2026-09", locale: "tr", acceptedAt: ACCOUNT.createdAt }
  const pool = { async query(sql: string) {
    assert.match(sql, /moderation_status/)
    assert.match(sql, /accepted_terms/)
    return { rows: [{ ...accountRow(), moderation_status: "banned", accepted_terms: terms }] }
  }} as unknown as Pool
  const repository = createPostgresAuthRepository(pool)
  for (const result of [await repository.getAccountByPhone(ACCOUNT.phoneNumber),
    await repository.findAccountById(ACCOUNT.accountId), await repository.findAccountByUserId(ACCOUNT.userId)]) {
    assert.equal(result?.moderation?.status, "banned")
    assert.deepEqual(result?.acceptedTerms, terms)
  }
})

test("account insertion persists acceptance without inventing a historical record", async () => {
  const terms = { version: "2026-09", locale: "tr" as const, acceptedAt: ACCOUNT.createdAt }
  const valuesSeen: unknown[][] = []
  const pool = { async query(sql: string, values: unknown[]) {
    assert.match(sql, /accepted_terms/)
    valuesSeen.push(values)
    return { rows: [] }
  }} as unknown as Pool
  const repository = createPostgresAuthRepository(pool)
  await repository.saveAccount({ ...ACCOUNT, acceptedTerms: terms })
  await repository.saveAccount(ACCOUNT)
  assert.equal(valuesSeen[0]?.at(-1), JSON.stringify(terms))
  assert.equal(valuesSeen[1]?.at(-1), null)
})

const NEXT_SESSION: SessionRecord = {
  accountId: ACCOUNT.accountId,
  sessionId: "session_next",
  userId: ACCOUNT.userId,
  sessionTokenHash: "b".repeat(64),
  expiresAt: "2026-08-11T10:00:00.000Z"
}

test("postgres account deletion confirmation consumes the reauthentication token once", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  let remaining = 1
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text: normalizeSql(text), values })
      const rowCount = remaining
      remaining = 0
      return { rows: rowCount ? [{ account_id: ACCOUNT.accountId }] : [], rowCount }
    }
  } as unknown as Pool
  const repository = createPostgresAuthRepository(pool)
  const input = {
    accountId: ACCOUNT.accountId,
    confirmationTokenDigest: "c".repeat(64),
    now: Date.parse("2026-07-21T10:00:00.000Z")
  }

  assert.equal(await repository.consumeAccountDeletionConfirmation(input), true)
  assert.equal(await repository.consumeAccountDeletionConfirmation(input), false)
  assert.match(queries[0]?.text ?? "", /DELETE FROM blumi_account_deletion_confirmations/)
  assert.match(queries[0]?.text ?? "", /token_digest = \$2/)
  assert.match(queries[0]?.text ?? "", /expires_at > \$3/)
})

test("postgres account deletion challenge applies its own cooldown and request cap", async () => {
  const now = Date.parse("2026-07-21T10:00:00.000Z")
  const queries: string[] = []
  const createPool = (existing: { window_started_at: Date; last_requested_at: Date; request_count: number }) => ({
    async connect() {
      return {
        async query(text: string) {
          queries.push(normalizeSql(text))
          if (text.includes("FROM blumi_account_deletion_otp_send_limits WHERE")) {
            return { rows: [existing], rowCount: 1 }
          }
          return { rows: [], rowCount: 0 }
        },
        release() {}
      }
    }
  }) as unknown as Pool
  const cooldown = await createPostgresAuthRepository(createPool({
    window_started_at: new Date(now - 1_000),
    last_requested_at: new Date(now - 1_000),
    request_count: 1
  })).claimAccountDeletionOtpSend({
    accountId: ACCOUNT.accountId, phoneNumber: ACCOUNT.phoneNumber, requestId: "delete-1",
    now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 5
  })
  assert.deepEqual(cooldown, { kind: "cooldown", retryAfterMs: 29_000 })
  const limited = await createPostgresAuthRepository(createPool({
    window_started_at: new Date(now - 100_000),
    last_requested_at: new Date(now - 31_000),
    request_count: 5
  })).claimAccountDeletionOtpSend({
    accountId: ACCOUNT.accountId, phoneNumber: ACCOUNT.phoneNumber, requestId: "delete-2",
    now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 5
  })
  assert.deepEqual(limited, { kind: "limit", retryAfterMs: 200_000 })
  assert.ok(queries.some((query) => query.includes("pg_advisory_xact_lock")))
})

test("postgres account deletion challenge expires and locks after the fifth failed attempt", async () => {
  const now = Date.parse("2026-07-21T10:00:00.000Z")
  const createPool = (pending: Record<string, unknown>) => {
    const queries: string[] = []
    return {
      queries,
      pool: {
        async connect() {
          return {
            async query(text: string) {
              queries.push(normalizeSql(text))
              if (text.includes("FROM blumi_account_deletion_challenges WHERE account_id")) {
                return { rows: [pending], rowCount: 1 }
              }
              return { rows: [], rowCount: 0 }
            },
            release() {}
          }
        }
      } as unknown as Pool
    }
  }
  const expiredFixture = createPool({
    phone_number: ACCOUNT.phoneNumber, otp_id: "delete-otp", code_digest: "a".repeat(64),
    expires_at: new Date(now - 1), attempt_count: 0
  })
  const expired = await createPostgresAuthRepository(expiredFixture.pool)
    .verifyAndCreateAccountDeletionConfirmation({
      accountId: ACCOUNT.accountId, phoneNumber: ACCOUNT.phoneNumber, now, maxAttempts: 5,
      confirmationTokenDigest: "b".repeat(64), confirmationExpiresAt: now + 300_000,
      matches: () => false
    })
  assert.deepEqual(expired, { kind: "missing_or_expired" })
  assert.ok(expiredFixture.queries.some((query) => query.startsWith("DELETE FROM blumi_account_deletion_challenges")))

  const lockedFixture = createPool({
    phone_number: ACCOUNT.phoneNumber, otp_id: "delete-otp", code_digest: "a".repeat(64),
    expires_at: new Date(now + 300_000), attempt_count: 4
  })
  const locked = await createPostgresAuthRepository(lockedFixture.pool)
    .verifyAndCreateAccountDeletionConfirmation({
      accountId: ACCOUNT.accountId, phoneNumber: ACCOUNT.phoneNumber, now, maxAttempts: 5,
      confirmationTokenDigest: "b".repeat(64), confirmationExpiresAt: now + 300_000,
      matches: () => false
    })
  assert.deepEqual(locked, { kind: "attempt_limit" })
  assert.ok(lockedFixture.queries.some((query) => query.includes("SET attempt_count = $2")))
})

test("postgres recovery OTP persistence is isolated from the sign-in OTP tables", async () => {
  const now = Date.parse("2026-07-11T10:00:00.000Z")
  const queries: string[] = []
  const pool = {
    async connect() {
      return {
        async query(text: string) {
          const normalized = normalizeSql(text)
          queries.push(normalized)
          if (normalized.startsWith("INSERT INTO blumi_recovery_phone_challenges")) {
            return { rows: [{ phone_number: PENDING_OTP.phoneNumber }], rowCount: 1 }
          }
          if (normalized.includes("FROM blumi_recovery_otp_send_limits WHERE")) {
            return { rows: [], rowCount: 0 }
          }
          if (normalized.includes("FROM blumi_recovery_phone_challenges WHERE phone_number")) {
            return {
              rows: [{
                phone_number: PENDING_OTP.phoneNumber,
                otp_id: PENDING_OTP.otpId,
                code_digest: PENDING_OTP.codeDigest,
                expires_at: new Date(PENDING_OTP.expiresAt),
                attempt_count: 0
              }],
              rowCount: 1
            }
          }
          return { rows: [], rowCount: 0 }
        },
        release() {}
      }
    }
  } as unknown as Pool
  const repository = createPostgresAuthRepository(pool)

  assert.deepEqual(await repository.claimRecoveryOtpSend({
    phoneNumber: PENDING_OTP.phoneNumber,
    requestId: PENDING_OTP.otpId,
    now,
    cooldownMs: 30_000,
    windowMs: 300_000,
    maxRequests: 5
  }), { kind: "claimed" })
  assert.equal(await repository.activatePendingRecoveryOtp(PENDING_OTP), true)
  assert.deepEqual(await repository.verifyAndConsumePendingRecoveryOtp({
    phoneNumber: PENDING_OTP.phoneNumber,
    now,
    maxAttempts: 5,
    matches: () => true
  }), { kind: "verified" })

  const sql = queries.join("\n")
  assert.match(sql, /blumi_recovery_phone_challenges/)
  assert.match(sql, /blumi_recovery_otp_send_limits/)
  assert.doesNotMatch(sql, /blumi_pending_otps|blumi_otp_send_limits/)
})

function accountRow(account: AccountRecord = ACCOUNT) {
  return {
    account_id: account.accountId,
    user_id: account.userId,
    phone_number: account.phoneNumber,
    display_name: account.profile.displayName,
    age: account.profile.age,
    avatar_preset_id: account.profile.avatar.presetId,
    avatar_selection: account.profile.avatar.loadout,
    avatar_revision: account.profile.avatar.revision,
    bio: account.profile.bio ?? null,
    gender: account.profile.gender ?? null,
    interests: account.profile.interests ?? [],
    profile_prompts: account.profile.prompts ?? [],
    location_lat: account.profile.location?.lat ?? null,
    location_lng: account.profile.location?.lng ?? null,
    onboarding_profile_complete: account.onboarding.profile === "complete",
    onboarding_avatar_complete: account.onboarding.avatar === "complete",
    onboarding_room_complete: account.onboarding.room === "complete",
    onboarding_completed_at: account.onboarding.completedAt ?? null,
    created_at: account.createdAt,
    updated_at: account.updatedAt
  }
}

test("postgres account reads durable onboarding status", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = {
    async query(text: string, values: unknown[] = []) {
      const normalized = normalizeSql(text)
      queries.push({ text: normalized, values })
      return {
        rows: [{
          account_id: ACCOUNT.accountId,
          user_id: ACCOUNT.userId,
          phone_number: ACCOUNT.phoneNumber,
          display_name: ACCOUNT.profile.displayName,
          age: ACCOUNT.profile.age,
          avatar_preset_id: ACCOUNT.profile.avatar.presetId,
          avatar_selection: DEFAULT_LOADOUT,
          avatar_revision: 0,
          bio: null,
          gender: null,
          interests: [],
          location_lat: null,
          location_lng: null,
          onboarding_profile_complete: true,
          onboarding_avatar_complete: true,
          onboarding_room_complete: false,
          onboarding_completed_at: null,
          created_at: ACCOUNT.createdAt,
          updated_at: ACCOUNT.updatedAt
        }],
        rowCount: 1
      }
    }
  } as unknown as Pool

  const account = await createPostgresAuthRepository(pool)
    .getAccountByPhone(ACCOUNT.phoneNumber) as (AccountRecord & {
      onboarding: {
        profile: "incomplete" | "complete"
        avatar: "incomplete" | "complete"
        room: "incomplete" | "complete"
        completedAt?: string
      }
    }) | null

  assert.ok(account)
  assert.deepEqual(account.onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "incomplete"
  })
  assert.match(queries[0]?.text ?? "", /onboarding_profile_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_avatar_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_room_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_completed_at/)
})

test("postgres account writes durable onboarding status", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text: normalizeSql(text), values })
      return { rows: [], rowCount: 1 }
    }
  } as unknown as Pool
  const completedAt = "2026-07-13T09:00:00.000Z"
  const account = {
    ...ACCOUNT,
    onboarding: {
      profile: "complete",
      avatar: "complete",
      room: "complete",
      completedAt
    }
  } as AccountRecord

  await createPostgresAuthRepository(pool).saveAccount(account)

  assert.match(queries[0]?.text ?? "", /onboarding_profile_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_avatar_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_room_complete/)
  assert.match(queries[0]?.text ?? "", /onboarding_completed_at/)
  assert.deepEqual(queries[0]?.values.slice(21, 25), [
    true,
    true,
    true,
    completedAt
  ])
})

test("postgres profile updates cannot regress onboarding columns", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text: normalizeSql(text), values })
      return {
        rows: [{
          account_id: ACCOUNT.accountId,
          user_id: ACCOUNT.userId,
          phone_number: ACCOUNT.phoneNumber,
          display_name: "Mina Rose",
          age: 25,
          avatar_preset_id: DEFAULT_LOADOUT.bodyId,
          avatar_selection: DEFAULT_LOADOUT,
          avatar_revision: 0,
          bio: "Tea and tiny worlds.",
          gender: "woman",
          interests: ["tea"],
          location_lat: null,
          location_lng: null,
          onboarding_profile_complete: true,
          onboarding_avatar_complete: true,
          onboarding_room_complete: true,
          onboarding_completed_at: "2026-07-13T09:00:00.000Z",
          created_at: ACCOUNT.createdAt,
          updated_at: "2026-07-13T10:00:00.000Z"
        }],
        rowCount: 1
      }
    }
  } as unknown as Pool

  const updated = await createPostgresAuthRepository(pool).updateAccountProfile({
    accountId: ACCOUNT.accountId,
    profile: {
      displayName: "Mina Rose",
      age: 25,
      bio: "Tea and tiny worlds.",
      interests: ["tea"]
    },
    now: new Date("2026-07-13T10:00:00.000Z")
  })

  const setClause = queries[0]?.text.split(" RETURNING ")[0] ?? ""
  assert.match(setClause, /^UPDATE blumi_accounts SET display_name/)
  assert.doesNotMatch(setClause, /onboarding_/)
  assert.doesNotMatch(setClause, /avatar_preset_id|avatar_selection|avatar_revision/)
  assert.equal(updated?.onboarding.room, "complete")
})

test("postgres profile update stores identity and discovery preferences in separate columns", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text: normalizeSql(text), values })
      return { rows: [], rowCount: 0 }
    }
  } as unknown as Pool

  await createPostgresAuthRepository(pool).updateAccountProfile({
    accountId: ACCOUNT.accountId,
    profile: {
      identityGender: "man",
      discoveryPreferences: {
        ageMin: 23,
        ageMax: 35,
        genders: ["woman"],
        vibes: ["coffee"],
        radiusKm: 25
      }
    },
    now: new Date("2026-07-21T12:00:00.000Z")
  })

  const update = queries[0]
  assert.ok(update)
  assert.match(update.text, /identity_gender = \$2/i)
  assert.match(update.text, /discovery_age_min = \$3/i)
  assert.match(update.text, /discovery_age_max = \$4/i)
  assert.match(update.text, /discovery_genders = \$5/i)
  assert.match(update.text, /discovery_vibes = \$6/i)
  assert.match(update.text, /discovery_radius_km = \$7/i)
  assert.doesNotMatch(update.text.split(" RETURNING ")[0] ?? "", /avatar_/i)
})

test("postgres profile clears persist empty values and normalize the reread", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const pool = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text: normalizeSql(text), values })
      return {
        rows: [{
          account_id: ACCOUNT.accountId,
          user_id: ACCOUNT.userId,
          phone_number: ACCOUNT.phoneNumber,
          display_name: ACCOUNT.profile.displayName,
          age: ACCOUNT.profile.age,
          avatar_preset_id: DEFAULT_LOADOUT.bodyId,
          avatar_selection: DEFAULT_LOADOUT,
          avatar_revision: 0,
          bio: "",
          gender: null,
          interests: [],
          profile_prompts: [
            { promptId: "invented", answer: "Must not leak." },
            { promptId: "small_joy", answer: "  Fresh   coffee. " },
            { promptId: "ask_me_about", answer: "x".repeat(121) }
          ],
          location_lat: null,
          location_lng: null,
          onboarding_profile_complete: true,
          onboarding_avatar_complete: true,
          onboarding_room_complete: false,
          onboarding_completed_at: null,
          created_at: ACCOUNT.createdAt,
          updated_at: "2026-07-13T10:00:00.000Z"
        }],
        rowCount: 1
      }
    }
  } as unknown as Pool

  const updated = await createPostgresAuthRepository(pool).updateAccountProfile({
    accountId: ACCOUNT.accountId,
    profile: {
      bio: null,
      interests: null,
      prompts: [{ promptId: "small_joy", answer: "Fresh coffee." }]
    },
    now: new Date("2026-07-13T10:00:00.000Z")
  })

  const updateQuery = queries[0]
  assert.ok(updateQuery)
  assert.match(
    updateQuery.text.split(" RETURNING ")[0] ?? "",
    /^UPDATE blumi_accounts SET bio = \$2, interests = \$3, profile_prompts = \$4, updated_at = \$5/
  )
  assert.equal(updateQuery.values[1], "")
  assert.deepEqual(updateQuery.values[2], [])
  assert.equal(
    updateQuery.values[3],
    JSON.stringify([{ promptId: "small_joy", answer: "Fresh coffee." }])
  )
  assert.equal(updated?.profile.bio, undefined)
  assert.equal(updated?.profile.interests, undefined)
  assert.deepEqual(updated?.profile.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee." }
  ])
})

test("postgres profile update remains avatar-safe during a concurrent CAS", async () => {
  const queries: string[] = []
  const nextSelection: CompleteAvatarSelection = {
    presetId: "avatar_v2_body_male_light",
    revision: 0,
    loadout: {
      ...DEFAULT_MALE_AVATAR_LOADOUT,
      accessoryIds: [...DEFAULT_MALE_AVATAR_LOADOUT.accessoryIds]
    }
  }
  const canonicalRow = {
    account_id: ACCOUNT.accountId,
    user_id: ACCOUNT.userId,
    phone_number: ACCOUNT.phoneNumber,
    display_name: "Concurrent Name",
    age: 24,
    avatar_preset_id: nextSelection.presetId,
    avatar_selection: nextSelection.loadout,
    avatar_revision: 1,
    bio: null,
    gender: "woman",
    interests: [],
    location_lat: null,
    location_lng: null,
    onboarding_profile_complete: true,
    onboarding_avatar_complete: true,
    onboarding_room_complete: true,
    onboarding_completed_at: "2026-07-13T09:00:00.000Z",
    created_at: ACCOUNT.createdAt,
    updated_at: "2026-07-13T12:00:01.000Z"
  }
  const pool = {
    async query(text: string) {
      queries.push(normalizeSql(text))
      return { rows: [canonicalRow], rowCount: 1 }
    }
  } as unknown as Pool
  const repository = createPostgresAuthRepository(pool)

  await Promise.all([
    repository.updateAvatarSelection({
      accountId: ACCOUNT.accountId,
      expectedRevision: 0,
      selection: nextSelection,
      now: new Date("2026-07-13T12:00:00.000Z")
    }),
    repository.updateAccountProfile({
      accountId: ACCOUNT.accountId,
      profile: { displayName: "Concurrent Name" },
      now: new Date("2026-07-13T12:00:01.000Z")
    })
  ])

  const profileUpdate = queries.find((query) =>
    query.startsWith("UPDATE blumi_accounts SET display_name")
  ) ?? ""
  const setClause = profileUpdate.split(" RETURNING ")[0] ?? ""
  assert.doesNotMatch(setClause, /avatar_preset_id|avatar_selection|avatar_revision/)
  assert.doesNotMatch(setClause, /\bbio\s*=|\bgender\s*=|\binterests\s*=/)
})

test("postgres profile completion checks prerequisites atomically", async () => {
  const queries: string[] = []
  const pool = {
    async query(text: string) {
      queries.push(normalizeSql(text))
      return { rows: [], rowCount: 0 }
    }
  } as unknown as Pool

  await createPostgresAuthRepository(pool).completeOnboardingStep({
    accountId: ACCOUNT.accountId,
    step: "profile",
    now: new Date("2026-07-13T12:00:00.000Z")
  })

  assert.match(queries[0] ?? "", /CASE WHEN char_length\(trim\(display_name\)\) >= 2/)
  assert.match(queries[0] ?? "", /age BETWEEN 18 AND 99/)
  assert.match(
    queries[0] ?? "",
    /COALESCE\(identity_gender, gender\) IN \('woman', 'man'\)/
  )
  assert.doesNotMatch(queries[0] ?? "", /'non-binary'/)
})

test("postgres avatar selection uses one atomic revision compare-and-swap", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  const selection: CompleteAvatarSelection = {
    presetId: "avatar_v2_body_male_light",
    revision: 42,
    loadout: {
      ...DEFAULT_MALE_AVATAR_LOADOUT,
      accessoryIds: [...DEFAULT_MALE_AVATAR_LOADOUT.accessoryIds]
    }
  }
  const pool = {
    async query(text: string, values: unknown[] = []) {
      const normalized = normalizeSql(text)
      queries.push({ text: normalized, values })
      if (normalized.startsWith("UPDATE blumi_accounts")) {
        return {
          rows: [{
            account_id: ACCOUNT.accountId,
            user_id: ACCOUNT.userId,
            phone_number: ACCOUNT.phoneNumber,
            display_name: ACCOUNT.profile.displayName,
            age: ACCOUNT.profile.age,
            avatar_preset_id: selection.presetId,
            avatar_selection: selection.loadout,
            avatar_revision: 1,
            bio: null,
            gender: null,
            interests: [],
            location_lat: null,
            location_lng: null,
            onboarding_profile_complete: false,
            onboarding_avatar_complete: false,
            onboarding_room_complete: false,
            onboarding_completed_at: null,
            created_at: ACCOUNT.createdAt,
            updated_at: "2026-07-13T12:00:00.000Z"
          }],
          rowCount: 1
        }
      }
      return { rows: [], rowCount: 0 }
    }
  } as unknown as Pool

  const result = await createPostgresAuthRepository(pool).updateAvatarSelection({
    accountId: ACCOUNT.accountId,
    expectedRevision: 0,
    selection,
    now: new Date("2026-07-13T12:00:00.000Z")
  })

  assert.equal(result.kind, "updated")
  assert.match(queries[0]?.text ?? "", /avatar_revision = avatar_revision \+ 1/)
  assert.match(queries[0]?.text ?? "", /WHERE account_id = \$1 AND avatar_revision = \$2/)
  assert.equal(queries[0]?.values[3], JSON.stringify(selection.loadout))
  assert.equal(queries[0]?.values.includes(42), false)
  if (result.kind === "updated") {
    assert.equal(result.account.profile.avatar.revision, 1)
    assert.deepEqual(result.account.profile.avatar.loadout, selection.loadout)
  }
})

test("postgres avatar selection returns canonical conflict or missing result", async () => {
  const selection = ACCOUNT.profile.avatar as CompleteAvatarSelection
  const conflictPool = {
    async query(text: string) {
      const normalized = normalizeSql(text)
      if (normalized.startsWith("UPDATE blumi_accounts")) {
        return { rows: [], rowCount: 0 }
      }
      return {
        rows: [{
          account_id: ACCOUNT.accountId,
          user_id: ACCOUNT.userId,
          phone_number: ACCOUNT.phoneNumber,
          display_name: ACCOUNT.profile.displayName,
          age: ACCOUNT.profile.age,
          avatar_preset_id: selection.presetId,
          avatar_selection: selection.loadout,
          avatar_revision: 3,
          bio: null,
          gender: null,
          interests: [],
          location_lat: null,
          location_lng: null,
          onboarding_profile_complete: false,
          onboarding_avatar_complete: false,
          onboarding_room_complete: false,
          onboarding_completed_at: null,
          created_at: ACCOUNT.createdAt,
          updated_at: ACCOUNT.updatedAt
        }],
        rowCount: 1
      }
    }
  } as unknown as Pool
  const missingPool = {
    async query() {
      return { rows: [], rowCount: 0 }
    }
  } as unknown as Pool

  const conflict = await createPostgresAuthRepository(conflictPool)
    .updateAvatarSelection({
      accountId: ACCOUNT.accountId,
      expectedRevision: 1,
      selection,
      now: new Date()
    })
  const missing = await createPostgresAuthRepository(missingPool)
    .updateAvatarSelection({
      accountId: "missing",
      expectedRevision: 0,
      selection,
      now: new Date()
    })

  assert.equal(conflict.kind, "conflict")
  assert.equal(missing.kind, "missing")
  if (conflict.kind === "conflict") {
    assert.equal(conflict.current.revision, 3)
  }
})

test("postgres OTP send claims serialize and commit before provider delivery", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  let released = false
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = normalizeSql(text)
      queries.push({ text: normalized, values })
      if (normalized.includes("FROM blumi_otp_send_limits")) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  const result = await createPostgresAuthRepository(pool).claimOtpSend({
    phoneNumber: PENDING_OTP.phoneNumber,
    requestId: PENDING_OTP.otpId,
    now: Date.parse("2026-07-11T10:00:00.000Z"),
    cooldownMs: 30_000,
    windowMs: 300_000,
    maxRequests: 5
  })

  assert.deepEqual(result, { kind: "claimed" })
  assert.equal(queries[0]?.text, "BEGIN")
  assert.equal(
    queries.some((query) => query.text.includes("DELETE FROM blumi_pending_otps")),
    true
  )
  assert.equal(
    queries.some((query) => query.text.includes("DELETE FROM blumi_otp_send_limits")),
    true
  )
  assert.equal(
    queries.some((query) => query.text.includes("pg_advisory_xact_lock")),
    true
  )
  assert.equal(
    queries.some((query) => query.text.includes("FROM blumi_otp_send_limits")),
    true
  )
  assert.equal(
    queries.some((query) => query.text.includes("INSERT INTO blumi_otp_send_limits")),
    true
  )
  assert.equal(queries.at(-1)?.text, "COMMIT")
  assert.equal(released, true)
})

test("postgres OTP activation persists only an HMAC digest for the active request", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = []
  let released = false
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = normalizeSql(text)
      queries.push({ text: normalized, values })
      return normalized.includes("RETURNING phone_number")
        ? { rows: [{ phone_number: PENDING_OTP.phoneNumber }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  const activated = await createPostgresAuthRepository(pool)
    .activatePendingOtp(PENDING_OTP)

  assert.equal(activated, true)
  assert.equal(queries[0]?.text, "BEGIN")
  assert.match(queries[1]?.text ?? "", /pg_advisory_xact_lock/)
  assert.match(queries[2]?.text ?? "", /code_digest/)
  assert.doesNotMatch(queries[2]?.text ?? "", /\bcode\b/)
  assert.equal(queries[2]?.values.includes("482931"), false)
  assert.equal(queries[2]?.values.includes(PENDING_OTP.codeDigest), true)
  assert.match(queries[2]?.text ?? "", /active_request_id = \$2/)
  assert.equal(queries.at(-1)?.text, "COMMIT")
  assert.equal(released, true)
})

test("postgres OTP verification increments or consumes inside one transaction", async () => {
  async function run(matches: boolean) {
    const queries: string[] = []
    let released = false
    const client = {
      async query(text: string) {
        const normalized = normalizeSql(text)
        queries.push(normalized)
        if (normalized.includes("FROM blumi_pending_otps")) {
          return {
            rows: [{
              phone_number: PENDING_OTP.phoneNumber,
              otp_id: PENDING_OTP.otpId,
              code_digest: PENDING_OTP.codeDigest,
              expires_at: new Date(PENDING_OTP.expiresAt),
              attempt_count: 0
            }],
            rowCount: 1
          }
        }
        return { rows: [], rowCount: 0 }
      },
      release() {
        released = true
      }
    }
    const pool = {
      async connect() {
        return client
      }
    } as unknown as Pool

    const result = await createPostgresAuthRepository(pool)
      .verifyAndConsumePendingOtp({
        phoneNumber: PENDING_OTP.phoneNumber,
        now: Date.parse("2026-07-11T10:01:00.000Z"),
        maxAttempts: 5,
        matches: () => matches
      })
    return { queries, released, result }
  }

  const wrong = await run(false)
  assert.deepEqual(wrong.result, { kind: "invalid", attemptsRemaining: 4 })
  assert.match(wrong.queries[1] ?? "", /pg_advisory_xact_lock/)
  assert.match(wrong.queries[2] ?? "", /FOR UPDATE/)
  assert.match(wrong.queries[3] ?? "", /UPDATE blumi_pending_otps/)
  assert.equal(wrong.queries.at(-1), "COMMIT")
  assert.equal(wrong.released, true)

  const correct = await run(true)
  assert.deepEqual(correct.result, { kind: "verified" })
  assert.match(correct.queries[3] ?? "", /DELETE FROM blumi_pending_otps/)
  assert.equal(correct.queries.at(-1), "COMMIT")
  assert.equal(correct.released, true)
})

test("postgres OTP sign-in commits account and session before consuming the code", async () => {
  const queries: string[] = []
  let released = false
  const client = {
    async query(text: string) {
      const normalized = normalizeSql(text)
      queries.push(normalized)
      if (normalized.includes("FROM blumi_pending_otps")) {
        return {
          rows: [{
            phone_number: PENDING_OTP.phoneNumber,
            otp_id: PENDING_OTP.otpId,
            code_digest: PENDING_OTP.codeDigest,
            expires_at: new Date(PENDING_OTP.expiresAt),
            attempt_count: 0
          }],
          rowCount: 1
        }
      }
      if (normalized.startsWith("SELECT account_id")) {
        return { rows: [], rowCount: 0 }
      }
      if (normalized.startsWith("INSERT INTO blumi_accounts")) {
        return { rows: [accountRow()], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  const result = await createPostgresAuthRepository(pool).finalizeOtpSignIn({
    phoneNumber: PENDING_OTP.phoneNumber,
    now: Date.parse("2026-07-11T10:01:00.000Z"),
    maxAttempts: 5,
    matches: () => true,
    newAccount: ACCOUNT,
    createSession: () => NEXT_SESSION
  })

  assert.equal(result.kind, "verified")
  assert.match(queries[1] ?? "", /pg_advisory_xact_lock/)
  assert.match(queries[2] ?? "", /FOR UPDATE/)
  const accountWrite = queries.findIndex((query) =>
    query.startsWith("INSERT INTO blumi_accounts")
  )
  const sessionWrite = queries.findIndex((query) =>
    query.startsWith("INSERT INTO blumi_sessions")
  )
  const consume = queries.findIndex((query) =>
    query.startsWith("DELETE FROM blumi_pending_otps")
  )
  assert.ok(accountWrite > 2)
  assert.ok(sessionWrite > accountWrite)
  assert.ok(consume > sessionWrite)
  assert.equal(queries.at(-1), "COMMIT")
  assert.equal(released, true)
})

test("postgres OTP sign-in rolls back without consuming the code when session storage fails", async () => {
  const queries: string[] = []
  const client = {
    async query(text: string) {
      const normalized = normalizeSql(text)
      queries.push(normalized)
      if (normalized.includes("FROM blumi_pending_otps")) {
        return {
          rows: [{
            phone_number: PENDING_OTP.phoneNumber,
            otp_id: PENDING_OTP.otpId,
            code_digest: PENDING_OTP.codeDigest,
            expires_at: new Date(PENDING_OTP.expiresAt),
            attempt_count: 0
          }],
          rowCount: 1
        }
      }
      if (normalized.startsWith("SELECT account_id")) {
        return { rows: [accountRow()], rowCount: 1 }
      }
      if (normalized.startsWith("INSERT INTO blumi_sessions")) {
        throw new Error("session persistence unavailable")
      }
      return { rows: [], rowCount: 1 }
    },
    release() {}
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  await assert.rejects(
    () => createPostgresAuthRepository(pool).finalizeOtpSignIn({
      phoneNumber: PENDING_OTP.phoneNumber,
      now: Date.parse("2026-07-11T10:01:00.000Z"),
      maxAttempts: 5,
      matches: () => true,
      newAccount: ACCOUNT,
      createSession: () => NEXT_SESSION
    }),
    /session persistence unavailable/
  )

  assert.equal(
    queries.some((query) => query.startsWith("DELETE FROM blumi_pending_otps")),
    false
  )
  assert.equal(queries.at(-1), "ROLLBACK")
})

test("postgres session rotation conditionally consumes and replaces one token", async () => {
  const queries: string[] = []
  let released = false
  const client = {
    async query(text: string) {
      const normalized = normalizeSql(text)
      queries.push(normalized)
      if (normalized.startsWith("UPDATE blumi_sessions")) {
        return { rows: [{ session_id: NEXT_SESSION.sessionId }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  const rotated = await createPostgresAuthRepository(pool).rotateSession({
    currentSessionTokenHash: "a".repeat(64),
    nextSession: NEXT_SESSION,
    now: new Date("2026-07-11T10:00:00.000Z")
  })

  assert.equal(rotated, true)
  assert.equal(queries[0], "BEGIN")
  assert.match(queries[1] ?? "", /UPDATE blumi_sessions/)
  assert.match(queries[1] ?? "", /RETURNING session_id/)
  assert.match(queries[2] ?? "", /INSERT INTO blumi_sessions/)
  assert.equal(queries.at(-1), "COMMIT")
  assert.equal(released, true)
})

test("postgres account deletion removes every user-owned domain in one transaction", async () => {
  const queries: string[] = []
  let released = false
  const client = {
    async query(text: string) {
      queries.push(normalizeSql(text))
      return text.includes("RETURNING account_id")
        ? { rows: [{ account_id: ACCOUNT.accountId }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  await createPostgresAuthRepository(pool).deleteAccountData(ACCOUNT, {
    confirmationTokenDigest: "d".repeat(64),
    now: Date.parse("2026-07-21T12:00:00.000Z")
  })

  assert.equal(queries[0], "BEGIN")
  assert.match(queries[1] ?? "", /DELETE FROM blumi_account_deletion_confirmations/)
  assert.match(queries[1] ?? "", /RETURNING account_id/)
  assert.equal(queries.at(-1), "COMMIT")
  assert.equal(released, true)
  for (const table of [
    "blumi_pending_otps",
    "blumi_recovery_phone_challenges",
    "blumi_recovery_otp_send_limits",
    "blumi_account_recovery_requests",
    "blumi_account_action_challenges",
    "blumi_account_action_confirmations",
    "blumi_account_action_otp_send_limits",
    "blumi_push_devices",
    "blumi_push_delivery_audit",
    "blumi_push_delivery_outbox",
    "blumi_notification_preferences",
    "blumi_notification_policy_events",
    "blumi_notification_policy_audit",
    "blumi_realtime_tickets",
    "blumi_chat_threads",
    "blumi_room_presence",
    "blumi_mini_room_invites",
    "blumi_mini_rooms",
    "blumi_connection_decisions",
    "blumi_connection_matches",
    "blumi_reactions",
    "blumi_safety_blocks",
    "blumi_safety_reports",
    "blumi_economy_reward_ledger",
    "blumi_economy_inventories",
    "blumi_discovery_decisions",
    "blumi_discovery_decision_quotas",
    "blumi_discovery_watches",
    "blumi_matches",
    "blumi_referral_invites",
    "blumi_personal_room_decor",
    "blumi_discover_profiles",
    "blumi_accounts"
  ]) {
    assert.equal(
      queries.some((query) => query.includes(`DELETE FROM ${table}`)),
      true,
      `${table} must be removed during account deletion`
    )
  }
})

test("postgres account deletion rolls back and releases the client on failure", async () => {
  const queries: string[] = []
  let released = false
  const client = {
    async query(text: string) {
      const normalized = normalizeSql(text)
      queries.push(normalized)
      if (normalized.includes("DELETE FROM blumi_chat_threads")) {
        throw new Error("database unavailable")
      }
      return { rows: [] }
    },
    release() {
      released = true
    }
  }
  const pool = {
    async connect() {
      return client
    }
  } as unknown as Pool

  await assert.rejects(
    () => createPostgresAuthRepository(pool).deleteAccountData(ACCOUNT),
    /database unavailable/
  )
  assert.equal(queries.at(-1), "ROLLBACK")
  assert.equal(released, true)
})

function normalizeSql(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}
