import type { AvatarSelection, ChatParticipantSummary, ChatThread, ServerEvent } from "@blumi/contracts"
import type { SessionActor } from "../session/sessionModel"
import { parseDiscoveryMatchId } from "../matches/discoveryMatchDelivery"
import type { SavedConnection } from "./savedConnectionsStore"

export type ConnectionMatchedPayload = Extract<
  ServerEvent,
  { type: "connection.matched" }
>["payload"]

export interface GlobalMatchReconciliationDependencies {
  getCurrentSessionActor: () => SessionActor | null
  recordMutualConnection: (input: {
    ownerUserId: string
    currentUserId: string
    participantUserIds: readonly [string, string]
  }) => Promise<SavedConnection | undefined>
  hydrateFromServer: (sessionToken: string) => Promise<unknown>
  createThread: (
    baseHttpUrl: string,
    sessionToken: string,
    input: { participantUserIds: [string, string] }
  ) => Promise<ChatThread>
  applyChatThreadCreated: (thread: ChatThread) => void
  presentMatch: (match: {
    miniRoomId: string
    matchedUserId: string
    matchedUserName: string
    matchedAvatarSelection?: AvatarSelection
    mode: SessionActor["session"]["mode"]
  }) => void
  httpBaseUrl: string
  /** How long the modal waits for the chat's partner avatar; tests shorten it. */
  threadWaitMs?: number
}

/** Long enough for a normal chat open, short enough not to delay the moment. */
const MATCH_THREAD_WAIT_MS = 1_500

export function isSameAuthenticatedSession(
  expected: SessionActor,
  current: SessionActor | null
): boolean {
  return current?.profile.userId === expected.profile.userId &&
    current.session.sessionId === expected.session.sessionId &&
    current.session.sessionToken === expected.session.sessionToken
}

export async function reconcileRealtimeConnectionMatch(
  payload: ConnectionMatchedPayload,
  expectedActor: SessionActor,
  dependencies: GlobalMatchReconciliationDependencies
): Promise<void> {
  if (!isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
    return
  }

  const connection = await dependencies.recordMutualConnection({
    ownerUserId: expectedActor.profile.userId,
    currentUserId: expectedActor.profile.userId,
    participantUserIds: payload.participantUserIds
  })
  if (
    !connection ||
    !isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())
  ) {
    return
  }

  let partner: ChatParticipantSummary | undefined
  if (expectedActor.session.mode === "production") {
    void dependencies
      .hydrateFromServer(expectedActor.session.sessionToken)
      .catch(() => undefined)
    // The opened chat carries the partner's server name and real avatar, so
    // the modal shows the partner's chibi instead of a hash-derived outfit
    // (UX audit DSC-3). A failed or slow open still presents the match; a
    // late chat is applied when it arrives.
    const thread = await openMatchThreadWithin(payload, expectedActor, dependencies)
    if (thread) partner = findThreadPartner(thread, expectedActor.profile.userId)
  }

  if (!isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
    return
  }

  dependencies.presentMatch({
    miniRoomId: payload.miniRoomId,
    matchedUserId: connection.userId,
    matchedUserName: partner?.displayName || connection.displayName,
    ...(partner?.avatar ? { matchedAvatarSelection: partner.avatar } : {}),
    mode: expectedActor.session.mode
  })
}

type MatchThreadDependencies = Pick<
  GlobalMatchReconciliationDependencies,
  "getCurrentSessionActor" | "createThread" | "applyChatThreadCreated" | "httpBaseUrl" | "threadWaitMs"
>

/** Opens (or fetches) the pair's chat, waiting at most `threadWaitMs`. */
async function openMatchThreadWithin(
  payload: ConnectionMatchedPayload,
  expectedActor: SessionActor,
  dependencies: MatchThreadDependencies
): Promise<ChatThread | null> {
  const participantUserIds = [...payload.participantUserIds] as [string, string]
  const threadRequest = dependencies
    .createThread(
      dependencies.httpBaseUrl,
      expectedActor.session.sessionToken,
      { participantUserIds }
    )
    .then((thread) => {
      if (isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
        dependencies.applyChatThreadCreated(thread)
      }
      return thread
    })
    .catch(() => null)
  let waitTimer: ReturnType<typeof setTimeout> | undefined
  const thread = await Promise.race([
    threadRequest,
    new Promise<null>((resolve) => {
      waitTimer = setTimeout(() => resolve(null), dependencies.threadWaitMs ?? MATCH_THREAD_WAIT_MS)
    })
  ])
  clearTimeout(waitTimer)
  return thread
}

export interface DiscoveryMatchReconciliationDependencies extends MatchThreadDependencies {
  /** The pair's chat already on this phone (the server announces it first). */
  findThreadForPartner: (partnerUserId: string) => ChatThread | undefined
  /** Claims the foreground alert key so the match push banner stays quiet. */
  claimMatchAlert: (key: string) => void
  presentMatch: (match: {
    miniRoomId: string
    matchedUserId: string
    matchedUserName: string
    matchedAvatarSelection?: AvatarSelection
    mode: SessionActor["session"]["mode"]
    source: "discovery"
  }) => void
}

/**
 * The partner's side of a Discover match (`connection.matched` keyed
 * `match_<matchId>`). Unlike a room connection it records no saved
 * connection: the name and chibi come from the pair's chat, which the server
 * announces just before. Without a name the moment is not shown (never an
 * id); the chat and the push still carry the match.
 */
export async function reconcileRealtimeDiscoveryMatch(
  payload: ConnectionMatchedPayload,
  expectedActor: SessionActor,
  dependencies: DiscoveryMatchReconciliationDependencies
): Promise<void> {
  const isCurrent = () => isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())
  if (!isCurrent()) return
  const matchId = parseDiscoveryMatchId(payload.miniRoomId)
  const partnerUserId = payload.participantUserIds.find((userId) => userId !== expectedActor.profile.userId)
  if (!matchId || !partnerUserId) return
  const thread = dependencies.findThreadForPartner(partnerUserId) ??
    (expectedActor.session.mode === "production"
      ? await openMatchThreadWithin(payload, expectedActor, dependencies)
      : null)
  const partner = thread ? findThreadPartner(thread, expectedActor.profile.userId) : undefined
  if (!partner?.displayName || !isCurrent()) return
  dependencies.claimMatchAlert(`match:${matchId}`)
  dependencies.presentMatch({
    miniRoomId: payload.miniRoomId,
    matchedUserId: partnerUserId,
    matchedUserName: partner.displayName,
    ...(partner.avatar ? { matchedAvatarSelection: partner.avatar } : {}),
    mode: expectedActor.session.mode,
    source: "discovery"
  })
}

/** The other participant of a chat, with the server's name and avatar. */
export function findThreadPartner(
  thread: ChatThread,
  currentUserId: string
): ChatParticipantSummary | undefined {
  return thread.participants.find((participant) => participant.userId !== currentUserId)
}
