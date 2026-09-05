import type {
  AccountRecord,
  AccountActionPurpose,
  AccountOnboardingStep,
  BlumiBackendStore,
  PendingAccountActionOtp,
  PendingOtp,
  OtpSendLimit,
  SessionRecord
} from "./authStore"
import { createDefaultAvatarSelection, otpDigestsMatch } from "./authStore"
import { isProfileOnboardingReady } from "./authStore"
import type {
  CompleteAvatarSelection,
  DiscoveryPreferences,
  ProfileGender,
  UserProfile
} from "@blumi/contracts"
import { normalizeUserProfilePrompts } from "@blumi/contracts"

export interface AuthRepository {
  getPendingOtp(phoneNumber: string): Promise<PendingOtp | null>
  claimOtpSend(input: OtpSendClaimInput): Promise<OtpSendClaimResult>
  activatePendingOtp(pendingOtp: PendingOtp): Promise<boolean>
  getPendingRecoveryOtp(phoneNumber: string): Promise<PendingOtp | null>
  claimRecoveryOtpSend(input: OtpSendClaimInput): Promise<OtpSendClaimResult>
  activatePendingRecoveryOtp(pendingOtp: PendingOtp): Promise<boolean>
  verifyAndConsumePendingRecoveryOtp(input: OtpVerificationInput): Promise<OtpVerificationResult>
  getPendingAccountDeletionOtp(accountId: string): Promise<PendingOtp | null>
  claimAccountDeletionOtpSend(input: AccountDeletionOtpSendClaimInput): Promise<OtpSendClaimResult>
  activatePendingAccountDeletionOtp(input: { accountId: string; pendingOtp: PendingOtp }): Promise<boolean>
  verifyAndCreateAccountDeletionConfirmation(input: AccountDeletionOtpVerificationInput): Promise<OtpVerificationResult>
  consumeAccountDeletionConfirmation(input: AccountDeletionConfirmationConsumption): Promise<boolean>
  getPendingAccountActionOtp(input: { accountId: string; purpose: AccountActionPurpose }): Promise<PendingAccountActionOtp | null>
  claimAccountActionOtpSend(input: AccountActionOtpSendClaimInput): Promise<OtpSendClaimResult>
  activatePendingAccountActionOtp(input: { action: PendingAccountActionOtp }): Promise<boolean>
  verifyAndCreateAccountActionConfirmation(input: AccountActionOtpVerificationInput): Promise<OtpVerificationResult>
  validateAccountActionConfirmation(input: AccountActionConfirmationConsumption): Promise<boolean>
  consumeAccountActionConfirmation(input: AccountActionConfirmationConsumption): Promise<boolean>
  completePhoneChange(input: CompletePhoneChangeInput): Promise<PhoneChangeResult>
  finalizeOtpSignIn(
    input: OtpSignInFinalizationInput
  ): Promise<OtpSignInFinalizationResult>
  /** @deprecated Sign-in callers must use finalizeOtpSignIn atomically. */
  verifyAndConsumePendingOtp(input: OtpVerificationInput): Promise<OtpVerificationResult>
  getAccountByPhone(phoneNumber: string): Promise<AccountRecord | null>
  findAccountById(accountId: string): Promise<AccountRecord | null>
  findAccountByUserId(userId: string): Promise<AccountRecord | null>
  saveAccount(account: AccountRecord): Promise<void>
  updateAccountProfile(input: {
    accountId: string
    profile: AccountProfileUpdate
    now: Date
  }): Promise<AccountRecord | null>
  updateAvatarSelection(input: {
    accountId: string
    expectedRevision: number
    selection: CompleteAvatarSelection
    now: Date
  }): Promise<AvatarSelectionUpdateResult>
  completeOnboardingStep(input: {
    accountId: string
    step: AccountOnboardingStep
    now: Date
  }): Promise<AccountRecord | null>
  getSessionByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null>
  hasActiveSessionFamily(input: { userId: string; sessionFamilyId: string; now: Date }): Promise<boolean>
  saveSession(session: SessionRecord): Promise<void>
  deleteSession(sessionTokenHash: string): Promise<void>
  acknowledgeModeration(input: {
    accountId: string
    now: Date
  }): Promise<AccountRecord | null>
  clearExpiredSuspension(input: {
    accountId: string
    now: Date
  }): Promise<AccountRecord | null>
  rotateSession(input: {
    currentSessionTokenHash: string
    nextSession: SessionRecord
    now: Date
  }): Promise<boolean>
  deleteAccountData(
    account: AccountRecord,
    confirmation?: {
      confirmationTokenDigest: string
      now: number
    }
  ): Promise<boolean>
}

export interface AccountProfileUpdate {
  displayName?: string
  age?: number
  bio?: string | null
  gender?: ProfileGender | null
  identityGender?: ProfileGender | null
  discoveryPreferences?: DiscoveryPreferences | null
  interests?: string[] | null
  prompts?: UserProfile["prompts"] | null
  location?: UserProfile["location"] | null
}

export type AvatarSelectionUpdateResult =
  | { kind: "updated"; account: AccountRecord }
  | { kind: "conflict"; current: CompleteAvatarSelection }
  | { kind: "missing" }

export interface OtpSendClaimInput {
  phoneNumber: string
  requestId: string
  now: number
  cooldownMs: number
  windowMs: number
  maxRequests: number
}

export type OtpSendClaimResult =
  | { kind: "claimed" }
  | { kind: "cooldown" | "limit"; retryAfterMs: number }

export interface OtpVerificationInput {
  phoneNumber: string
  now: number
  maxAttempts: number
  matches(pendingOtp: PendingOtp): boolean
}

export type OtpVerificationResult =
  | { kind: "verified" }
  | { kind: "invalid"; attemptsRemaining: number }
  | { kind: "missing_or_expired" }
  | { kind: "attempt_limit" }

export interface OtpSignInFinalizationInput extends OtpVerificationInput {
  requireExistingAccount?: boolean
  newAccount: AccountRecord
  createSession(account: AccountRecord): SessionRecord
}

export interface AccountDeletionOtpSendClaimInput extends OtpSendClaimInput {
  accountId: string
}

export interface AccountDeletionOtpVerificationInput extends OtpVerificationInput {
  accountId: string
  confirmationTokenDigest: string
  confirmationExpiresAt: number
}

export interface AccountDeletionConfirmationConsumption {
  accountId: string
  confirmationTokenDigest: string
  now: number
}

export interface AccountActionOtpSendClaimInput extends OtpSendClaimInput {
  accountId: string
  purpose: AccountActionPurpose
}

export interface AccountActionOtpVerificationInput extends OtpVerificationInput {
  accountId: string
  purpose: AccountActionPurpose
  targetPhoneNumber: string
  confirmationTokenDigest: string
  confirmationExpiresAt: number
}

export interface AccountActionConfirmationConsumption {
  accountId: string
  purpose: AccountActionPurpose
  confirmationTokenDigest: string
  now: number
}

export interface CompletePhoneChangeInput {
  accountId: string
  currentPhoneConfirmationDigest: string
  newPhoneConfirmationDigest: string
  now: Date
}

export type PhoneChangeResult =
  | { kind: "updated"; account: AccountRecord }
  | { kind: "conflict" }
  | { kind: "reauth_required" }

export type OtpSignInFinalizationResult =
  | { kind: "terms_required" }
  | { kind: "verified"; account: AccountRecord; session: SessionRecord }
  | { kind: "invalid"; attemptsRemaining: number }
  | { kind: "missing_or_expired" }
  | { kind: "attempt_limit" }

export function createInMemoryAuthRepository(
  store: BlumiBackendStore
): AuthRepository {
  return {
    async getPendingOtp(phoneNumber) {
      const pending = store.pendingOtps.get(phoneNumber)
      return pending ? { ...pending } : null
    },
    async claimOtpSend(input) {
      const existing = store.otpSendLimits.get(input.phoneNumber)
      if (existing && existing.windowStartedAt + input.windowMs > input.now) {
        const cooldownRemaining =
          existing.lastRequestedAt + input.cooldownMs - input.now
        if (cooldownRemaining > 0) {
          return { kind: "cooldown", retryAfterMs: cooldownRemaining }
        }
        if (existing.requestCount >= input.maxRequests) {
          return {
            kind: "limit",
            retryAfterMs: existing.windowStartedAt + input.windowMs - input.now
          }
        }
      }

      const nextLimit: OtpSendLimit = {
        phoneNumber: input.phoneNumber,
        activeRequestId: input.requestId,
        windowStartedAt:
          existing && existing.windowStartedAt + input.windowMs > input.now
            ? existing.windowStartedAt
            : input.now,
        lastRequestedAt: input.now,
        requestCount:
          existing && existing.windowStartedAt + input.windowMs > input.now
            ? existing.requestCount + 1
            : 1
      }
      store.otpSendLimits.set(input.phoneNumber, nextLimit)
      return { kind: "claimed" }
    },
    async activatePendingOtp(pendingOtp) {
      const limit = store.otpSendLimits.get(pendingOtp.phoneNumber)
      if (!limit || limit.activeRequestId !== pendingOtp.otpId) return false
      store.pendingOtps.set(pendingOtp.phoneNumber, { ...pendingOtp })
      return true
    },
    async getPendingRecoveryOtp(phoneNumber) {
      const pending = store.pendingRecoveryOtps.get(phoneNumber)
      return pending ? { ...pending } : null
    },
    async claimRecoveryOtpSend(input) {
      const existing = store.recoveryOtpSendLimits.get(input.phoneNumber)
      if (existing && existing.windowStartedAt + input.windowMs > input.now) {
        const cooldownRemaining = existing.lastRequestedAt + input.cooldownMs - input.now
        if (cooldownRemaining > 0) return { kind: "cooldown", retryAfterMs: cooldownRemaining }
        if (existing.requestCount >= input.maxRequests) {
          return { kind: "limit", retryAfterMs: existing.windowStartedAt + input.windowMs - input.now }
        }
      }
      const active = Boolean(existing && existing.windowStartedAt + input.windowMs > input.now)
      store.recoveryOtpSendLimits.set(input.phoneNumber, {
        phoneNumber: input.phoneNumber,
        activeRequestId: input.requestId,
        windowStartedAt: active ? existing!.windowStartedAt : input.now,
        lastRequestedAt: input.now,
        requestCount: active ? existing!.requestCount + 1 : 1
      })
      return { kind: "claimed" }
    },
    async activatePendingRecoveryOtp(pendingOtp) {
      const limit = store.recoveryOtpSendLimits.get(pendingOtp.phoneNumber)
      if (!limit || limit.activeRequestId !== pendingOtp.otpId) return false
      store.pendingRecoveryOtps.set(pendingOtp.phoneNumber, { ...pendingOtp })
      return true
    },
    async verifyAndConsumePendingRecoveryOtp(input) {
      const pending = store.pendingRecoveryOtps.get(input.phoneNumber)
      if (!pending || pending.expiresAt <= input.now) {
        if (pending) store.pendingRecoveryOtps.delete(input.phoneNumber)
        return { kind: "missing_or_expired" }
      }
      if (pending.attemptCount >= input.maxAttempts) return { kind: "attempt_limit" }
      if (!input.matches(pending)) {
        const attemptCount = pending.attemptCount + 1
        store.pendingRecoveryOtps.set(input.phoneNumber, { ...pending, attemptCount })
        return attemptCount >= input.maxAttempts
          ? { kind: "attempt_limit" }
          : { kind: "invalid", attemptsRemaining: input.maxAttempts - attemptCount }
      }
      store.pendingRecoveryOtps.delete(input.phoneNumber)
      return { kind: "verified" }
    },
    async getPendingAccountDeletionOtp(accountId) {
      const pending = store.pendingAccountDeletionOtps.get(accountId)
      return pending ? { ...pending } : null
    },
    async claimAccountDeletionOtpSend(input) {
      const existing = store.accountDeletionOtpSendLimits.get(input.accountId)
      if (existing && existing.windowStartedAt + input.windowMs > input.now) {
        const cooldownRemaining = existing.lastRequestedAt + input.cooldownMs - input.now
        if (cooldownRemaining > 0) return { kind: "cooldown", retryAfterMs: cooldownRemaining }
        if (existing.requestCount >= input.maxRequests) {
          return { kind: "limit", retryAfterMs: existing.windowStartedAt + input.windowMs - input.now }
        }
      }
      const active = Boolean(existing && existing.windowStartedAt + input.windowMs > input.now)
      store.accountDeletionOtpSendLimits.set(input.accountId, {
        phoneNumber: input.accountId,
        activeRequestId: input.requestId,
        windowStartedAt: active ? existing!.windowStartedAt : input.now,
        lastRequestedAt: input.now,
        requestCount: active ? existing!.requestCount + 1 : 1
      })
      return { kind: "claimed" }
    },
    async activatePendingAccountDeletionOtp(input) {
      const limit = store.accountDeletionOtpSendLimits.get(input.accountId)
      if (!limit || limit.activeRequestId !== input.pendingOtp.otpId) return false
      store.pendingAccountDeletionOtps.set(input.accountId, { ...input.pendingOtp })
      return true
    },
    async verifyAndCreateAccountDeletionConfirmation(input) {
      const pending = store.pendingAccountDeletionOtps.get(input.accountId)
      if (!pending || pending.expiresAt <= input.now) {
        if (pending) store.pendingAccountDeletionOtps.delete(input.accountId)
        return { kind: "missing_or_expired" }
      }
      if (pending.attemptCount >= input.maxAttempts) return { kind: "attempt_limit" }
      if (!input.matches(pending)) {
        const attemptCount = pending.attemptCount + 1
        store.pendingAccountDeletionOtps.set(input.accountId, { ...pending, attemptCount })
        return attemptCount >= input.maxAttempts
          ? { kind: "attempt_limit" }
          : { kind: "invalid", attemptsRemaining: input.maxAttempts - attemptCount }
      }
      store.pendingAccountDeletionOtps.delete(input.accountId)
      store.accountDeletionConfirmations.set(input.accountId, {
        accountId: input.accountId,
        tokenDigest: input.confirmationTokenDigest,
        expiresAt: input.confirmationExpiresAt
      })
      return { kind: "verified" }
    },
    async consumeAccountDeletionConfirmation(input) {
      const confirmation = store.accountDeletionConfirmations.get(input.accountId)
      if (!confirmation || confirmation.expiresAt <= input.now || !otpDigestsMatch(confirmation.tokenDigest, input.confirmationTokenDigest)) {
        if (confirmation?.expiresAt && confirmation.expiresAt <= input.now) store.accountDeletionConfirmations.delete(input.accountId)
        return false
      }
      store.accountDeletionConfirmations.delete(input.accountId)
      return true
    },
    async claimAccountActionOtpSend(input) {
      const key = accountActionKey(input.accountId, input.purpose)
      const existing = store.accountActionOtpSendLimits.get(key)
      if (existing && existing.windowStartedAt + input.windowMs > input.now) {
        const cooldownRemaining = existing.lastRequestedAt + input.cooldownMs - input.now
        if (cooldownRemaining > 0) return { kind: "cooldown", retryAfterMs: cooldownRemaining }
        if (existing.requestCount >= input.maxRequests) {
          return { kind: "limit", retryAfterMs: existing.windowStartedAt + input.windowMs - input.now }
        }
      }
      const active = Boolean(existing && existing.windowStartedAt + input.windowMs > input.now)
      store.accountActionOtpSendLimits.set(key, {
        phoneNumber: key,
        activeRequestId: input.requestId,
        windowStartedAt: active ? existing!.windowStartedAt : input.now,
        lastRequestedAt: input.now,
        requestCount: active ? existing!.requestCount + 1 : 1
      })
      return { kind: "claimed" }
    },
    async getPendingAccountActionOtp(input) {
      const pending = store.pendingAccountActionOtps.get(accountActionKey(input.accountId, input.purpose))
      return pending ? { ...pending } : null
    },
    async activatePendingAccountActionOtp({ action }) {
      const key = accountActionKey(action.accountId, action.purpose)
      const limit = store.accountActionOtpSendLimits.get(key)
      if (!limit || limit.activeRequestId !== action.otpId) return false
      store.pendingAccountActionOtps.set(key, { ...action })
      return true
    },
    async verifyAndCreateAccountActionConfirmation(input) {
      const key = accountActionKey(input.accountId, input.purpose)
      const pending = store.pendingAccountActionOtps.get(key)
      if (!pending || pending.expiresAt <= input.now || pending.targetPhoneNumber !== input.targetPhoneNumber) {
        if (pending) store.pendingAccountActionOtps.delete(key)
        return { kind: "missing_or_expired" }
      }
      if (pending.attemptCount >= input.maxAttempts) return { kind: "attempt_limit" }
      if (!input.matches(pending)) {
        const attemptCount = pending.attemptCount + 1
        store.pendingAccountActionOtps.set(key, { ...pending, attemptCount })
        return attemptCount >= input.maxAttempts
          ? { kind: "attempt_limit" }
          : { kind: "invalid", attemptsRemaining: input.maxAttempts - attemptCount }
      }
      store.pendingAccountActionOtps.delete(key)
      store.accountActionConfirmations.set(key, {
        accountId: input.accountId,
        purpose: input.purpose,
        targetPhoneNumber: input.targetPhoneNumber,
        tokenDigest: input.confirmationTokenDigest,
        expiresAt: input.confirmationExpiresAt
      })
      return { kind: "verified" }
    },
    async consumeAccountActionConfirmation(input) {
      const key = accountActionKey(input.accountId, input.purpose)
      const confirmation = store.accountActionConfirmations.get(key)
      if (!confirmation || confirmation.expiresAt <= input.now || !otpDigestsMatch(confirmation.tokenDigest, input.confirmationTokenDigest)) {
        if (confirmation?.expiresAt && confirmation.expiresAt <= input.now) store.accountActionConfirmations.delete(key)
        return false
      }
      store.accountActionConfirmations.delete(key)
      return true
    },
    async validateAccountActionConfirmation(input) {
      const confirmation = store.accountActionConfirmations.get(accountActionKey(input.accountId, input.purpose))
      return Boolean(
        confirmation &&
        confirmation.expiresAt > input.now &&
        otpDigestsMatch(confirmation.tokenDigest, input.confirmationTokenDigest)
      )
    },
    async completePhoneChange(input) {
      const currentKey = accountActionKey(input.accountId, "phone_change_current")
      const newKey = accountActionKey(input.accountId, "phone_change_new")
      const current = store.accountActionConfirmations.get(currentKey)
      const replacement = store.accountActionConfirmations.get(newKey)
      const now = input.now.getTime()
      if (!current || !replacement || current.expiresAt <= now || replacement.expiresAt <= now ||
        !otpDigestsMatch(current.tokenDigest, input.currentPhoneConfirmationDigest) ||
        !otpDigestsMatch(replacement.tokenDigest, input.newPhoneConfirmationDigest)) {
        return { kind: "reauth_required" }
      }
      const account = [...store.accountsByPhone.values()].find((candidate) => candidate.accountId === input.accountId)
      if (!account) return { kind: "reauth_required" }
      if (store.accountsByPhone.has(replacement.targetPhoneNumber)) return { kind: "conflict" }
      const updated = { ...account, phoneNumber: replacement.targetPhoneNumber, updatedAt: input.now.toISOString() }
      store.accountsByPhone.delete(account.phoneNumber)
      store.accountsByPhone.set(updated.phoneNumber, cloneAccount(updated))
      store.accountActionConfirmations.delete(currentKey)
      store.accountActionConfirmations.delete(newKey)
      for (const [key, session] of store.sessionsByTokenHash) {
        if (session.accountId === input.accountId) store.sessionsByTokenHash.delete(key)
      }
      return { kind: "updated", account: cloneAccount(updated) }
    },
    async verifyAndConsumePendingOtp(input) {
      const pending = store.pendingOtps.get(input.phoneNumber)
      if (!pending || pending.expiresAt <= input.now) {
        if (pending) store.pendingOtps.delete(input.phoneNumber)
        return { kind: "missing_or_expired" }
      }
      if (pending.attemptCount >= input.maxAttempts) {
        return { kind: "attempt_limit" }
      }
      if (!input.matches(pending)) {
        const attemptCount = pending.attemptCount + 1
        store.pendingOtps.set(input.phoneNumber, {
          ...pending,
          attemptCount
        })
        if (attemptCount >= input.maxAttempts) {
          return { kind: "attempt_limit" }
        }
        return {
          kind: "invalid",
          attemptsRemaining: input.maxAttempts - attemptCount
        }
      }
      store.pendingOtps.delete(input.phoneNumber)
      return { kind: "verified" }
    },
    async finalizeOtpSignIn(input) {
      const pending = store.pendingOtps.get(input.phoneNumber)
      if (!pending || pending.expiresAt <= input.now) {
        if (pending) store.pendingOtps.delete(input.phoneNumber)
        return { kind: "missing_or_expired" }
      }
      if (pending.attemptCount >= input.maxAttempts) {
        return { kind: "attempt_limit" }
      }
      if (!input.matches(pending)) {
        const attemptCount = pending.attemptCount + 1
        store.pendingOtps.set(input.phoneNumber, {
          ...pending,
          attemptCount
        })
        return attemptCount >= input.maxAttempts
          ? { kind: "attempt_limit" }
          : {
              kind: "invalid",
              attemptsRemaining: input.maxAttempts - attemptCount
            }
      }
      if (input.newAccount.phoneNumber !== input.phoneNumber) {
        throw new Error("The sign-in account must match the verified phone number.")
      }

      const existingAccount = store.accountsByPhone.get(input.phoneNumber)
      if (!existingAccount && input.requireExistingAccount) return { kind: "terms_required" }
      const account = cloneAccount(existingAccount ?? input.newAccount)
      const session = input.createSession(cloneAccount(account))
      assertSessionMatchesAccount(session, account)
      if (store.sessionsByTokenHash.has(session.sessionTokenHash)) {
        throw new Error("The sign-in session token already exists.")
      }

      if (!existingAccount) {
        store.accountsByPhone.set(input.phoneNumber, cloneAccount(account))
      }
      store.sessionsByTokenHash.set(session.sessionTokenHash, { ...session })
      store.pendingOtps.delete(input.phoneNumber)
      return {
        kind: "verified",
        account: cloneAccount(account),
        session: { ...session }
      }
    },
    async getAccountByPhone(phoneNumber) {
      const account = store.accountsByPhone.get(phoneNumber)
      return account ? cloneAccount(account) : null
    },
    async findAccountById(accountId) {
      const account =
        [...store.accountsByPhone.values()].find(
          (account) => account.accountId === accountId
        ) ?? null
      return account ? cloneAccount(account) : null
    },
    async findAccountByUserId(userId) {
      const account =
        [...store.accountsByPhone.values()].find(
          (account) => account.userId === userId
        ) ?? null
      return account ? cloneAccount(account) : null
    },
    async saveAccount(account) {
      store.accountsByPhone.set(account.phoneNumber, cloneAccount(account))
    },
    async updateAccountProfile(input) {
      const account = [...store.accountsByPhone.values()].find(
        (candidate) => candidate.accountId === input.accountId
      )
      if (!account) return null
      const profile = input.profile
      if (
        Object.hasOwn(profile, "gender") &&
        profile.gender === null &&
        account.onboarding.profile === "complete"
      ) {
        return cloneAccount(account)
      }
      const updated: AccountRecord = {
        ...account,
        profile: {
          ...account.profile,
          ...(profile.displayName !== undefined
            ? { displayName: profile.displayName }
            : {}),
          ...(profile.age !== undefined ? { age: profile.age } : {}),
          ...(Object.hasOwn(profile, "bio")
            ? { bio: profile.bio ?? undefined }
            : {}),
          ...(Object.hasOwn(profile, "gender")
            ? { gender: profile.gender ?? undefined }
            : {}),
          ...(Object.hasOwn(profile, "identityGender")
            ? { identityGender: profile.identityGender ?? undefined }
            : {}),
          ...(Object.hasOwn(profile, "discoveryPreferences")
            ? {
                discoveryPreferences: profile.discoveryPreferences
                  ? {
                      ...profile.discoveryPreferences,
                      genders: [...profile.discoveryPreferences.genders],
                      vibes: [...profile.discoveryPreferences.vibes]
                    }
                  : undefined
              }
            : {}),
          ...(Object.hasOwn(profile, "interests")
            ? {
                interests: profile.interests
                  ? [...profile.interests]
                  : undefined
              }
            : {}),
          ...(Object.hasOwn(profile, "prompts")
            ? {
                prompts: profile.prompts
                  ? profile.prompts.map((prompt) => ({ ...prompt }))
                  : undefined
              }
            : {}),
          ...(Object.hasOwn(profile, "location")
            ? {
                location: profile.location
                  ? { ...profile.location }
                  : undefined
              }
            : {}),
          avatar: cloneAvatarSelection(toCompleteAvatarSelection(account.profile.avatar))
        },
        updatedAt: input.now.toISOString()
      }
      store.accountsByPhone.set(account.phoneNumber, cloneAccount(updated))
      return cloneAccount(updated)
    },
    async updateAvatarSelection(input) {
      const account = [...store.accountsByPhone.values()].find(
        (candidate) => candidate.accountId === input.accountId
      )
      if (!account) return { kind: "missing" }

      const current = toCompleteAvatarSelection(account.profile.avatar)
      if (current.revision !== input.expectedRevision) {
        return { kind: "conflict", current: cloneAvatarSelection(current) }
      }

      const nextSelection: CompleteAvatarSelection = {
        presetId: input.selection.presetId,
        revision: input.expectedRevision + 1,
        loadout: {
          ...input.selection.loadout,
          accessoryIds: [...input.selection.loadout.accessoryIds]
        }
      }
      const updated: AccountRecord = {
        ...account,
        profile: {
          ...account.profile,
          avatar: nextSelection
        },
        updatedAt: input.now.toISOString()
      }
      store.accountsByPhone.set(account.phoneNumber, cloneAccount(updated))
      return { kind: "updated", account: cloneAccount(updated) }
    },
    async completeOnboardingStep(input) {
      const account = [...store.accountsByPhone.values()].find(
        (candidate) => candidate.accountId === input.accountId
      )
      if (!account) return null
      if (input.step === "profile" && !isProfileOnboardingReady(account)) {
        return cloneAccount(account)
      }
      const nextOnboarding = {
        ...account.onboarding,
        [input.step]: "complete" as const
      }
      const allComplete =
        nextOnboarding.profile === "complete" &&
        nextOnboarding.avatar === "complete" &&
        nextOnboarding.room === "complete"
      const updated: AccountRecord = {
        ...account,
        onboarding: {
          ...nextOnboarding,
          completedAt: allComplete
            ? account.onboarding.completedAt ?? input.now.toISOString()
            : undefined
        },
        updatedAt: input.now.toISOString()
      }
      store.accountsByPhone.set(account.phoneNumber, cloneAccount(updated))
      return cloneAccount(updated)
    },
    async getSessionByTokenHash(sessionTokenHash) {
      return store.sessionsByTokenHash.get(sessionTokenHash) ?? null
    },
    async hasActiveSessionFamily(input) {
      return [...store.sessionsByTokenHash.values()].some((session) =>
        session.userId === input.userId && session.sessionId === input.sessionFamilyId &&
        Date.parse(session.expiresAt) > input.now.getTime())
    },
    async saveSession(session) {
      store.sessionsByTokenHash.set(session.sessionTokenHash, { ...session })
    },
    async deleteSession(sessionTokenHash) {
      const target = store.sessionsByTokenHash.get(sessionTokenHash)
      if (!target) return
      for (const [tokenHash, session] of store.sessionsByTokenHash.entries()) {
        if (session.sessionId === target.sessionId) {
          store.sessionsByTokenHash.delete(tokenHash)
        }
      }
    },
    async acknowledgeModeration(input) {
      const account = [...store.accountsByPhone.values()].find(
        (candidate) => candidate.accountId === input.accountId
      )
      if (!account) return null
      const updated = account.moderation?.status === "warned"
        ? {
            ...account,
            moderation: { status: "active" as const, updatedAt: input.now.toISOString() },
            updatedAt: input.now.toISOString()
          }
        : account
      store.accountsByPhone.set(updated.phoneNumber, cloneAccount(updated))
      return cloneAccount(updated)
    },
    async clearExpiredSuspension(input) {
      const account = [...store.accountsByPhone.values()].find(
        (candidate) => candidate.accountId === input.accountId
      )
      if (!account) return null
      const moderation = account.moderation
      const expired =
        moderation?.status === "suspended" &&
        moderation.suspendedUntil &&
        Date.parse(moderation.suspendedUntil) <= input.now.getTime()
      const updated = expired
        ? {
            ...account,
            moderation: { status: "active" as const, updatedAt: input.now.toISOString() },
            updatedAt: input.now.toISOString()
          }
        : account
      if (updated !== account) {
        store.accountsByPhone.set(updated.phoneNumber, cloneAccount(updated))
      }
      return cloneAccount(updated)
    },
    async rotateSession(input) {
      const current = store.sessionsByTokenHash.get(input.currentSessionTokenHash)
      if (!current || new Date(current.expiresAt).getTime() <= input.now.getTime()) {
        return false
      }
      store.sessionsByTokenHash.set(input.currentSessionTokenHash, {
        ...current,
        expiresAt: input.now.toISOString()
      })
      store.sessionsByTokenHash.set(
        input.nextSession.sessionTokenHash,
        { ...input.nextSession, sessionId: current.sessionId }
      )
      return true
    },
    async deleteAccountData(account, confirmation) {
      if (confirmation) {
        const pending = store.accountDeletionConfirmations.get(account.accountId)
        if (
          !pending ||
          pending.expiresAt <= confirmation.now ||
          !otpDigestsMatch(
            pending.tokenDigest,
            confirmation.confirmationTokenDigest
          )
        ) {
          return false
        }
      }
      store.pendingOtps.delete(account.phoneNumber)
      store.otpSendLimits.delete(account.phoneNumber)
      store.pendingAccountDeletionOtps.delete(account.accountId)
      store.accountDeletionOtpSendLimits.delete(account.accountId)
      store.accountDeletionConfirmations.delete(account.accountId)
      store.accountsByPhone.delete(account.phoneNumber)
      for (const [tokenHash, session] of store.sessionsByTokenHash.entries()) {
        if (session.accountId === account.accountId) {
          store.sessionsByTokenHash.delete(tokenHash)
        }
      }
      return true
    }
  }
}

function accountActionKey(accountId: string, purpose: AccountActionPurpose): string {
  return `${accountId}:${purpose}`
}

function assertSessionMatchesAccount(
  session: SessionRecord,
  account: AccountRecord
): void {
  if (
    session.accountId !== account.accountId ||
    session.userId !== account.userId
  ) {
    throw new Error("The sign-in session must belong to the canonical account.")
  }
}

function cloneAccount(account: AccountRecord): AccountRecord {
  return {
    ...account,
    onboarding: { ...account.onboarding },
    ...(account.moderation ? { moderation: { ...account.moderation } } : {}),
    profile: {
      ...account.profile,
      interests: account.profile.interests
        ? [...account.profile.interests]
        : undefined,
      prompts: normalizeUserProfilePrompts(account.profile.prompts),
      location: account.profile.location
        ? { ...account.profile.location }
        : undefined,
      discoveryPreferences: account.profile.discoveryPreferences
        ? {
            ...account.profile.discoveryPreferences,
            genders: [...account.profile.discoveryPreferences.genders],
            vibes: [...account.profile.discoveryPreferences.vibes]
          }
        : undefined,
      avatar: {
        ...account.profile.avatar,
        ...(account.profile.avatar.loadout
          ? {
              loadout: {
                ...account.profile.avatar.loadout,
                accessoryIds: [
                  ...account.profile.avatar.loadout.accessoryIds
                ]
              }
            }
          : {})
      }
    }
  }
}

function toCompleteAvatarSelection(
  selection: UserProfile["avatar"]
): CompleteAvatarSelection {
  if (selection.loadout && typeof selection.revision === "number") {
    return cloneAvatarSelection({
      presetId: selection.presetId,
      loadout: selection.loadout,
      revision: selection.revision
    })
  }
  return createDefaultAvatarSelection(selection.presetId, selection.revision ?? 0)
}

function cloneAvatarSelection(
  selection: CompleteAvatarSelection
): CompleteAvatarSelection {
  return {
    ...selection,
    loadout: {
      ...selection.loadout,
      accessoryIds: [...selection.loadout.accessoryIds]
    }
  }
}
