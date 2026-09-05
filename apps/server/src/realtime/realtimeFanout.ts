import type { ServerEvent } from "@blumi/contracts"

export const MAX_REALTIME_FANOUT_BYTES = 7_900

const SERVER_EVENT_TYPES = new Set([
  "room.joined",
  "room.left",
  "presence.snapshot",
  "presence.nearby",
  "mini_room.invite_received",
  "mini_room.invite_decided",
  "chat.room_invite_updated",
  "mini_room.ready",
  "mini_room.ended",
  "connection.decision_recorded",
  "connection.matched",
  "chat.thread_created",
  "chat.thread_listed",
  "chat.thread_read",
  "chat.message_listed",
  "chat.message_received",
  "reaction.received",
  "safety.user_blocked"
])

export type RealtimeFanoutTarget =
  | { kind: "user"; userId: string }
  | { kind: "users"; userIds: readonly string[] }
  | { kind: "room"; roomId: string }

export interface RealtimeFanoutMessage {
  origin: string
  target: RealtimeFanoutTarget
  event: ServerEvent
}

export type RealtimeFanoutHandler = (
  message: RealtimeFanoutMessage
) => void | Promise<void>

export interface RealtimeFanout {
  isHealthy?(): boolean
  publish(message: RealtimeFanoutMessage): Promise<void>
  subscribe(handler: RealtimeFanoutHandler): Promise<() => Promise<void>>
}

export function createInMemoryRealtimeFanout(): RealtimeFanout {
  const handlers = new Set<RealtimeFanoutHandler>()

  return {
    async publish(message) {
      const cloned = cloneFanoutMessage(message)
      await Promise.all(
        [...handlers].map((handler) => handler(cloneFanoutMessage(cloned)))
      )
    },
    async subscribe(handler) {
      handlers.add(handler)
      return async () => {
        handlers.delete(handler)
      }
    }
  }
}

export function validateRealtimeFanoutMessage(
  value: unknown
): value is RealtimeFanoutMessage {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (typeof record.origin !== "string" || !isSafeId(record.origin, 128)) {
    return false
  }
  if (!isServerEvent(record.event)) return false
  if (!isFanoutTarget(record.target)) return false
  if (record.event.type === "chat.thread_read") {
    return record.target.kind === "user" && record.target.userId === record.event.payload.userId
  }
  return true
}

export function cloneFanoutMessage(
  message: RealtimeFanoutMessage
): RealtimeFanoutMessage {
  const target = message.target.kind === "users"
    ? { kind: "users" as const, userIds: [...message.target.userIds] }
    : message.target.kind === "user"
      ? { kind: "user" as const, userId: message.target.userId }
      : { kind: "room" as const, roomId: message.target.roomId }
  return {
    origin: message.origin,
    target,
    event: JSON.parse(JSON.stringify(message.event)) as ServerEvent
  }
}

function isFanoutTarget(value: unknown): value is RealtimeFanoutTarget {
  if (!value || typeof value !== "object") return false
  const target = value as Record<string, unknown>
  if (target.kind === "user") {
    return typeof target.userId === "string" && isSafeId(target.userId, 256)
  }
  if (target.kind === "room") {
    return typeof target.roomId === "string" && isSafeId(target.roomId, 256)
  }
  if (target.kind === "users") {
    return Array.isArray(target.userIds) &&
      target.userIds.length > 0 &&
      target.userIds.length <= 100 &&
      target.userIds.every((userId) => typeof userId === "string" && isSafeId(userId, 256))
  }
  return false
}

function isServerEvent(value: unknown): value is ServerEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  return typeof event.type === "string" &&
    SERVER_EVENT_TYPES.has(event.type) &&
    Object.prototype.hasOwnProperty.call(event, "payload") &&
    isServerEventPayload(event.type, event.payload)
}

function isServerEventPayload(type: string, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  switch (type) {
    case "room.joined":
      return hasStrings(payload, ["roomId", "currentUserId", "assignedSpotId"]) &&
        isRecord(payload.layout) && isRecord(payload.snapshot)
    case "room.left":
      return hasStrings(payload, ["roomId"])
    case "presence.snapshot":
      return hasStrings(payload, ["roomId", "updatedAt"]) && Array.isArray(payload.users)
    case "presence.nearby":
      return hasStrings(payload, ["roomId", "userId"]) && Array.isArray(payload.nearbyUsers)
    case "mini_room.invite_received":
      return hasStrings(payload, ["inviteId", "senderUserId", "recipientUserId", "createdAt"])
    case "mini_room.invite_decided":
      return hasStrings(payload, ["inviteId", "senderUserId", "recipientUserId", "status", "decidedAt"])
    case "chat.room_invite_updated":
      return hasStrings(payload, ["inviteId", "senderUserId", "recipientUserId", "createdAt", "status"])
    case "mini_room.ready":
      return isRecord(payload.miniRoom) &&
        isRecord(payload.mediaSession) &&
        Array.isArray(payload.participants)
    case "mini_room.ended":
      return hasStrings(payload, ["miniRoomId", "lobbyRoomId", "endedByUserId", "endedAt"]) &&
        isStringTuple(payload.participantUserIds)
    case "connection.decision_recorded":
      return hasStrings(payload, ["miniRoomId", "actorUserId", "partnerUserId", "status", "decidedAt"])
    case "connection.matched":
      return hasStrings(payload, ["miniRoomId", "matchedAt"]) &&
        isStringTuple(payload.participantUserIds)
    case "chat.thread_created":
      return hasStrings(payload, ["threadId", "miniRoomId", "createdAt"]) &&
        isStringTuple(payload.participantUserIds) &&
        Array.isArray(payload.participants)
    case "chat.thread_listed":
      return hasStrings(payload, ["userId"]) && Array.isArray(payload.threads)
    case "chat.thread_read":
      return hasStrings(payload, ["userId", "threadId", "readAt"]) && Number.isFinite(Date.parse(String(payload.readAt)))
    case "chat.message_listed":
      return hasStrings(payload, ["userId", "threadId"]) && Array.isArray(payload.messages)
    case "chat.message_received":
      return hasStrings(payload, ["messageId", "threadId", "senderUserId", "body", "sentAt"])
    case "reaction.received":
      return hasStrings(payload, ["roomId", "actorUserId", "reaction", "createdAt"])
    case "safety.user_blocked":
      return hasStrings(payload, ["blockedUserId"])
    default:
      return false
  }
}

function hasStrings(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof record[key] === "string" && record[key])
}

function isStringTuple(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 &&
    value.every((item) => typeof item === "string" && item.length > 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isSafeId(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !/[\u0000\r\n]/.test(value)
}
