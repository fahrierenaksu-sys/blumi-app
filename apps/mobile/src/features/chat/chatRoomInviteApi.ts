import type {
  MediaSessionToken,
  MiniRoom,
  MiniRoomParticipant
} from "@blumi/contracts"
import { sharedRoomDecorSnapshotSchema } from "@blumi/contracts"
import type {
  ChatRoomInviteStatus,
  ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"

export type RoomInviteDecision = "accepted" | "declined"

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

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/")
    ? baseHttpUrl.slice(0, -1)
    : baseHttpUrl
  return `${trimmed}${path}`
}

export async function fetchThreadRoomInvites(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem[]> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/threads/${encodeURIComponent(threadId)}/room-invites`),
    { headers: createAuthHeaders(sessionToken), signal }
  )
  const payload: unknown = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not load that room invitation."))
  }
  return normalizeInviteListPayload(payload, threadId)
}

export async function createThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/threads/${encodeURIComponent(threadId)}/room-invites`),
    {
      method: "POST",
      headers: { ...createAuthHeaders(sessionToken), "content-type": "application/json" },
      body: JSON.stringify({}),
      signal
    }
  )
  const payload: unknown = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not send that room invitation."))
  }
  return normalizeInviteResponse(payload)
}

export async function decideThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  inviteId: string,
  status: RoomInviteDecision,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/room-invites/${encodeURIComponent(inviteId)}/decision`),
    {
      method: "POST",
      headers: { ...createAuthHeaders(sessionToken), "content-type": "application/json" },
      body: JSON.stringify({ status }),
      signal
    }
  )
  const payload: unknown = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That room invitation is no longer available."))
  }
  return normalizeInviteResponse(payload)
}

export async function cancelThreadRoomInvite(
  baseHttpUrl: string,
  sessionToken: string,
  inviteId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatRoomInviteTimelineItem> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/room-invites/${encodeURIComponent(inviteId)}/cancel`),
    {
      method: "POST",
      headers: createAuthHeaders(sessionToken),
      signal
    }
  )
  const payload: unknown = await readJsonPayload(response)
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
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/room-sessions/${encodeURIComponent(roomSessionId)}/join`),
    {
      method: "POST",
      headers: createAuthHeaders(sessionToken),
      signal
    }
  )
  const payload: unknown = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That Blumi Room is no longer available."))
  }
  return normalizeRoomSessionJoinPayload(payload)
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
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not read that room invitation.")
  }
  const record = payload as { threadId?: unknown; invites?: unknown }
  if (record.threadId !== expectedThreadId || !Array.isArray(record.invites)) {
    throw new Error("Blumi could not read that room invitation.")
  }
  return record.invites.map(normalizeRoomInviteRecord)
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

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
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
