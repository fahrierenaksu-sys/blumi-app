import { createHash } from "node:crypto"
import type { PushDeliveryOptions, PushNotification } from "./pushProvider"

/**
 * What a push may say and carry, per notification type. The server owns the
 * copy (so no caller can put a name or message text on a lock screen) and the
 * device payload (routing ids plus the recipient, never the server-side ids a
 * delivery keeps for policy and relevance checks, such as who sent a like).
 */
export type PushLocale = "en" | "tr"

export const PUSH_ROUTED_TYPES = [
  "chat.message",
  "chat.room_invite",
  "discovery.match",
  "discovery.like",
  "discovery.watch_match",
  "connection.matched",
  "mini_room.invite"
] as const

export type PushRoutedType = typeof PUSH_ROUTED_TYPES[number]

interface PushCopy { title: string; body: string }

const PUSH_COPY: Record<PushLocale, Record<PushRoutedType, PushCopy>> = {
  en: {
    "chat.message": { title: "Blumi", body: "You have a new message." },
    "chat.room_invite": { title: "Blumi", body: "You have a new room invitation." },
    "discovery.match": { title: "It’s a match!", body: "Your vibes connected. Say hi when you’re ready." },
    "discovery.like": { title: "Someone likes your vibe", body: "Open Blumi to see where this could go." },
    "discovery.watch_match": { title: "A new vibe match is here", body: "Someone who fits your vibe is ready to meet." },
    "connection.matched": { title: "Blumi", body: "You have a new match!" },
    "mini_room.invite": { title: "Blumi", body: "Someone wants to meet you." }
  },
  tr: {
    "chat.message": { title: "Blumi", body: "Yeni bir mesajın var." },
    "chat.room_invite": { title: "Blumi", body: "Yeni bir oda davetin var." },
    "discovery.match": { title: "Eşleştiniz!", body: "Vibe'larınız buluştu. Hazır olduğunda merhaba de." },
    "discovery.like": { title: "Biri vibe'ını beğendi", body: "Nereye varacağını görmek için Blumi'yi aç." },
    "discovery.watch_match": { title: "Yeni bir vibe eşleşmesi var", body: "Vibe'ına uyan biri tanışmaya hazır." },
    "connection.matched": { title: "Blumi", body: "Yeni bir eşleşmen var!" },
    "mini_room.invite": { title: "Blumi", body: "Biri seninle tanışmak istiyor." }
  }
}

/** Keys a device receives per type, in addition to `type` and `recipientUserId`. */
const ROUTING_KEYS: Record<PushRoutedType, readonly string[]> = {
  "chat.message": ["threadId", "messageId"],
  "chat.room_invite": ["threadId", "inviteId", "expiresAt"],
  "discovery.match": ["matchId"],
  "discovery.like": [],
  "discovery.watch_match": [],
  "connection.matched": ["miniRoomId"],
  "mini_room.invite": ["inviteId", "roomId"]
}

const DAY_SECONDS = 24 * 60 * 60
const DEFAULT_ANDROID_CHANNEL_ID = "default"

export function isPushRoutedType(type: unknown): type is PushRoutedType {
  return typeof type === "string" && (PUSH_ROUTED_TYPES as readonly string[]).includes(type)
}

export function resolvePushCopy(type: string | undefined, locale: PushLocale): PushCopy | null {
  return isPushRoutedType(type) ? { ...PUSH_COPY[locale][type] } : null
}

/**
 * Who a chat push is from, read at send time (never stored in the outbox).
 * By the owner's decision (2026-10-02) a chat message push shows the sender's
 * name, picture and the message text, like a messaging app; iOS "Show
 * Previews" still lets a user hide it on the lock screen.
 */
export interface PushSender {
  displayName?: string
  /** Signed link to the sender's chibi picture (notificationPortraitLinks). */
  imageUrl?: string
  /** chat.message only: the stored message body. */
  messageText?: string
}

/** iOS notification categories the app registers (the actions live on the phone). */
export const PUSH_CATEGORY_IDS = {
  "chat.message": "CHAT_MESSAGE",
  "chat.room_invite": "ROOM_INVITE"
} as const

const MAX_SENDER_NAME_LENGTH = 40
export const MAX_PUSH_MESSAGE_PREVIEW_LENGTH = 140

const SENDER_COPY: Record<PushLocale, { message: string; invite: (name: string) => string }> = {
  en: { message: "sent you a message", invite: (name) => `${name} invited you to their room` },
  tr: { message: "Sana bir mesaj gönderdi", invite: (name) => `${name} seni odasına davet etti` }
}

export function toOutgoingPushNotification(input: {
  userId: string
  notification: PushNotification
  sender?: PushSender
  locale?: PushLocale
}): PushNotification {
  const data = input.notification.data
  const type = data?.type
  const routing = isPushRoutedType(type)
    ? Object.fromEntries(ROUTING_KEYS[type]
      .filter((key) => typeof data?.[key] === "string" && data[key].length > 0)
      .map((key) => [key, data![key]!]))
    : {}
  const chatType = type === "chat.message" || type === "chat.room_invite" ? type : undefined
  const name = chatType ? normalizeSenderName(input.sender?.displayName) : undefined
  const imageUrl = chatType ? normalizeImageUrl(input.sender?.imageUrl) : undefined
  const copy = SENDER_COPY[input.locale ?? "en"]
  let title = input.notification.title
  let body = input.notification.body
  if (name && chatType === "chat.message") {
    title = name
    body = normalizeMessagePreview(input.sender?.messageText) ?? copy.message
  } else if (name && chatType === "chat.room_invite") {
    title = name
    body = copy.invite(name)
  }
  const delivery = resolvePushDeliveryOptions(data)
  return {
    title,
    body,
    data: {
      ...(type ? { type } : {}),
      ...routing,
      ...(imageUrl ? { senderImage: imageUrl } : {}),
      recipientUserId: input.userId
    },
    delivery: chatType
      ? {
          ...delivery,
          categoryId: PUSH_CATEGORY_IDS[chatType],
          // Lets the iOS notification service extension attach the picture.
          ...(imageUrl ? { mutableContent: true, imageUrl } : {})
        }
      : delivery
  }
}

/** Bidirectional and control characters could disguise a name on the lock screen. */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g

function normalizeSenderName(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFC").replace(UNSAFE_NAME_CHARACTERS, "").replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  return Array.from(normalized).slice(0, MAX_SENDER_NAME_LENGTH).join("").trim()
}

/** One paragraph of at most 140 characters, ending in an ellipsis when cut. */
export function normalizeMessagePreview(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFC").replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  const characters = Array.from(normalized)
  if (characters.length <= MAX_PUSH_MESSAGE_PREVIEW_LENGTH) return normalized
  return `${characters.slice(0, MAX_PUSH_MESSAGE_PREVIEW_LENGTH - 1).join("").trimEnd()}…`
}

function normalizeImageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost") ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * Expo delivery options. Collapse and grouping keys are hashed: APNs limits
 * `apns-collapse-id` to 64 bytes and ids can be longer than that.
 */
export function resolvePushDeliveryOptions(data: Record<string, string> | undefined): PushDeliveryOptions {
  const base: PushDeliveryOptions = { channelId: DEFAULT_ANDROID_CHANNEL_ID }
  switch (data?.type) {
    case "chat.message":
      return {
        ...base,
        priority: "high",
        ...(data.threadId ? { collapseId: groupKey("chat", data.threadId), threadId: groupKey("thread", data.threadId) } : {})
      }
    case "chat.room_invite": {
      const expiration = toEpochSeconds(data.expiresAt)
      return {
        ...base,
        priority: "high",
        ...(data.threadId ? { collapseId: groupKey("invite", data.threadId), threadId: groupKey("thread", data.threadId) } : {}),
        ...(expiration !== undefined ? { expiration } : {})
      }
    }
    case "discovery.match":
      return { ...base, priority: "high", threadId: "matches", ...(data.matchId ? { collapseId: groupKey("match", data.matchId) } : {}) }
    case "connection.matched":
      return { ...base, priority: "high", threadId: "matches" }
    case "discovery.like":
      return { ...base, collapseId: "likes", threadId: "likes", ttlSeconds: DAY_SECONDS }
    case "discovery.watch_match":
      return { ...base, collapseId: "discovery-watch", threadId: "discovery", ttlSeconds: DAY_SECONDS }
    case "mini_room.invite":
      return { ...base, priority: "high", ttlSeconds: 60 }
    default:
      return base
  }
}

/** True once a push that carries an expiry can no longer be acted on. */
export function isPushExpired(notification: PushNotification, now: Date): boolean {
  const expiration = toEpochSeconds(notification.data?.expiresAt)
  return expiration !== undefined && expiration * 1000 <= now.getTime()
}

function groupKey(prefix: string, id: string): string {
  return `${prefix}.${createHash("sha256").update(id).digest("hex").slice(0, 32)}`
}

function toEpochSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? Math.floor(time / 1000) : undefined
}
