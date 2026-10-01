import type { AuthRepository } from "./authRepository"

export interface RealtimeSessionIdentity {
  userId: string
  sessionFamilyId: string
}

export interface RealtimeSessionDecision {
  allowed: boolean
  /** The family's latest token expiry; set when allowed. */
  expiresAt?: string
}

/**
 * The realtime session check for many sockets in two queries (2026-10-01):
 * the active session families, then their accounts. Answers are in input
 * order and match `isRealtimeSessionAllowed`; an expired suspension falls
 * back to the single check, which restores the account.
 */
export async function checkRealtimeSessions(input: {
  repository: Pick<AuthRepository, "listActiveSessionFamilies" | "findAccountsByUserIds">
  isRealtimeUserAllowed: (userId: string) => Promise<boolean>
  identities: readonly RealtimeSessionIdentity[]
  now: Date
}): Promise<RealtimeSessionDecision[]> {
  const { repository, identities, now } = input
  if (identities.length === 0) return []
  const familyKey = (identity: RealtimeSessionIdentity) => `${identity.userId}\u0000${identity.sessionFamilyId}`
  const active = new Map((await repository.listActiveSessionFamilies({ identities, now }))
    .map((family) => [familyKey(family), family.expiresAt]))
  const userIds = [...new Set(identities.filter((identity) => active.has(familyKey(identity)))
    .map((identity) => identity.userId))]
  const accounts = new Map((await repository.findAccountsByUserIds(userIds))
    .map((account) => [account.userId, account]))
  const denied: RealtimeSessionDecision = { allowed: false }
  return Promise.all(identities.map(async (identity) => {
    const expiresAt = active.get(familyKey(identity))
    if (!expiresAt) return denied
    const moderation = accounts.get(identity.userId)?.moderation
    if (!accounts.has(identity.userId) || moderation?.status === "banned") return denied
    if (moderation?.status === "suspended") {
      const expired = moderation.suspendedUntil !== undefined &&
        Date.parse(moderation.suspendedUntil) <= now.getTime()
      if (!expired || !await input.isRealtimeUserAllowed(identity.userId)) return denied
    }
    return { allowed: true, expiresAt }
  }))
}
