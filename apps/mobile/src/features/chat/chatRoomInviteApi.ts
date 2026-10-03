import type {
  MediaSessionToken,
  MiniRoom,
  MiniRoomParticipant
} from "@blumi/contracts"
import { sharedRoomDecorSnapshotSchema } from "@blumi/contracts"
import { requestJson } from "../network/apiClient"
import { CHAT_INITIAL_HISTORY_LIMIT } from "./chatHistoryPolicy"
import type {
  ChatRoomInviteStatus,
  ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"

export type RoomInviteDecision = "accepted" | "declined"

export class RoomInviteApiError extends Error {
  constructor(
    message: string,
    readonly code: "SELF_IN_ROOM" | "PARTICIPANT_BUSY" | null,
    readonly status: number,
    readonly roomSessionId: string | null = null
  ) {
    super(message)
    this.name = "RoomInviteApiError"
  }
}

export interface RoomLeaveResult {
  ended: boolean
}

export class RoomSessionJoinError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number) {
    super(message)
    this.name = "RoomSessionJoinError"
  }
}

/** A leave the server answered without closing; the status decides what happens next. */
export class RoomSessionLeaveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "RoomSessionLeaveError"
  }
}

export function isDefinitivelyUnavailableRoomSession(error: unknown): boolean {
  return error instanceof RoomSessionJoinError && (
    error.status === 403 ||
    error.status === 404 ||
    (error.status === 409 && error.code === "INVITE_NOT_AVAILABLE")
  )
}

export interface RoomSessionJoinResult {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
  participants: [MiniRoomParticipant, MiniRoomParticipant]
}

interface RoomInviteRecord {
  inviteId: string
  roomSessionId?: string
  senderUserId: string
  recipientUserId: string
  sourceThreadId: string
  status: ChatRoomInviteStatus
  createdAt: string
  expiresAt?: string
  decidedAt?: string
}

export async function fetchThreadRoomInvites(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem[]> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/room-invites`,
    { headers: createAuthHeaders(sessionToken), signal },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not load that room invitation."))
  }
  return normalizeInviteListPayload(payload, threadId)
}

export interface FetchRoomInvitePageOptions { before?: string; inviteId?: string; limit?: number }
export interface ChatRoomInvitePage {
  invites: ChatRoomInviteTimelineItem[]
  activeInvites: ChatRoomInviteTimelineItem[]
  nextCursor: string | null
  /** Older deployed servers ignore the query; never infer bounded wire traffic. */
  paged: boolean
}

export async function fetchThreadRoomInvitePage(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  options: FetchRoomInvitePageOptions = {},
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInvitePage> {
  const limit = options.limit ?? CHAT_INITIAL_HISTORY_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Blumi could not read that room invitation.")
  if (options.inviteId && (options.before !== undefined || options.limit !== undefined)) {
    throw new Error("Blumi could not read that room invitation.")
  }
  const query = new URLSearchParams()
  if (options.inviteId) query.set("inviteId", options.inviteId)
  else {
    query.set("limit", String(limit))
    if (options.before) query.set("before", options.before)
  }
  const { response, payload } = await requestJson(baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/room-invites?${query.toString()}`,
    { headers: createAuthHeaders(sessionToken), signal }, fetcher)
  if (!response.ok) {
    if (options.inviteId && (response.status === 403 || response.status === 404)) {
      return { invites: [], activeInvites: [], nextCursor: null, paged: true }
    }
    throw new Error(getApiErrorMessage(payload, "We could not load that room invitation."))
  }
  const record = readInviteListPayload(payload, threadId) as { invites: unknown[]; nextCursor?: unknown; activeInvites?: unknown }
  const paged = "nextCursor" in record
  if (paged) {
    const invites = record.invites.map(value => normalizeThreadInvite(value, threadId))
    if (record.nextCursor !== null && (typeof record.nextCursor !== "string" || !record.nextCursor) || !Array.isArray(record.activeInvites)) {
      throw new Error("Blumi could not read that room invitation.")
    }
    const activeInvites = record.activeInvites.map(value => normalizeThreadInvite(value, threadId))
    const inviteIds = new Set(invites.map(invite => invite.inviteId))
    if (activeInvites.some(invite => invite.threadId !== threadId) || invites.length > (options.inviteId ? 1 : limit) ||
      activeInvites.length > 2 || record.nextCursor && invites[0]?.inviteId !== record.nextCursor ||
      inviteIds.size !== invites.length || invites.some((invite, index) => index > 0 && compareInviteRecords(invites[index - 1]!, invite) >= 0) ||
      options.before && inviteIds.has(options.before) || activeInvites.some(invite => inviteIds.has(invite.inviteId)) ||
      activeInvites.some(invite => invite.status !== "pending" && !(invite.status === "accepted" && Boolean(invite.roomSessionId))) ||
      new Set(activeInvites.map(invite => invite.inviteId)).size !== activeInvites.length ||
      options.inviteId && (activeInvites.length > 0 || record.nextCursor !== null || invites.some(invite => invite.inviteId !== options.inviteId))) {
      throw new Error("Blumi could not read that room invitation.")
    }
    return { invites, activeInvites, nextCursor: record.nextCursor as string | null, paged: true }
  }
  // Compatibility with an older deployed server: retain bounded local data,
  // without another full fetch or claiming that its HTTP response was bounded.
  // Validate all thread boundaries, but construct only the requested page and
  // the server's at-most-two live contexts. Old ended accepted records carry
  // no roomSessionId on either legacy server repository.
  // Legacy SQL ordered only by time. Equal-time rows may reorder between
  // requests; canonical IDs establish a stable exclusive local cursor.
  const rawIds = new Set<string>()
  for (const raw of record.invites) {
    const row = raw as Partial<RoomInviteRecord> | null
    if (!row || row.sourceThreadId !== threadId || typeof row.inviteId !== "string" ||
      typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) || rawIds.has(row.inviteId)) {
      throw new Error("Blumi could not read that room invitation.")
    }
    rawIds.add(row.inviteId)
  }
  const ordered = (record.invites as RoomInviteRecord[]).sort(compareInviteRecords)
  let boundary = options.before ? -1 : ordered.length
  let target: unknown
  const active: Partial<RoomInviteRecord>[] = []
  for (let index = 0; index < ordered.length; index += 1) {
    const raw = ordered[index]
    if (!raw || typeof raw !== "object" || (raw as Partial<RoomInviteRecord>).sourceThreadId !== threadId) {
      throw new Error("Blumi could not read that room invitation.")
    }
    const row = raw as Partial<RoomInviteRecord>
    if (row.inviteId === options.before) boundary = index
    if (row.inviteId === options.inviteId) target = row
    if (!options.inviteId && (row.status === "pending" && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()) ||
      row.status === "accepted" && Boolean(row.roomSessionId))) {
      active.push(row)
      if (active.length > 2) throw new Error("Blumi could not read that room invitation.")
    }
  }
  if (options.inviteId) return { invites: target ? [normalizeThreadInvite(target, threadId)] : [], activeInvites: [], nextCursor: null, paged: false }
  if (active.length > 2) throw new Error("Blumi could not read that room invitation.")
  const start = Math.max(0, boundary - limit)
  const invites = boundary < 0 ? [] : ordered.slice(start, boundary).map(value => normalizeThreadInvite(value, threadId))
  const pageIds = new Set(invites.map(row => row.inviteId))
  const activeInvites = active.filter(row => !pageIds.has(row.inviteId!)).map(value => normalizeThreadInvite(value, threadId))
  return { invites, activeInvites, nextCursor: start > 0 ? invites[0]?.inviteId ?? null : null, paged: false }
}

function compareInviteRecords(a: { createdAt: string; inviteId: string }, b: { createdAt: string; inviteId: string }): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.inviteId.localeCompare(b.inviteId)
}

export async function createThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/room-invites`,
    {
      method: "POST",
      headers: { ...createAuthHeaders(sessionToken), "content-type": "application/json" },
      body: JSON.stringify({}),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    const code = readRoomInviteBusyCode(payload)
    throw new RoomInviteApiError(
      getApiErrorMessage(payload, "We could not send that room invitation."),
      code,
      response.status,
      code === "SELF_IN_ROOM" && payload && typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).roomSessionId === "string"
        ? (payload as { roomSessionId: string }).roomSessionId
        : null
    )
  }
  return normalizeInviteResponse(payload)
}

/**
 * The decided invite. An acceptance also carries the ready room (room,
 * participants and this user's media session) so it opens without a second
 * join request; it is absent for a decline or an older server.
 */
export type RoomInviteDecisionResult = ChatRoomInviteTimelineItem & {
  readyRoom?: RoomSessionJoinResult
}

export async function decideThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  inviteId: string,
  status: RoomInviteDecision,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RoomInviteDecisionResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/room-invites/${encodeURIComponent(inviteId)}/decision`,
    {
      method: "POST",
      headers: { ...createAuthHeaders(sessionToken), "content-type": "application/json" },
      body: JSON.stringify({ status }),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That room invitation is no longer available."))
  }
  const decided = normalizeInviteResponse(payload)
  const readyRoom = readDecisionReadyRoom(payload)
  return readyRoom ? { ...decided, readyRoom } : decided
}

/** A malformed or partial room in the answer falls back to the join request. */
function readDecisionReadyRoom(payload: unknown): RoomSessionJoinResult | undefined {
  if (!payload || typeof payload !== "object" || !("miniRoom" in payload)) return undefined
  try {
    return normalizeRoomSessionJoinPayload(payload)
  } catch {
    return undefined
  }
}

export async function cancelThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  inviteId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/room-invites/${encodeURIComponent(inviteId)}/cancel`,
    { method: "POST", headers: createAuthHeaders(sessionToken), signal },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That room invitation is no longer available."))
  }
  return normalizeInviteResponse(payload)
}

export async function joinRoomSession(
  baseHttpUrl: string,
  sessionToken: string,
  roomSessionId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RoomSessionJoinResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/room-sessions/${encodeURIComponent(roomSessionId)}/join`,
    {
      method: "POST",
      headers: createAuthHeaders(sessionToken),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    const code = payload && typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).code === "string"
      ? (payload as { code: string }).code
      : null
    throw new RoomSessionJoinError(
      getApiErrorMessage(payload, "That Blumi Room is no longer available."),
      code,
      response.status
    )
  }
  return normalizeRoomSessionJoinPayload(payload)
}

export async function leaveRoomSession(
  baseHttpUrl: string,
  sessionToken: string,
  roomSessionId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RoomLeaveResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/room-sessions/${encodeURIComponent(roomSessionId)}/leave`,
    { method: "POST", headers: createAuthHeaders(sessionToken), signal },
    fetcher
  )
  if (!response.ok) {
    throw new RoomSessionLeaveError(
      getApiErrorMessage(payload, "We could not leave that room yet."),
      response.status
    )
  }
  return normalizeRoomLeaveResult(payload)
}

export async function leaveActiveRoom(
  baseHttpUrl: string,
  sessionToken: string,
  expectedRoomSessionId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RoomLeaveResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/users/me/active-room/leave",
    {
      method: "POST",
      headers: { ...createAuthHeaders(sessionToken), "content-type": "application/json" },
      body: JSON.stringify({ expectedRoomSessionId }),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not close your previous room yet."))
  }
  return normalizeRoomLeaveResult(payload)
}

function normalizeRoomLeaveResult(payload: unknown): RoomLeaveResult {
  if (!payload || typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).ended !== "boolean") {
    throw new Error("Blumi could not confirm that the room was closed.")
  }
  return { ended: (payload as { ended: boolean }).ended }
}

function readRoomInviteBusyCode(payload: unknown): RoomInviteApiError["code"] {
  if (!payload || typeof payload !== "object") return null
  const code = (payload as Record<string, unknown>).code
  return code === "SELF_IN_ROOM" || code === "PARTICIPANT_BUSY" ? code : null
}

export function normalizeRoomInviteRecord(value: unknown): ChatRoomInviteTimelineItem {
  if (!value || typeof value !== "object") {
    throw new Error("Blumi could not read that room invitation.")
  }
  const record = value as Partial<RoomInviteRecord>
  if (
    typeof record.inviteId !== "string" ||
    typeof record.senderUserId !== "string" ||
    typeof record.recipientUserId !== "string" ||
    typeof record.sourceThreadId !== "string" ||
    !isInviteStatus(record.status) ||
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    (record.expiresAt !== undefined && typeof record.expiresAt !== "string")
  ) {
    throw new Error("Blumi could not read that room invitation.")
  }
  return {
    kind: "room_invite",
    inviteId: record.inviteId,
    threadId: record.sourceThreadId,
    senderUserId: record.senderUserId,
    recipientUserId: record.recipientUserId,
    createdAt: record.createdAt,
    status: record.status,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(typeof record.roomSessionId === "string"
      ? { roomSessionId: record.roomSessionId }
      : {})
  }
}

function normalizeInviteListPayload(
  payload: unknown,
  expectedThreadId: string
): ChatRoomInviteTimelineItem[] {
  return readInviteListPayload(payload, expectedThreadId).invites.map(value => normalizeThreadInvite(value, expectedThreadId))
}

function readInviteListPayload(payload: unknown, expectedThreadId: string): { invites: unknown[] } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not read that room invitation.")
  }
  const record = payload as { threadId?: unknown; invites?: unknown }
  if (record.threadId !== expectedThreadId || !Array.isArray(record.invites)) {
    throw new Error("Blumi could not read that room invitation.")
  }
  return record as { invites: unknown[] }
}

function normalizeThreadInvite(value: unknown, threadId: string): ChatRoomInviteTimelineItem {
  const invite = normalizeRoomInviteRecord(value)
  if (invite.threadId !== threadId) throw new Error("Blumi could not read that room invitation.")
  return invite
}

function normalizeInviteResponse(payload: unknown): ChatRoomInviteTimelineItem {
  const invite = (payload as { invite?: unknown } | null)?.invite
  return normalizeRoomInviteRecord(invite)
}

function normalizeRoomSessionJoinPayload(payload: unknown): RoomSessionJoinResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not open that room.")
  }
  const record = payload as {
    miniRoom?: Partial<MiniRoom>
    mediaSession?: Partial<MediaSessionToken>
    participants?: unknown
  }
  const miniRoom = record.miniRoom
  const mediaSession = record.mediaSession
  const sharedDecor = miniRoom?.sharedDecor === undefined ? undefined : sharedRoomDecorSnapshotSchema.safeParse(miniRoom.sharedDecor)
  if (
    !miniRoom ||
    (sharedDecor !== undefined && !sharedDecor.success) ||
    typeof miniRoom.miniRoomId !== "string" ||
    typeof miniRoom.lobbyRoomId !== "string" ||
    !Array.isArray(miniRoom.participantUserIds) ||
    miniRoom.participantUserIds.length !== 2 ||
    !miniRoom.participantUserIds.every((userId) => typeof userId === "string") ||
    (sharedDecor?.success && !miniRoom.participantUserIds.includes(sharedDecor.data.ownerUserId)) ||
    typeof miniRoom.livekitRoomName !== "string" ||
    !mediaSession ||
    typeof mediaSession.miniRoomId !== "string" ||
    typeof mediaSession.livekitUrl !== "string" ||
    typeof mediaSession.token !== "string" ||
    typeof mediaSession.issuedAt !== "string" ||
    !Array.isArray(record.participants) ||
    record.participants.length !== 2 ||
    !record.participants.every(isMiniRoomParticipant)
  ) {
    throw new Error("Blumi could not open that room.")
  }
  return {
    miniRoom: {
      miniRoomId: miniRoom.miniRoomId,
      lobbyRoomId: miniRoom.lobbyRoomId,
      ...(typeof miniRoom.sourceThreadId === "string"
        ? { sourceThreadId: miniRoom.sourceThreadId }
        : {}),
      participantUserIds: [...miniRoom.participantUserIds] as [string, string],
      livekitRoomName: miniRoom.livekitRoomName,
      ...(sharedDecor?.success ? { sharedDecor: sharedDecor.data } : {})
    },
    mediaSession: {
      miniRoomId: mediaSession.miniRoomId,
      livekitUrl: mediaSession.livekitUrl,
      token: mediaSession.token,
      issuedAt: mediaSession.issuedAt
    },
    participants: record.participants.map((participant) => ({ ...participant })) as [
      MiniRoomParticipant,
      MiniRoomParticipant
    ]
  }
}

function isMiniRoomParticipant(value: unknown): value is MiniRoomParticipant {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<MiniRoomParticipant>
  return (
    typeof record.userId === "string" &&
    typeof record.displayName === "string" &&
    Boolean(record.avatar) &&
    typeof record.avatar === "object"
  )
}

function isInviteStatus(value: unknown): value is ChatRoomInviteStatus {
  return value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "expired" ||
    value === "cancelled"
}

function createAuthHeaders(sessionToken: string): Record<string, string> {
  return { authorization: `Bearer ${sessionToken}` }
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? (payload as Record<string, unknown>).error as string
    : fallback
}
