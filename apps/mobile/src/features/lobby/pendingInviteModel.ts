import type { PendingInviteMemory } from "./pendingInvitesStore"

// Legacy (non-production) lobby invites: outgoing invites are optimistic
// locally, then cleared by server decisions or this TTL.
export const PENDING_INVITE_TTL_MS = 30_000

export function filterUnexpiredPendingInvites(
  invites: readonly PendingInviteMemory[],
  now: number,
  ttlMs: number = PENDING_INVITE_TTL_MS
): PendingInviteMemory[] {
  return invites.filter((invite) => now - invite.sentAt < ttlMs)
}

// Delay until the next invite expires, never shorter than one frame.
export function resolveNextPendingInviteExpiryDelay(
  invites: readonly PendingInviteMemory[],
  now: number,
  ttlMs: number = PENDING_INVITE_TTL_MS
): number {
  const nextExpiry = Math.min(
    ...invites.map((invite) => invite.sentAt + ttlMs)
  )
  return Math.max(16, nextExpiry - now + 16)
}

export function resolvePendingInviteRemainingSeconds(
  invites: readonly PendingInviteMemory[],
  now: number,
  ttlMs: number = PENDING_INVITE_TTL_MS
): number {
  if (invites.length === 0) return 0
  const remainingMs = Math.min(
    ...invites.map((invite) => ttlMs - (now - invite.sentAt))
  )
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

export function resolvePendingInviteStripTitle(
  invites: readonly PendingInviteMemory[]
): string {
  const pendingInviteCount = invites.length
  const pendingInviteNames = invites
    .slice(0, 2)
    .map((invite) => invite.displayName.split(" ")[0])
    .join(", ")
  return pendingInviteCount === 1
    ? `${pendingInviteNames} has your room invite`
    : `${pendingInviteCount} room invites are out`
}

export function mergeRestoredPendingInvites(
  restored: readonly PendingInviteMemory[],
  current: readonly PendingInviteMemory[]
): PendingInviteMemory[] {
  const restoredUserIds = new Set(restored.map((invite) => invite.userId))
  return [
    ...restored,
    ...current.filter((invite) => !restoredUserIds.has(invite.userId))
  ]
}

export function upsertPendingInvite(
  current: readonly PendingInviteMemory[],
  invite: PendingInviteMemory
): PendingInviteMemory[] {
  const withoutDuplicate = current.filter(
    (entry) => entry.userId !== invite.userId
  )
  return [...withoutDuplicate, invite]
}
