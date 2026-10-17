import type { AuthRepository } from "./authRepository"

/**
 * `isRealtimeUserAllowed` for many accounts in one query: deleted, banned
 * and suspended accounts are left out. Only an expired suspension falls back
 * to the single check, which restores the account.
 */
export async function listAllowedRealtimeUserIds(input: {
  repository: Pick<AuthRepository, "findAccountsByUserIds">
  isRealtimeUserAllowed: (userId: string) => Promise<boolean>
  userIds: readonly string[]
  now: Date
}): Promise<ReadonlySet<string>> {
  const { repository, userIds, now } = input
  if (userIds.length === 0) return new Set()
  const accounts = await repository.findAccountsByUserIds([...new Set(userIds)])
  const decisions = await Promise.all(accounts.map(async (account) => {
    const moderation = account.moderation
    if (moderation?.status === "banned") return null
    if (moderation?.status !== "suspended") return account.userId
    const expired = moderation.suspendedUntil !== undefined && Date.parse(moderation.suspendedUntil) <= now.getTime()
    return expired && await input.isRealtimeUserAllowed(account.userId) ? account.userId : null
  }))
  return new Set(decisions.filter((userId): userId is string => userId !== null))
}
