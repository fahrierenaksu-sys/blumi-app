import {
  USER_PROFILE_MAX_INTEREST_LENGTH,
  USER_PROFILE_MAX_INTERESTS,
  USER_PROFILE_MAX_PROMPTS,
  USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH,
  USER_PROFILE_PROMPT_OPTIONS,
  isProfileGender,
  type DiscoveryPreferences,
  type ProfileGender,
  type UserProfile,
  type UserProfilePrompt
} from "@blumi/contracts"
import { randomBytes } from "node:crypto"
import { AuthError } from "./authErrors"
import {
  createInMemoryAuthRepository,
  type AccountProfileUpdate,
  type AuthRepository
} from "./authRepository"
import {
  createAccountRecord,
  createBlumiBackendStore,
  createOtpDigest,
  createOtpId,
  createSessionRecord,
  createSessionToken,
  createSixDigitCode,
  hashSessionToken,
  otpDigestsMatch,
  type AcceptedTermsRecord,
  type AccountRecord,
  type AccountModeration,
  type AccountActionPurpose,
  type AccountOnboardingStep,
  type BlumiBackendStore,
  type SessionRecord
} from "./authStore"
import { isProfileOnboardingReady } from "./authStore"
import {
  createDevelopmentSmsProvider,
  type SmsProvider
} from "./smsProvider"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  createEmptyAccountDataExporter,
  type AccountDataExporter,
  type AccountDataExportSections
} from "../account/accountDataExporter"

const OTP_TTL_MS = 1000 * 60 * 5
const MAX_VERIFY_ATTEMPTS = 5
const OTP_SEND_COOLDOWN_MS = 1000 * 30
const OTP_SEND_WINDOW_MS = 1000 * 60 * 5
const MAX_OTP_SENDS_PER_WINDOW = 5
const ALLOWED_AVATAR_PRESET_IDS = new Set([
  "dusk",
  "sunset",
  "avatar_v2_body_default",
  "avatar_v2_body_male_light"
])
const ALLOWED_DISCOVERY_GENDERS = new Set(["woman", "man"])
const ALLOWED_DISCOVERY_RADIUS_KM = new Set([25, 50, 100])

export class OnboardingPrerequisiteError extends Error {
  readonly code = "ONBOARDING_PREREQUISITE_REQUIRED"

  constructor(message: string) {
    super(message)
    this.name = "OnboardingPrerequisiteError"
  }
}

export interface AuthService {
  store: BlumiBackendStore
  repository: AuthRepository
  sendCode(phoneNumber: string, now?: Date): Promise<{ expiresAt: string }>
  /** Internal fixture/bootstrap compatibility only. HTTP login must use verifyExistingAccount. */
  verifyCode(phoneNumber: string, code: string, now?: Date): Promise<{ account: AccountRecord; session: SessionRecord; sessionToken: string }>
  verifyExistingAccount(phoneNumber: string, code: string, now?: Date): Promise<{ account: AccountRecord; session: SessionRecord; sessionToken: string }>
  registerAccount(
    phoneNumber: string,
    code: string,
    termsAcceptance: {
      version: string
      locale: "en" | "tr"
    },
    now?: Date
  ): Promise<{ account: AccountRecord; session: SessionRecord; sessionToken: string }>
  requestRecoveryPhoneVerification(phoneNumber: string, now?: Date): Promise<{ expiresAt: string }>
  verifyRecoveryPhoneVerification(phoneNumber: string, code: string, now?: Date): Promise<boolean>
  getSession(sessionToken: string, now?: Date): Promise<{ account: AccountRecord; session: SessionRecord } | null>
  getSessionByTokenHash(sessionTokenHash: string, now?: Date): Promise<{ account: AccountRecord; session: SessionRecord } | null>
  isRealtimeUserAllowed(userId: string, now?: Date): Promise<boolean>
  isRealtimeSessionAllowed(input: { userId: string; sessionFamilyId: string }, now?: Date): Promise<boolean>
  acknowledgeModeration(
    sessionToken: string,
    now?: Date
  ): Promise<AccountModeration | null>
  updateProfile(sessionToken: string, profile: ProfileUpdateInput, now?: Date): Promise<UserProfile | null>
  completeOnboardingStep(
    sessionToken: string,
    step: AccountOnboardingStep,
    now?: Date
  ): Promise<AccountRecord["onboarding"] | null>
  refreshSession(sessionToken: string, now?: Date): Promise<{ account: AccountRecord; session: SessionRecord; sessionToken: string } | null>
  revokeSession(sessionToken: string): Promise<void>
  requestAccountDeletionChallenge(sessionToken: string, now?: Date): Promise<{ expiresAt: string } | null>
  verifyAccountDeletionChallenge(sessionToken: string, code: string, now?: Date): Promise<{ confirmationToken: string; expiresAt: string } | null>
  deleteAccount(sessionToken: string, confirmationToken: string, now?: Date): Promise<"deleted" | "missing_session" | "reauth_required">
  requestAccountDataExportChallenge(sessionToken: string, now?: Date): Promise<{ expiresAt: string } | null>
  verifyAccountDataExportChallenge(sessionToken: string, code: string, now?: Date): Promise<{ confirmationToken: string; expiresAt: string } | null>
  exportAccountData(sessionToken: string, confirmationToken: string, now?: Date): Promise<AsyncIterable<string> | "missing_session" | "reauth_required">
  requestPhoneChangeChallenge(sessionToken: string, now?: Date): Promise<{ expiresAt: string } | null>
  verifyPhoneChangeChallenge(sessionToken: string, code: string, now?: Date): Promise<{ confirmationToken: string; expiresAt: string } | null>
  requestPhoneChangeNewNumberChallenge(sessionToken: string, phoneNumber: string, currentPhoneConfirmationToken: string, now?: Date): Promise<{ expiresAt: string } | null>
  verifyPhoneChangeNewNumberChallenge(sessionToken: string, code: string, now?: Date): Promise<{ confirmationToken: string; expiresAt: string } | null>
  confirmPhoneChange(sessionToken: string, currentPhoneConfirmationToken: string, newPhoneConfirmationToken: string, now?: Date): Promise<{ account: AccountRecord } | "missing_session" | "reauth_required" | "phone_in_use">
}

export interface AccountDataExport {
  schemaVersion: "2026-07-21"
  exportedAt: string
  account: Pick<AccountRecord, "accountId" | "userId" | "phoneNumber" | "profile" | "onboarding" | "createdAt" | "updatedAt" | "acceptedTerms">
  data: AccountDataExportSections
  exclusions: readonly string[]
}

export interface ProfileUpdateInput {
  displayName?: string
  age?: number
  avatarPresetId?: string
  bio?: string
  gender?: string
  identityGender?: string
  discoveryPreferences?: DiscoveryPreferences
  interests?: string[]
  prompts?: UserProfilePrompt[]
  locationLat?: number
  locationLng?: number
}

export interface CreateAuthServiceOptions {
  store?: BlumiBackendStore
  repository?: AuthRepository
  smsProvider?: SmsProvider
  codeFactory?: (phoneNumber: string) => string
  otpHmacSecret?: string | Buffer
  accountDeletionHandlers?: Array<(account: AccountRecord) => Promise<void>>
  accountDataExporter?: AccountDataExporter
}

export function createAuthService(options: CreateAuthServiceOptions = {}): AuthService {
  const store = options.store ?? createBlumiBackendStore()
  const repository =
    options.repository ?? createInMemoryAuthRepository(store)
  const smsProvider = options.smsProvider ?? createDevelopmentSmsProvider()
  const codeFactory = options.codeFactory ?? createSixDigitCode
  const otpHmacSecret = options.otpHmacSecret ?? randomBytes(32)
  const accountDeletionHandlers = options.accountDeletionHandlers ?? []
  const accountDataExporter = options.accountDataExporter ?? createEmptyAccountDataExporter()

  async function requestAccountActionChallenge(input: {
    account: AccountRecord
    purpose: AccountActionPurpose
    targetPhoneNumber: string
    now: Date
  }): Promise<{ expiresAt: string }> {
    const otpId = createOtpId()
    const claim = await repository.claimAccountActionOtpSend({
      accountId: input.account.accountId,
      purpose: input.purpose,
      phoneNumber: input.targetPhoneNumber,
      requestId: otpId,
      now: input.now.getTime(),
      cooldownMs: OTP_SEND_COOLDOWN_MS,
      windowMs: OTP_SEND_WINDOW_MS,
      maxRequests: MAX_OTP_SENDS_PER_WINDOW
    })
    if (claim.kind === "cooldown" || claim.kind === "limit") {
      throw new AuthError({
        code: claim.kind === "cooldown" ? "OTP_SEND_COOLDOWN" : "OTP_SEND_LIMIT",
        message: claim.kind === "cooldown"
          ? "Wait a moment before requesting another security code."
          : "Too many security codes. Try again later.",
        statusCode: 429,
        retryAfterMs: claim.retryAfterMs
      })
    }
    const expiresAt = input.now.getTime() + OTP_TTL_MS
    const code = codeFactory(input.targetPhoneNumber)
    try {
      await smsProvider.sendVerificationCode({
        phoneNumber: input.targetPhoneNumber,
        code,
        expiresAt: new Date(expiresAt).toISOString(),
        purpose: input.purpose
      })
    } catch {
      throw new AuthError({
        code: "SMS_DELIVERY_UNAVAILABLE",
        message: "We could not send a security code right now. Try again shortly.",
        statusCode: 503
      })
    }
    const activated = await repository.activatePendingAccountActionOtp({
      action: {
        accountId: input.account.accountId,
        purpose: input.purpose,
        targetPhoneNumber: input.targetPhoneNumber,
        phoneNumber: input.targetPhoneNumber,
        otpId,
        codeDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId,
          phoneNumber: input.targetPhoneNumber,
          code,
          purpose: input.purpose
        }),
        expiresAt,
        attemptCount: 0
      }
    })
    if (!activated) {
      throw new AuthError({
        code: "OTP_STORAGE_UNAVAILABLE",
        message: "We could not send a security code right now. Try again shortly.",
        statusCode: 503
      })
    }
    return { expiresAt: new Date(expiresAt).toISOString() }
  }

  async function verifyAccountActionChallenge(input: {
    account: AccountRecord
    purpose: AccountActionPurpose
    targetPhoneNumber: string
    code: string
    now: Date
  }): Promise<{ confirmationToken: string; expiresAt: string }> {
    const confirmationToken = createSessionToken()
    const confirmationExpiresAt = input.now.getTime() + OTP_TTL_MS
    const result = await repository.verifyAndCreateAccountActionConfirmation({
      accountId: input.account.accountId,
      purpose: input.purpose,
      targetPhoneNumber: input.targetPhoneNumber,
      phoneNumber: input.targetPhoneNumber,
      now: input.now.getTime(),
      maxAttempts: MAX_VERIFY_ATTEMPTS,
      confirmationTokenDigest: createOtpDigest({
        secret: otpHmacSecret,
        otpId: input.account.accountId,
        phoneNumber: input.account.accountId,
        code: confirmationToken,
        purpose: input.purpose
      }),
      confirmationExpiresAt,
      matches(pending) {
        return otpDigestsMatch(pending.codeDigest, createOtpDigest({
          secret: otpHmacSecret,
          otpId: pending.otpId,
          phoneNumber: input.targetPhoneNumber,
          code: input.code,
          purpose: input.purpose
        }))
      }
    })
    if (result.kind === "attempt_limit") {
      throw new AuthError({ code: "OTP_ATTEMPT_LIMIT", message: "Too many attempts. Request a fresh security code.", statusCode: 429 })
    }
    if (result.kind !== "verified") {
      throw new AuthError({ code: "OTP_INVALID_OR_EXPIRED", message: "That security code is invalid or expired. Request a new code.", statusCode: 401 })
    }
    return { confirmationToken, expiresAt: new Date(confirmationExpiresAt).toISOString() }
  }

  async function finalizePhoneOtpSignIn(input: {
    phoneNumber: string
    code: string
    now: Date
    acceptedTerms?: AcceptedTermsRecord
    requireExistingAccount?: boolean
  }): Promise<{ account: AccountRecord; session: SessionRecord; sessionToken: string }> {
    const sessionToken = createSessionToken()
    const finalization = await repository.finalizeOtpSignIn({
      requireExistingAccount: input.requireExistingAccount,
      phoneNumber: input.phoneNumber,
      now: input.now.getTime(),
      maxAttempts: MAX_VERIFY_ATTEMPTS,
      newAccount: createAccountRecord(
        input.phoneNumber,
        input.now,
        input.acceptedTerms
      ),
      createSession(account) {
        return createSessionRecord(account, sessionToken, input.now)
      },
      matches(pending) {
        return otpDigestsMatch(
          pending.codeDigest,
          createOtpDigest({
            secret: otpHmacSecret,
            otpId: pending.otpId,
            phoneNumber: input.phoneNumber,
            code: input.code
          })
        )
      }
    })
    if (finalization.kind === "terms_required") {
      throw new AuthError({ code: "TERMS_ACCEPTANCE_REQUIRED", message: "Terms acceptance is required to create an account.", statusCode: 409 })
    }
    if (finalization.kind === "attempt_limit") {
      throw new AuthError({
        code: "OTP_ATTEMPT_LIMIT",
        message: "Too many attempts. Request a fresh SMS code.",
        statusCode: 429
      })
    }
    if (finalization.kind !== "verified") {
      throw new AuthError({
        code: "OTP_INVALID_OR_EXPIRED",
        message: "That code is invalid or expired. Request a new SMS code.",
        statusCode: 401
      })
    }

    return {
      account: finalization.account,
      session: finalization.session,
      sessionToken
    }
  }

  return {
    store,
    repository,
    async sendCode(phoneNumber, now = new Date()) {
      const otpId = createOtpId()
      const claim = await repository.claimOtpSend({
        phoneNumber,
        requestId: otpId,
        now: now.getTime(),
        cooldownMs: OTP_SEND_COOLDOWN_MS,
        windowMs: OTP_SEND_WINDOW_MS,
        maxRequests: MAX_OTP_SENDS_PER_WINDOW
      })
      if (claim.kind === "cooldown") {
        throw new AuthError({
          code: "OTP_SEND_COOLDOWN",
          message: "Wait a moment before requesting another SMS code.",
          statusCode: 429,
          retryAfterMs: claim.retryAfterMs
        })
      }
      if (claim.kind === "limit") {
        throw new AuthError({
          code: "OTP_SEND_LIMIT",
          message: "Too many SMS requests. Try again later.",
          statusCode: 429,
          retryAfterMs: claim.retryAfterMs
        })
      }

      const expiresAt = now.getTime() + OTP_TTL_MS
      const code = codeFactory(phoneNumber)
      try {
        await smsProvider.sendVerificationCode({
          phoneNumber,
          code,
          expiresAt: new Date(expiresAt).toISOString()
        })
      } catch {
        throw new AuthError({
          code: "SMS_DELIVERY_UNAVAILABLE",
          message: "We could not send a code right now. Try again shortly.",
          statusCode: 503
        })
      }

      const codeDigest = createOtpDigest({
        secret: otpHmacSecret,
        otpId,
        phoneNumber,
        code
      })
      let activated = false
      try {
        activated = await repository.activatePendingOtp({
          phoneNumber,
          otpId,
          codeDigest,
          expiresAt,
          attemptCount: 0
        })
      } catch {
        throw new AuthError({
          code: "OTP_STORAGE_UNAVAILABLE",
          message: "We could not send a code right now. Try again shortly.",
          statusCode: 503
        })
      }
      if (!activated) {
        throw new AuthError({
          code: "OTP_STORAGE_UNAVAILABLE",
          message: "We could not send a code right now. Try again shortly.",
          statusCode: 503
        })
      }

      return { expiresAt: new Date(expiresAt).toISOString() }
    },

    async verifyCode(phoneNumber, code, now = new Date()) {
      return finalizePhoneOtpSignIn({
        phoneNumber,
        code,
        now
      })
    },
    async verifyExistingAccount(phoneNumber, code, now = new Date()) {
      return finalizePhoneOtpSignIn({ phoneNumber, code, now, requireExistingAccount: true })
    },

    async registerAccount(phoneNumber, code, termsAcceptance, now = new Date()) {
      return finalizePhoneOtpSignIn({
        phoneNumber,
        code,
        now,
        acceptedTerms: {
          version: termsAcceptance.version,
          locale: termsAcceptance.locale,
          acceptedAt: now.toISOString()
        }
      })
    },

    async requestRecoveryPhoneVerification(phoneNumber, now = new Date()) {
      const normalized = normalizePhoneNumber(phoneNumber)
      const otpId = createOtpId()
      const claim = await repository.claimRecoveryOtpSend({
        phoneNumber: normalized,
        requestId: otpId,
        now: now.getTime(),
        cooldownMs: OTP_SEND_COOLDOWN_MS,
        windowMs: OTP_SEND_WINDOW_MS,
        maxRequests: MAX_OTP_SENDS_PER_WINDOW
      })
      if (claim.kind !== "claimed") {
        throw new AuthError({
          code: claim.kind === "cooldown" ? "OTP_SEND_COOLDOWN" : "OTP_SEND_LIMIT",
          message: "Wait a moment before requesting another recovery code.",
          statusCode: 429,
          retryAfterMs: claim.retryAfterMs
        })
      }
      const expiresAt = now.getTime() + OTP_TTL_MS
      const code = codeFactory(normalized)
      try {
        await smsProvider.sendVerificationCode({
          phoneNumber: normalized,
          code,
          expiresAt: new Date(expiresAt).toISOString(),
          purpose: "account_recovery"
        })
      } catch {
        throw new AuthError({ code: "SMS_DELIVERY_UNAVAILABLE", message: "We could not send a recovery code right now. Try again shortly.", statusCode: 503 })
      }
      const activated = await repository.activatePendingRecoveryOtp({
        phoneNumber: normalized,
        otpId,
        codeDigest: createOtpDigest({ secret: otpHmacSecret, otpId, phoneNumber: normalized, code, purpose: "account_recovery" }),
        expiresAt,
        attemptCount: 0
      })
      if (!activated) {
        throw new AuthError({ code: "OTP_STORAGE_UNAVAILABLE", message: "We could not send a recovery code right now. Try again shortly.", statusCode: 503 })
      }
      return { expiresAt: new Date(expiresAt).toISOString() }
    },

    async verifyRecoveryPhoneVerification(phoneNumber, code, now = new Date()) {
      const normalized = normalizePhoneNumber(phoneNumber)
      const result = await repository.verifyAndConsumePendingRecoveryOtp({
        phoneNumber: normalized,
        now: now.getTime(),
        maxAttempts: MAX_VERIFY_ATTEMPTS,
        matches(pending) {
          return otpDigestsMatch(pending.codeDigest, createOtpDigest({ secret: otpHmacSecret, otpId: pending.otpId, phoneNumber: normalized, code, purpose: "account_recovery" }))
        }
      })
      if (result.kind !== "verified") {
        throw new AuthError({
          code: result.kind === "attempt_limit" ? "OTP_ATTEMPT_LIMIT" : "OTP_INVALID_OR_EXPIRED",
          message: "That recovery code is invalid or expired. Request a new code.",
          statusCode: result.kind === "attempt_limit" ? 429 : 401
        })
      }
      return true
    },

    async getSession(sessionToken, now = new Date()) {
      return this.getSessionByTokenHash(hashSessionToken(sessionToken), now)
    },

    async getSessionByTokenHash(sessionTokenHash, now = new Date()) {
      const session = await repository.getSessionByTokenHash(sessionTokenHash)
      if (!session || new Date(session.expiresAt).getTime() <= now.getTime()) {
        return null
      }

      const account = await repository.findAccountById(session.accountId)
      if (
        account?.moderation?.status === "suspended" &&
        account.moderation.suspendedUntil &&
        Date.parse(account.moderation.suspendedUntil) <= now.getTime()
      ) {
        const restored = await repository.clearExpiredSuspension({
          accountId: account.accountId,
          now
        })
        return restored ? { account: restored, session } : null
      }
      return account ? { account, session } : null
    },
    async isRealtimeUserAllowed(userId, now = new Date()) {
      const account = await repository.findAccountByUserId(userId)
      if (!account) return false
      if (
        account.moderation?.status === "suspended" &&
        account.moderation.suspendedUntil &&
        Date.parse(account.moderation.suspendedUntil) <= now.getTime()
      ) {
        const restored = await repository.clearExpiredSuspension({
          accountId: account.accountId,
          now
        })
        return Boolean(restored) && restored?.moderation?.status !== "banned" &&
          restored?.moderation?.status !== "suspended"
      }
      return account.moderation?.status !== "suspended" && account.moderation?.status !== "banned"
    },
    async isRealtimeSessionAllowed(input, now = new Date()) {
      if (!await repository.hasActiveSessionFamily({ ...input, now })) return false
      return this.isRealtimeUserAllowed(input.userId, now)
    },
    async acknowledgeModeration(sessionToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      const account = await repository.acknowledgeModeration({
        accountId: resolved.account.accountId,
        now
      })
      return account?.moderation ?? {
        status: "active",
        updatedAt: account?.updatedAt ?? now.toISOString()
      }
    },

    async updateProfile(sessionToken, profile, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      const displayName =
        typeof profile.displayName === "string"
          ? normalizeDisplayName(profile.displayName)
          : resolved.account.profile.displayName
      const age =
        typeof profile.age === "number"
          ? normalizeAge(profile.age)
          : resolved.account.profile.age
      const avatarPresetId =
        typeof profile.avatarPresetId === "string"
          ? normalizeAvatarPresetId(profile.avatarPresetId)
          : resolved.account.profile.avatar.presetId
      if (
        resolved.account.profile.avatar.loadout &&
        avatarPresetId !== resolved.account.profile.avatar.presetId
      ) {
        throw new PublicRequestError("Use the avatar editor to change your character.")
      }
      const bio =
        typeof profile.bio === "string"
          ? normalizeBio(profile.bio)
          : resolved.account.profile.bio
      const submittedGender =
        typeof profile.gender === "string"
          ? normalizeGender(profile.gender)
          : undefined
      const submittedIdentityGender =
        typeof profile.identityGender === "string"
          ? normalizeGender(profile.identityGender)
          : undefined
      if (
        typeof profile.identityGender === "string" &&
        !submittedIdentityGender
      ) {
        throw new PublicRequestError("Choose a valid identity option.")
      }
      const discoveryPreferences = profile.discoveryPreferences === undefined
        ? resolved.account.profile.discoveryPreferences
        : normalizeDiscoveryPreferences(profile.discoveryPreferences)
      if (
        resolved.account.onboarding.profile === "complete" &&
        typeof profile.gender === "string" &&
        !submittedGender
      ) {
        throw new PublicRequestError("A completed profile must keep a gender option.")
      }
      const interests =
        Array.isArray(profile.interests)
          ? normalizeInterests(profile.interests)
          : resolved.account.profile.interests
      const prompts = Array.isArray(profile.prompts)
        ? normalizeProfilePrompts(profile.prompts)
        : resolved.account.profile.prompts
      const location =
        typeof profile.locationLat === "number" ||
        typeof profile.locationLng === "number"
          ? normalizeLocation(
              typeof profile.locationLat === "number"
                ? profile.locationLat
                : resolved.account.profile.location?.lat,
              typeof profile.locationLng === "number"
                ? profile.locationLng
                : resolved.account.profile.location?.lng
            )
          : resolved.account.profile.location

      const updatedProfile: AccountProfileUpdate = {
        ...(typeof profile.displayName === "string" ? { displayName } : {}),
        ...(typeof profile.age === "number" ? { age } : {}),
        ...(typeof profile.bio === "string" ? { bio: bio ?? null } : {}),
        ...(typeof profile.gender === "string"
          ? { gender: submittedGender ?? null }
          : {}),
        ...(typeof profile.identityGender === "string"
          ? { identityGender: submittedIdentityGender ?? null }
          : typeof profile.gender === "string"
            ? { identityGender: submittedGender ?? null }
          : {}),
        ...(profile.discoveryPreferences !== undefined
          ? { discoveryPreferences }
          : {}),
        ...(Array.isArray(profile.interests)
          ? { interests: interests ?? null }
          : {}),
        ...(Array.isArray(profile.prompts)
          ? { prompts: prompts ?? null }
          : {}),
        ...(typeof profile.locationLat === "number" ||
        typeof profile.locationLng === "number"
          ? { location: location ?? null }
          : {})
      }

      const updatedAccount = await repository.updateAccountProfile({
        accountId: resolved.account.accountId,
        profile: updatedProfile,
        now
      })
      if (typeof profile.gender === "string" && !submittedGender) {
        const currentAccount = updatedAccount ??
          await repository.findAccountById(resolved.account.accountId)
        if (currentAccount?.onboarding.profile === "complete") {
          throw new PublicRequestError("A completed profile must keep a gender option.")
        }
      }
      return updatedAccount?.profile ?? null
    },

    async completeOnboardingStep(sessionToken, step, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      assertOnboardingStepReady(resolved.account, step)
      const updated = await repository.completeOnboardingStep({
        accountId: resolved.account.accountId,
        step,
        now
      })
      if (updated && updated.onboarding[step] !== "complete") {
        assertOnboardingStepReady(updated, step)
      }
      return updated ? { ...updated.onboarding } : null
    },

    async refreshSession(sessionToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null

      const nextSessionToken = createSessionToken()
      const nextSession = createSessionRecord(
        resolved.account,
        nextSessionToken,
        now
      )
      const nextSessionInFamily = {
        ...nextSession,
        sessionId: resolved.session.sessionId
      }
      const rotated = await repository.rotateSession({
        currentSessionTokenHash: hashSessionToken(sessionToken),
        nextSession: nextSessionInFamily,
        now
      })
      if (!rotated) return null
      return {
        account: resolved.account,
        session: nextSessionInFamily,
        sessionToken: nextSessionToken
      }
    },

    async revokeSession(sessionToken) {
      await repository.deleteSession(hashSessionToken(sessionToken))
    },

    async requestAccountDeletionChallenge(sessionToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null

      const otpId = createOtpId()
      const claim = await repository.claimAccountDeletionOtpSend({
        accountId: resolved.account.accountId,
        phoneNumber: resolved.account.phoneNumber,
        requestId: otpId,
        now: now.getTime(),
        cooldownMs: OTP_SEND_COOLDOWN_MS,
        windowMs: OTP_SEND_WINDOW_MS,
        maxRequests: MAX_OTP_SENDS_PER_WINDOW
      })
      if (claim.kind === "cooldown" || claim.kind === "limit") {
        throw new AuthError({
          code: claim.kind === "cooldown" ? "OTP_SEND_COOLDOWN" : "OTP_SEND_LIMIT",
          message: claim.kind === "cooldown"
            ? "Wait a moment before requesting another deletion code."
            : "Too many deletion codes. Try again later.",
          statusCode: 429,
          retryAfterMs: claim.retryAfterMs
        })
      }
      const expiresAt = now.getTime() + OTP_TTL_MS
      const code = codeFactory(resolved.account.phoneNumber)
      try {
        await smsProvider.sendVerificationCode({
          phoneNumber: resolved.account.phoneNumber,
          code,
          expiresAt: new Date(expiresAt).toISOString(),
          purpose: "account_deletion"
        })
      } catch {
        throw new AuthError({
          code: "SMS_DELIVERY_UNAVAILABLE",
          message: "We could not send a deletion code right now. Try again shortly.",
          statusCode: 503
        })
      }
      const activated = await repository.activatePendingAccountDeletionOtp({
        accountId: resolved.account.accountId,
        pendingOtp: {
          phoneNumber: resolved.account.phoneNumber,
          otpId,
          codeDigest: createOtpDigest({
            secret: otpHmacSecret,
            otpId,
            phoneNumber: resolved.account.phoneNumber,
            code,
            purpose: "account_deletion"
          }),
          expiresAt,
          attemptCount: 0
        }
      })
      if (!activated) {
        throw new AuthError({
          code: "OTP_STORAGE_UNAVAILABLE",
          message: "We could not send a deletion code right now. Try again shortly.",
          statusCode: 503
        })
      }
      return { expiresAt: new Date(expiresAt).toISOString() }
    },

    async verifyAccountDeletionChallenge(sessionToken, code, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      const confirmationToken = createSessionToken()
      const confirmationExpiresAt = now.getTime() + OTP_TTL_MS
      const result = await repository.verifyAndCreateAccountDeletionConfirmation({
        accountId: resolved.account.accountId,
        phoneNumber: resolved.account.phoneNumber,
        now: now.getTime(),
        maxAttempts: MAX_VERIFY_ATTEMPTS,
        confirmationTokenDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId: resolved.account.accountId,
          phoneNumber: resolved.account.phoneNumber,
          code: confirmationToken,
          purpose: "account_deletion"
        }),
        confirmationExpiresAt,
        matches(pending) {
          return otpDigestsMatch(pending.codeDigest, createOtpDigest({
            secret: otpHmacSecret,
            otpId: pending.otpId,
            phoneNumber: resolved.account.phoneNumber,
            code,
            purpose: "account_deletion"
          }))
        }
      })
      if (result.kind === "attempt_limit") {
        throw new AuthError({ code: "OTP_ATTEMPT_LIMIT", message: "Too many attempts. Request a fresh deletion code.", statusCode: 429 })
      }
      if (result.kind !== "verified") {
        throw new AuthError({ code: "OTP_INVALID_OR_EXPIRED", message: "That deletion code is invalid or expired. Request a new code.", statusCode: 401 })
      }
      return { confirmationToken, expiresAt: new Date(confirmationExpiresAt).toISOString() }
    },

    async requestAccountDataExportChallenge(sessionToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      return requestAccountActionChallenge({
        account: resolved.account,
        purpose: "account_data_export",
        targetPhoneNumber: resolved.account.phoneNumber,
        now
      })
    },

    async verifyAccountDataExportChallenge(sessionToken, code, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      return verifyAccountActionChallenge({
        account: resolved.account,
        purpose: "account_data_export",
        targetPhoneNumber: resolved.account.phoneNumber,
        code,
        now
      })
    },

    async exportAccountData(sessionToken, confirmationToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return "missing_session"
      const consumed = await repository.consumeAccountActionConfirmation({
        accountId: resolved.account.accountId,
        purpose: "account_data_export",
        confirmationTokenDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId: resolved.account.accountId,
          phoneNumber: resolved.account.accountId,
          code: confirmationToken,
          purpose: "account_data_export"
        }),
        now: now.getTime()
      })
      if (!consumed) return "reauth_required"
      return accountDataExporter.streamExport(resolved.account, {
        schemaVersion: "2026-07-21",
        exportedAt: now.toISOString(),
        exclusions: [
          "authentication secrets and session tokens",
          "device push tokens",
          "moderation and staff-only records",
          "other members' private content"
        ]
      })
    },

    async requestPhoneChangeChallenge(sessionToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      return requestAccountActionChallenge({
        account: resolved.account,
        purpose: "phone_change_current",
        targetPhoneNumber: resolved.account.phoneNumber,
        now
      })
    },

    async verifyPhoneChangeChallenge(sessionToken, code, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      return verifyAccountActionChallenge({
        account: resolved.account,
        purpose: "phone_change_current",
        targetPhoneNumber: resolved.account.phoneNumber,
        code,
        now
      })
    },

    async requestPhoneChangeNewNumberChallenge(sessionToken, phoneNumber, currentPhoneConfirmationToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      const currentProofValid = await repository.validateAccountActionConfirmation({
        accountId: resolved.account.accountId,
        purpose: "phone_change_current",
        confirmationTokenDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId: resolved.account.accountId,
          phoneNumber: resolved.account.accountId,
          code: currentPhoneConfirmationToken,
          purpose: "phone_change_current"
        }),
        now: now.getTime()
      })
      if (!currentProofValid) {
        throw new AuthError({ code: "OTP_INVALID_OR_EXPIRED", message: "Confirm your current phone number first.", statusCode: 401 })
      }
      const normalized = normalizePhoneNumber(phoneNumber)
      if (normalized === resolved.account.phoneNumber) {
        throw new PublicRequestError("Choose a different phone number.")
      }
      return requestAccountActionChallenge({
        account: resolved.account,
        purpose: "phone_change_new",
        targetPhoneNumber: normalized,
        now
      })
    },

    async verifyPhoneChangeNewNumberChallenge(sessionToken, code, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return null
      const pending = await repository.getPendingAccountActionOtp({
        accountId: resolved.account.accountId,
        purpose: "phone_change_new"
      })
      if (!pending) {
        throw new AuthError({ code: "OTP_INVALID_OR_EXPIRED", message: "That security code is invalid or expired. Request a new code.", statusCode: 401 })
      }
      return verifyAccountActionChallenge({
        account: resolved.account,
        purpose: "phone_change_new",
        targetPhoneNumber: pending.targetPhoneNumber,
        code,
        now
      })
    },

    async confirmPhoneChange(sessionToken, currentPhoneConfirmationToken, newPhoneConfirmationToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return "missing_session"
      const result = await repository.completePhoneChange({
        accountId: resolved.account.accountId,
        currentPhoneConfirmationDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId: resolved.account.accountId,
          phoneNumber: resolved.account.accountId,
          code: currentPhoneConfirmationToken,
          purpose: "phone_change_current"
        }),
        newPhoneConfirmationDigest: createOtpDigest({
          secret: otpHmacSecret,
          otpId: resolved.account.accountId,
          phoneNumber: resolved.account.accountId,
          code: newPhoneConfirmationToken,
          purpose: "phone_change_new"
        }),
        now
      })
      if (result.kind === "conflict") return "phone_in_use"
      if (result.kind !== "updated") return "reauth_required"
      return { account: result.account }
    },

    async deleteAccount(sessionToken, confirmationToken, now = new Date()) {
      const resolved = await this.getSession(sessionToken, now)
      if (!resolved) return "missing_session"
      if (!confirmationToken) return "reauth_required"
      const confirmationTokenDigest = createOtpDigest({
        secret: otpHmacSecret,
        otpId: resolved.account.accountId,
        phoneNumber: resolved.account.phoneNumber,
        code: confirmationToken,
        purpose: "account_deletion"
      })

      const deleted = await repository.deleteAccountData(resolved.account, {
        confirmationTokenDigest,
        now: now.getTime()
      })
      if (deleted) {
        await Promise.all(
          accountDeletionHandlers.map((handler) => handler(resolved.account))
        )
      }
      return deleted ? "deleted" : "reauth_required"
    }
  }
}

function normalizeProfilePrompts(prompts: readonly UserProfilePrompt[]): UserProfilePrompt[] {
  if (prompts.length > USER_PROFILE_MAX_PROMPTS) {
    throw new PublicRequestError("Choose up to two profile prompts.")
  }
  const allowedIds = new Set(
    USER_PROFILE_PROMPT_OPTIONS.map((option) => option.promptId)
  )
  const ids = prompts.map((prompt) => prompt.promptId)
  if (new Set(ids).size !== ids.length) {
    throw new PublicRequestError("Choose each profile prompt only once.")
  }
  return prompts.map((prompt) => {
    if (!allowedIds.has(prompt.promptId)) {
      throw new PublicRequestError("Choose a valid profile prompt.")
    }
    const answer = prompt.answer.trim().replace(/\s+/g, " ")
    if (!answer || answer.length > USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH) {
      throw new PublicRequestError("Keep each profile prompt answer between 1 and 120 characters.")
    }
    return { promptId: prompt.promptId, answer }
  })
}

function normalizeDisplayName(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, " ")
  if (normalized.length < 2 || normalized.length > 30) {
    throw new PublicRequestError("Use a display name from 2 to 30 characters.")
  }
  return normalized
}

function normalizePhoneNumber(phoneNumber: string): string {
  const normalized = phoneNumber.trim().replace(/[\s()-]/g, "")
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new PublicRequestError("Enter a valid phone number with country code.")
  }
  return normalized
}

function normalizeAge(age: number): number {
  if (!Number.isInteger(age) || age < 18 || age > 99) {
    throw new PublicRequestError("Use an age from 18 to 99.")
  }
  return age
}

function normalizeAvatarPresetId(avatarPresetId: string): string {
  const normalized = avatarPresetId.trim()
  if (!ALLOWED_AVATAR_PRESET_IDS.has(normalized)) {
    throw new PublicRequestError("Choose an available avatar body.")
  }
  return normalized
}

function assertOnboardingStepReady(
  account: AccountRecord,
  step: AccountOnboardingStep
): void {
  if (step === "profile") {
    if (!isProfileOnboardingReady(account)) {
      throw new OnboardingPrerequisiteError(
        "Add your public name, 18+ age, and gender first."
      )
    }
    return
  }
  if (account.onboarding.profile !== "complete") {
    throw new OnboardingPrerequisiteError(
      "Finish your profile before choosing a look."
    )
  }
  if (step === "room" && account.onboarding.avatar !== "complete") {
    throw new OnboardingPrerequisiteError(
      "Keep a first look before finishing your room."
    )
  }
}

function normalizeBio(bio: string): string | undefined {
  const normalized = bio.trim().replace(/\s+/g, " ")
  if (!normalized) return undefined
  if (normalized.length > 300) {
    throw new PublicRequestError("Keep your bio under 300 characters.")
  }
  return normalized
}

function normalizeGender(gender: string): ProfileGender | undefined {
  const normalized = gender.trim().replace(/\s+/g, " ")
  if (!normalized) return undefined
  if (!isProfileGender(normalized)) {
    throw new PublicRequestError("Choose a valid gender option.")
  }
  return normalized
}

function normalizeDiscoveryPreferences(
  value: DiscoveryPreferences
): DiscoveryPreferences {
  if (
    !value ||
    !Number.isInteger(value.ageMin) ||
    !Number.isInteger(value.ageMax) ||
    value.ageMin < 18 ||
    value.ageMax > 99 ||
    value.ageMin > value.ageMax ||
    !Array.isArray(value.genders) ||
    value.genders.some((gender) =>
      !ALLOWED_DISCOVERY_GENDERS.has(gender)
    ) ||
    !Array.isArray(value.vibes) ||
    value.vibes.length > 8 ||
    value.vibes.some((vibe) =>
      typeof vibe !== "string" || !vibe.trim() || vibe.trim().length > 40
    ) ||
    !ALLOWED_DISCOVERY_RADIUS_KM.has(value.radiusKm)
  ) {
    throw new PublicRequestError("Choose valid discovery preferences.")
  }
  return {
    ageMin: value.ageMin,
    ageMax: value.ageMax,
    genders: [...new Set(value.genders)],
    vibes: [...new Set(value.vibes.map((vibe) =>
      vibe.trim().replace(/\s+/g, " ")
    ))],
    radiusKm: value.radiusKm
  }
}

function normalizeInterests(interests: string[]): string[] | undefined {
  const normalized = interests
    .map((interest) => interest.trim().replace(/\s+/g, " "))
    .filter((interest) => interest.length > 0)
  const unique = [...new Set(normalized)]
  if (unique.length > USER_PROFILE_MAX_INTERESTS) {
    throw new PublicRequestError(
      `Choose up to ${USER_PROFILE_MAX_INTERESTS} interests.`
    )
  }
  for (const interest of unique) {
    if (interest.length > USER_PROFILE_MAX_INTEREST_LENGTH) {
      throw new PublicRequestError(
        `Keep each interest under ${USER_PROFILE_MAX_INTEREST_LENGTH} characters.`
      )
    }
  }
  return unique.length > 0 ? unique : undefined
}

function normalizeLocation(
  lat: number | undefined,
  lng: number | undefined
): { lat: number; lng: number } | undefined {
  if (lat === undefined && lng === undefined) return undefined
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new PublicRequestError("Choose a valid location.")
  }
  return { lat, lng }
}

export function toSessionActor(
  account: AccountRecord,
  session: SessionRecord,
  sessionToken: string
) {
  return {
    session: {
      accountId: account.accountId,
      sessionId: session.sessionId,
      mode: "production",
      userId: account.userId,
      sessionToken,
      expiresAt: session.expiresAt,
      onboarding: { ...account.onboarding }
    },
    profile: account.profile
  }
}
