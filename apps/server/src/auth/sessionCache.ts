import type { AuthRepository } from "./authRepository"
import type { AccountRecord, SessionRecord } from "./authStore"
import type { RealtimeAccessRevocation } from "./realtimeAccessRevocation"

/**
 * In-process cache of resolved bearer sessions (session + account), so an
 * authenticated request does not pay a PostgreSQL round trip (~35 ms through
 * the Supabase pooler) just to learn who is calling.
 *
 * Correctness comes from invalidation, not from the TTL:
 * - every write through the auth repository on this instance (sign-out,
 *   refresh rotation, account deletion, phone change, profile, onboarding,
 *   avatar, moderation acknowledgement, suspension expiry) drops every entry
 *   before and after the write, and an answer read while a write was in
 *   flight is never stored;
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
    size: () => entries.size
  }
}

/**
 * Read-only repository methods. Every other method may change a session or
 * an account, so calling it invalidates the whole cache (writes are rare
 * next to authenticated reads; a precise per-user mapping would have to be
 * kept in step with every new repository method).
 */
const READ_ONLY_METHOD = /^(get|find|list|has|is)[A-Z]/

export function withSessionCacheInvalidation(repository: AuthRepository, cache: SessionCache): AuthRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== "function" || typeof property !== "string" || READ_ONLY_METHOD.test(property)) {
        return typeof value === "function" ? value.bind(target) : value
      }
      return async (...args: unknown[]) => {
        cache.invalidate({ kind: "all" })
        try {
          return await (value as (...input: unknown[]) => unknown).apply(target, args)
        } finally {
          cache.invalidate({ kind: "all" })
        }
      }
    }
  })
}

function cloneResolved(resolved: ResolvedSession): ResolvedSession {
  return structuredClone(resolved)
}
