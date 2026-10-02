import type { AuthRepository } from "./authRepository"
import type { AccountRecord, SessionRecord } from "./authStore"
import type { RealtimeAccessRevocation } from "./realtimeAccessRevocation"

/**
 * In-process cache of resolved bearer sessions (session + account), so an
 * authenticated request does not pay a PostgreSQL round trip (~35 ms through
 * the Supabase pooler) just to learn who is calling.
 *
 * Correctness comes from invalidation, not from the TTL:
 * - every write through the auth repository on this instance that can
 *   change a session or an account drops the affected entries before and
 *   after the write: that account's entries when the write names one
 *   (profile, onboarding, avatar, moderation acknowledgement, suspension
 *   expiry, refresh rotation), otherwise every entry (sign-out, account
 *   deletion, phone change, sign-in). An answer read while any such write
 *   was in flight is never stored;
 * - access revocations (auth and safety/moderation, local or forwarded from
 *   another instance over the realtime fanout control channel) drop the
 *   affected user's entries, or all entries;
 * - a cached answer is re-checked against the request's clock (expiry,
 *   rotation, suspension end) on every hit.
 *
 * The TTL only bounds changes this instance cannot see: a write made by
 * another replica that announces no revocation (a profile edit), or a manual
 * database edit. Railway runs one replica today; with several, profile and
 * onboarding reads may lag by up to the TTL, while bans, suspensions and
 * sign-outs still propagate at once through the fanout control channel.
 */
export const SESSION_CACHE_TTL_MS = 15_000
export const SESSION_CACHE_MAX_ENTRIES = 20_000

export interface ResolvedSession { account: AccountRecord; session: SessionRecord }

export interface SessionCache {
  get(sessionTokenHash: string): ResolvedSession | undefined
  /** Changes on every invalidation; pass the value read before the database read. */
  epoch(): number
  remember(sessionTokenHash: string, resolved: ResolvedSession, epochAtRead: number): void
  invalidate(revocation: RealtimeAccessRevocation): void
  /** Drops the entries of one account (a write that names its account). */
  invalidateAccount(accountId: string): void
  size(): number
}

export function createSessionCache(options: {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
} = {}): SessionCache {
  const ttlMs = options.ttlMs ?? SESSION_CACHE_TTL_MS
  const maxEntries = options.maxEntries ?? SESSION_CACHE_MAX_ENTRIES
  const now = options.now ?? Date.now
  const entries = new Map<string, { resolved: ResolvedSession; expiresAt: number }>()
  let mutations = 0
  return {
    get(sessionTokenHash) {
      const entry = entries.get(sessionTokenHash)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(sessionTokenHash)
        return undefined
      }
      return cloneResolved(entry.resolved)
    },
    epoch: () => mutations,
    remember(sessionTokenHash, resolved, epochAtRead) {
      if (ttlMs <= 0 || epochAtRead !== mutations) return
      entries.delete(sessionTokenHash)
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(sessionTokenHash, { resolved: cloneResolved(resolved), expiresAt: now() + ttlMs })
    },
    invalidate(revocation) {
      mutations += 1
      if (revocation.kind === "all") {
        entries.clear()
        return
      }
      for (const [key, entry] of entries) {
        if (entry.resolved.account.userId === revocation.userId || entry.resolved.session.userId === revocation.userId) {
          entries.delete(key)
        }
      }
    },
    invalidateAccount(accountId) {
      mutations += 1
      for (const [key, entry] of entries) {
        if (entry.resolved.account.accountId === accountId || entry.resolved.session.accountId === accountId) {
          entries.delete(key)
        }
      }
    },
    size: () => entries.size
  }
}

/** Read-only repository methods. */
const READ_ONLY_METHOD = /^(get|find|list|has|is)[A-Z]/

/**
 * Writes that touch neither sessions nor accounts: OTP, challenge and
 * confirmation tables and the Firebase deletion queue (2026-10-02). They
 * used to empty the whole cache, so sign-in and OTP bursts kept the hit rate
 * near zero. Listed by name: a method added later invalidates by default.
 */
const NON_SESSION_WRITES: ReadonlySet<keyof AuthRepository> = new Set<keyof AuthRepository>([
  "saveFirebaseActionChallenge", "consumeFirebaseActionChallenge",
  "claimOtpSend", "activatePendingOtp", "verifyAndConsumePendingOtp",
  "claimRecoveryOtpSend", "activatePendingRecoveryOtp", "verifyAndConsumePendingRecoveryOtp",
  "claimAccountDeletionOtpSend", "activatePendingAccountDeletionOtp",
  "createAccountDeletionConfirmation", "verifyAndCreateAccountDeletionConfirmation", "consumeAccountDeletionConfirmation",
  "claimAccountActionOtpSend", "activatePendingAccountActionOtp", "createAccountActionConfirmation",
  "verifyAndCreateAccountActionConfirmation", "validateAccountActionConfirmation", "consumeAccountActionConfirmation",
  "completeFirebaseUserDeletion", "retryFirebaseUserDeletion"
])

/**
 * Writes that change only the account their input names, so only that
 * account's entries are dropped. Everything else drops every entry.
 */
const ACCOUNT_SCOPED_WRITES: Readonly<Partial<Record<keyof AuthRepository, (input: unknown) => unknown>>> = {
  updateAccountProfile: (input) => readAccountId(input),
  updateAvatarSelection: (input) => readAccountId(input),
  completeOnboardingStep: (input) => readAccountId(input),
  acknowledgeModeration: (input) => readAccountId(input),
  clearExpiredSuspension: (input) => readAccountId(input),
  // A refresh, or a detected reuse that deletes the family, stays in one account.
  rotateSession: (input) => readAccountId((input as { nextSession?: unknown } | null)?.nextSession)
}

function readAccountId(input: unknown): unknown {
  return typeof input === "object" && input !== null ? (input as { accountId?: unknown }).accountId : undefined
}

export function withSessionCacheInvalidation(repository: AuthRepository, cache: SessionCache): AuthRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== "function" || typeof property !== "string" || READ_ONLY_METHOD.test(property) ||
        NON_SESSION_WRITES.has(property as keyof AuthRepository)) {
        return typeof value === "function" ? value.bind(target) : value
      }
      return async (...args: unknown[]) => {
        const accountId = ACCOUNT_SCOPED_WRITES[property as keyof AuthRepository]?.(args[0])
        const invalidate = typeof accountId === "string" && accountId
          ? () => cache.invalidateAccount(accountId)
          : () => cache.invalidate({ kind: "all" })
        invalidate()
        try {
          return await (value as (...input: unknown[]) => unknown).apply(target, args)
        } finally {
          invalidate()
        }
      }
    }
  })
}

function cloneResolved(resolved: ResolvedSession): ResolvedSession {
  return structuredClone(resolved)
}
