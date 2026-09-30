import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual
} from "node:crypto"
import type {
  CompleteAvatarSelection,
  UserProfile
} from "@blumi/contracts"
import { isReadableProfileGender } from "@blumi/contracts"
import type { ModerationPhoneBanRecord } from "./moderationPhoneBan"
import {
  createAvatarSelection,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"

export interface PendingOtp {
  phoneNumber: string
  otpId: string
  codeDigest: string
  expiresAt: number
  attemptCount: number
}

export type OtpPurpose =
  | "login"
  | "account_deletion"
  | "account_data_export"
  | "account_recovery"
  | "phone_change_current"
  | "phone_change_new"

export type AccountActionPurpose =
  | "account_data_export"
  | "phone_change_current"
  | "phone_change_new"

export interface OtpSendLimit {
  phoneNumber: string
  activeRequestId: string
  windowStartedAt: number
  lastRequestedAt: number
  requestCount: number
}

export interface AccountRecord {
  accountId: string
  userId: string
  phoneNumber: string
  acceptedTerms?: AcceptedTermsRecord
  profile: UserProfile
  onboarding: AccountOnboardingStatus
  createdAt: string
  updatedAt: string
  moderation?: AccountModeration
}

export interface AcceptedTermsRecord {
  version: string
  locale: "en" | "tr"
  acceptedAt: string
}

export type AccountModerationStatus = "active" | "warned" | "suspended" | "banned"

export interface AccountModeration {
  status: AccountModerationStatus
  updatedAt: string
  suspendedUntil?: string
}

export type AccountOnboardingStep = "profile" | "avatar" | "room"
export type AccountOnboardingStepStatus = "incomplete" | "complete"

export interface AccountOnboardingStatus {
  profile: AccountOnboardingStepStatus
  avatar: AccountOnboardingStepStatus
  room: AccountOnboardingStepStatus
  completedAt?: string
}

export function isProductEligibleAccount(account: AccountRecord): boolean {
  return (
    !isAccountModerationRestricted(account) &&
    isProfileOnboardingReady(account) &&
    account.onboarding.profile === "complete" &&
    account.onboarding.avatar === "complete" &&
    account.onboarding.room === "complete"
  )
}

export function accountModeration(account: AccountRecord): AccountModeration {
  return account.moderation ?? {
    status: "active",
    updatedAt: account.updatedAt
  }
}

export function isAccountModerationRestricted(account: AccountRecord): boolean {
  const status = accountModeration(account).status
  return status === "suspended" || status === "banned"
}

export function isProfileOnboardingReady(account: AccountRecord): boolean {
  return account.profile.displayName.trim().length >= 2 &&
    typeof account.profile.age === "number" &&
    account.profile.age >= 18 &&
    account.profile.age <= 99 &&
    isReadableProfileGender(
      account.profile.identityGender ?? account.profile.gender
    )
}

export interface SessionRecord {
  accountId: string
  sessionId: string
  userId: string
  sessionTokenHash: string
  expiresAt: string
  /**
   * Absolute end of the session family (sign-in to forced re-verification).
   * Absent only on legacy rows created before migration 068; the first
   * rotation of such a family anchors it.
   */
  familyExpiresAt?: string
  /** Set when this token was exchanged by refresh; the row is then a tombstone. */
  rotatedAt?: string
  /** Hash of the token issued in exchange for this one. */
  replacedByTokenHash?: string
}

export interface BlumiBackendStore {
  firebaseActionChallenges: Map<string, FirebaseActionChallenge>
  firebaseUserDeletionOutbox: Map<string, { uid: string; accountId: string; nextAttemptAt: number; attemptCount: number }>
  pendingOtps: Map<string, PendingOtp>
  otpSendLimits: Map<string, OtpSendLimit>
  pendingRecoveryOtps: Map<string, PendingOtp>
  recoveryOtpSendLimits: Map<string, OtpSendLimit>
  pendingAccountDeletionOtps: Map<string, PendingOtp>
  accountDeletionOtpSendLimits: Map<string, OtpSendLimit>
  accountDeletionConfirmations: Map<string, AccountDeletionConfirmation>
  pendingAccountActionOtps: Map<string, PendingAccountActionOtp>
  accountActionOtpSendLimits: Map<string, OtpSendLimit>
  accountActionConfirmations: Map<string, AccountActionConfirmation>
  accountsByPhone: Map<string, AccountRecord>
  sessionsByTokenHash: Map<string, SessionRecord>
  /** Verified Firebase uid bound to each account (blumi_accounts.firebase_uid). */
  firebaseUidsByAccountId: Map<string, string>
  /** Phone ban records keyed by the phone's keyed hash (blumi_moderation_phone_bans). */
  moderationPhoneBans: Map<string, ModerationPhoneBanRecord>
}

export interface AccountDeletionConfirmation {
  accountId: string
  tokenDigest: string
  expiresAt: number
  firebaseUid?: string
}

export interface FirebaseActionChallenge {
  accountId: string
  purpose: "account_deletion" | AccountActionPurpose
  challengeId: string
  sessionTokenHash: string
  targetPhoneNumber: string
  issuedAt: number
  expiresAt: number
}

export interface PendingAccountActionOtp extends PendingOtp {
  accountId: string
  purpose: AccountActionPurpose
  targetPhoneNumber: string
}

export interface AccountActionConfirmation {
  accountId: string
  purpose: AccountActionPurpose
  targetPhoneNumber: string
  tokenDigest: string
  expiresAt: number
}

export function createBlumiBackendStore(): BlumiBackendStore {
  return {
    firebaseActionChallenges: new Map(),
    firebaseUserDeletionOutbox: new Map(),
    pendingOtps: new Map(),
    otpSendLimits: new Map(),
    pendingRecoveryOtps: new Map(),
    recoveryOtpSendLimits: new Map(),
    pendingAccountDeletionOtps: new Map(),
    accountDeletionOtpSendLimits: new Map(),
    accountDeletionConfirmations: new Map(),
    pendingAccountActionOtps: new Map(),
    accountActionOtpSendLimits: new Map(),
    accountActionConfirmations: new Map(),
    accountsByPhone: new Map(),
    sessionsByTokenHash: new Map(),
    firebaseUidsByAccountId: new Map(),
    moderationPhoneBans: new Map()
  }
}

export function createSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function createOtpId(): string {
  return randomUUID()
}

export function createOtpDigest(input: {
  secret: string | Buffer
  otpId: string
  phoneNumber: string
  code: string
  purpose?: OtpPurpose
}): string {
  return createHmac("sha256", input.secret)
    .update(`blumi:otp:${input.purpose ?? "login"}:v1\0`)
    .update(input.phoneNumber)
    .update("\0")
    .update(input.otpId)
    .update("\0")
    .update(input.code)
    .digest("hex")
}

export function otpDigestsMatch(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

export function createAccountRecord(
  phoneNumber: string,
  now = new Date(),
  acceptedTerms?: AcceptedTermsRecord
): AccountRecord {
  const userId = `user_${randomUUID()}`
  const createdAt = now.toISOString()

  return {
    accountId: `account_${randomUUID()}`,
    userId,
    phoneNumber,
    acceptedTerms: acceptedTerms ? { ...acceptedTerms } : undefined,
    createdAt,
    updatedAt: createdAt,
    onboarding: {
      profile: "incomplete",
      avatar: "incomplete",
      room: "incomplete"
    },
    profile: {
      userId,
      displayName: "",
      avatar: createDefaultAvatarSelection()
    }
  }
}

export function createDefaultAvatarSelection(
  presetId = "avatar_v2_body_default",
  revision = 0
): CompleteAvatarSelection {
  const loadout = presetId === DEFAULT_MALE_AVATAR_LOADOUT.bodyId
    ? DEFAULT_MALE_AVATAR_LOADOUT
    : DEFAULT_FEMALE_AVATAR_LOADOUT
  return createAvatarSelection(loadout, revision)
}

export function createSessionToken(): string {
  return `dv_${randomUUID()}_${randomUUID()}`
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex")
}

/** Sliding lifetime of one session token; refresh issues a new one. */
export const SESSION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30
/**
 * Absolute lifetime of a session family. After it, refresh stops and the
 * member re-verifies the phone. Three sliding windows: the mobile client
 * refreshes within 24 hours of expiry, so an active member re-verifies at
 * most once per quarter.
 */
export const SESSION_FAMILY_MAX_LIFETIME_MS = 1000 * 60 * 60 * 24 * 90
/**
 * How long a rotated token may be presented again to refresh without being
 * treated as stolen. It covers a client retry after a lost refresh response
 * or a cold relaunch that still holds the previous token.
 */
export const SESSION_REFRESH_REUSE_GRACE_MS = 1000 * 30

export function createSessionRecord(
  account: AccountRecord,
  sessionToken: string,
  now = new Date()
): SessionRecord {
  return {
    accountId: account.accountId,
    sessionId: `session_${randomUUID()}`,
    userId: account.userId,
    sessionTokenHash: hashSessionToken(sessionToken),
    expiresAt: new Date(now.getTime() + SESSION_TOKEN_TTL_MS).toISOString(),
    familyExpiresAt: new Date(now.getTime() + SESSION_FAMILY_MAX_LIFETIME_MS).toISOString()
  }
}

/** Expiry of a token issued by refresh: sliding, but never past the family cap. */
export function capSessionExpiry(now: Date, familyExpiresAt: string): string {
  const sliding = now.getTime() + SESSION_TOKEN_TTL_MS
  return new Date(Math.min(sliding, Date.parse(familyExpiresAt))).toISOString()
}
