import type { MiniRoomInviteRecord } from "./miniRoomRepository"

/**
 * Everything GET /v1/threads/:threadId/room-invites needs, in one read.
 *
 * Before: thread (2 statements), block, match and connection, partner
 * account and moderation, the thread again inside listChatInvites (2), the
 * invites and the test-persona lookup, about nine sequential round trips.
 * The PostgreSQL implementation (db/postgresThreadRoomInviteRead.ts) answers
 * in one statement; the composed one below reads the same facts from the
 * in-memory repositories. Both pass threadRoomInviteRead.contract.test.ts.
 */
export type ThreadRoomInviteRead =
  /** Missing, not the caller's, or hidden by a block in either direction (404). */
  | { status: "hidden" }
  /** Visible, but no longer authorizes invites: no match or connection, partner gone or restricted (403). */
  | { status: "forbidden" }
  | { status: "invalid_cursor" | "invite_missing" }
  | {
      status: "ok"
      partnerUserId: string
      /** The partner is a seeded test persona (the route still applies the deployment policy). */
      partnerIsTestPersona: boolean
      /** Pending invites past their expiry are returned (and stored) as expired. */
      invites: MiniRoomInviteRecord[]
      /** Present only for explicit paging or an exact lookup. */
      nextCursor?: string | null
      activeInvites?: MiniRoomInviteRecord[]
    }

export interface ThreadRoomInviteReader {
  readThreadRoomInvites(input: { threadId: string; userId: string; now?: Date; limit?: number; before?: string; inviteId?: string }): Promise<ThreadRoomInviteRead>
}

type InviteReadOptions = { limit?: number; before?: string; inviteId?: string }
type InviteHistoryPage = Pick<Extract<ThreadRoomInviteRead, { status: "ok" }>, "invites" | "nextCursor" | "activeInvites">

/** Stable exclusive keyset order; active context never changes the history cursor. */
export function selectThreadRoomInvitePage(invites: readonly MiniRoomInviteRecord[], options: InviteReadOptions):
  InviteHistoryPage | { status: "invalid_cursor" | "invite_missing" } {
  const sorted = [...invites].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.inviteId.localeCompare(b.inviteId))
  if (options.inviteId) {
    const target = sorted.find(invite => invite.inviteId === options.inviteId)
    return target ? { invites: [target], nextCursor: null, activeInvites: [] } : { status: "invite_missing" }
  }
  if (options.limit === undefined && !options.before) return { invites: sorted }
  const limit = options.limit ?? 20
  const beforeIndex = options.before ? sorted.findIndex(invite => invite.inviteId === options.before) : sorted.length
  if (beforeIndex < 0) return { status: "invalid_cursor" }
  const candidates = sorted.slice(0, beforeIndex)
  const page = candidates.slice(-limit)
  const pageIds = new Set(page.map(invite => invite.inviteId))
  const activeInvites = sorted.filter(invite => !pageIds.has(invite.inviteId) &&
    (invite.status === "pending" || (invite.status === "accepted" && Boolean(invite.roomSessionId))))
  // The persisted rules permit one pending invite per thread and one live
  // shared room per participant. Do not silently omit actions if those fail.
  if (activeInvites.length > 2) throw new Error("Room invitation state could not be confirmed.")
  return { invites: page, nextCursor: candidates.length > limit ? page[0]!.inviteId : null, activeInvites }
}

/** The facts both implementations gather; the decision is shared. */
export interface ThreadRoomInviteFacts {
  threadId: string
  miniRoomId: string
  isMember: boolean
  partnerUserId: string | null
  blocked: boolean
  matchId: string | null
  connectionMiniRoomId: string | null
  partnerAllowed: boolean
}

export function decideThreadRoomInviteAccess(facts: ThreadRoomInviteFacts | null): "hidden" | "forbidden" | "ok" {
  if (!facts || !facts.isMember) return "hidden"
  if (!facts.partnerUserId) return "forbidden"
  if (facts.blocked) return "hidden"
  const authorized =
    (facts.matchId !== null &&
      facts.threadId === `thread_match_${facts.matchId}` &&
      facts.miniRoomId === `match_${facts.matchId}`) ||
    (facts.connectionMiniRoomId !== null &&
      facts.threadId === `thread_connection_${facts.connectionMiniRoomId}` &&
      facts.miniRoomId === facts.connectionMiniRoomId)
  if (!authorized) return "forbidden"
  return facts.partnerAllowed ? "ok" : "forbidden"
}

export interface ThreadRoomInviteSources {
  findThread(threadId: string): Promise<{ threadId: string; miniRoomId: string; participantUserIds: readonly string[] } | null>
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
  findMatchBetween(userAId: string, userBId: string): Promise<{ matchId: string } | null>
  findConnectionBetween(userAId: string, userBId: string): Promise<{ miniRoomId: string } | null>
  /** The account exists and is neither banned nor (still) suspended. */
  isUserAllowed(userId: string, now: Date): Promise<boolean>
  isTestPersona(userId: string): Promise<boolean>
  listInvitesForThread(threadId: string, now: Date): Promise<MiniRoomInviteRecord[]>
}

/** The same read composed from repository calls (in-memory storage, and fallbacks). */
export function createComposedThreadRoomInviteReader(sources: ThreadRoomInviteSources): ThreadRoomInviteReader {
  return {
    async readThreadRoomInvites({ threadId, userId, now = new Date(), ...options }) {
      const thread = await sources.findThread(threadId)
      const isMember = Boolean(thread?.participantUserIds.includes(userId))
      if (!thread || !isMember) return { status: "hidden" }
      const partnerUserId = thread.participantUserIds.find((candidate) => candidate !== userId) ?? null
      if (!partnerUserId) return { status: "forbidden" }
      if (await sources.hasBlockBetween(userId, partnerUserId)) return { status: "hidden" }
      const [match, connection, partnerAllowed] = await Promise.all([
        sources.findMatchBetween(userId, partnerUserId),
        sources.findConnectionBetween(userId, partnerUserId),
        sources.isUserAllowed(partnerUserId, now)
      ])
      const decision = decideThreadRoomInviteAccess({
        threadId: thread.threadId,
        miniRoomId: thread.miniRoomId,
        isMember,
        partnerUserId,
        blocked: false,
        matchId: match?.matchId ?? null,
        connectionMiniRoomId: connection?.miniRoomId ?? null,
        partnerAllowed
      })
      if (decision !== "ok") return { status: decision }
      const [invites, partnerIsTestPersona] = await Promise.all([
        sources.listInvitesForThread(threadId, now),
        sources.isTestPersona(partnerUserId)
      ])
      const page = selectThreadRoomInvitePage(invites, options)
      if ("status" in page) return page
      return { status: "ok", partnerUserId, partnerIsTestPersona, ...page }
    }
  }
}

/** Moderation as the realtime gate reads it, without its expired-suspension write. */
export function isModerationAllowed(
  moderation: { status: string; suspendedUntil?: string } | undefined,
  now: Date
): boolean {
  if (!moderation) return true
  if (moderation.status === "banned") return false
  if (moderation.status !== "suspended") return true
  return Boolean(moderation.suspendedUntil) && Date.parse(moderation.suspendedUntil!) <= now.getTime()
}
