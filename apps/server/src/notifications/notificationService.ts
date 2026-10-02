import {
  createInMemoryNotificationRepository,
  type DeviceRegistration,
  type NotificationPreferences,
  type NotificationPolicyReason,
  type NotificationRepository,
  type NotificationValueType,
  type PushDelivery,
  type PendingPushReceipt
} from "./notificationRepository"
import {
  createDevelopmentPushProvider,
  PushProviderHttpError,
  PushProviderRejection,
  type PushNotification,
  type PushProvider,
  type PushReceipt
} from "./pushProvider"
import { randomUUID } from "node:crypto"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  isPushExpired,
  resolvePushCopy,
  toOutgoingPushNotification,
  type PushLocale
} from "./pushMessagePolicy"
import { createPushBadgeResolver, withPushBadge } from "./pushBadge"
import { logPushFailure, resolveTicketFailure, safePushErrorCode } from "./pushFailurePolicy"
import { forEachWithConcurrency } from "./boundedConcurrency"
import { createDeviceRegistrationCache, withDeviceRegistrationInvalidation } from "./deviceRegistrationCache"

const MAX_PUSH_TOKEN_LENGTH = 4096
const MAX_PUSH_TITLE_LENGTH = 120
const MAX_PUSH_BODY_LENGTH = 240
const DELIVERY_LEASE_MS = 30_000
const MAX_DELIVERY_ATTEMPTS = 5
const DELIVERY_BATCH_SIZE = 100
/** Deliveries claimed per round; small so a lease is not spent waiting in line. */
const DELIVERY_CLAIM_SIZE = 30
/** At most this many provider calls (and so open dispatch transactions) at once. */
const DEFAULT_DISPATCH_CONCURRENCY = 3
const MIN_PUSHES_PER_HOUR = 1
const MAX_PUSHES_PER_HOUR = 20

export interface PushQueueResult {
  outcome: NotificationPolicyReason | "no_device"
  deliveryCount: number
}

export interface NotificationService {
  repository: NotificationRepository
  registerDevice(
    userId: string,
    input: { platform: "ios" | "android"; pushToken: string },
    now?: Date
  ): Promise<DeviceRegistration>
  /**
   * registerDevice that reports whether anything changed. An unchanged
   * registration (same account, platform and token) is answered without a
   * database write, usually without a database read.
   */
  ensureDeviceRegistered(
    userId: string,
    input: { platform: "ios" | "android"; pushToken: string },
    now?: Date
  ): Promise<{ device: DeviceRegistration; changed: boolean }>
  removeDevice(userId: string, pushToken: string): Promise<void>
  getPreferences(userId: string): Promise<NotificationPreferences>
  updatePreferences(userId: string, preferences: NotificationPreferences, fields?: (keyof NotificationPreferences)[]): Promise<NotificationPreferences>
  sendPushToUser(userId: string, notification: PushNotification, discoveryWatch?: import("../matches/matchRepository").DiscoveryWatchClaim): Promise<PushQueueResult>
  dispatchDue(now?: Date): Promise<void>
  /** Called after new deliveries are durably queued, so a worker can dispatch them at once. */
  onDeliveriesQueued?(listener: () => void): () => void
}

export interface CreateNotificationServiceOptions {
  repository?: NotificationRepository
  pushProvider?: PushProvider
  now?: () => Date
  deliveryIdFactory?: () => string
  providerTimeoutMs?: number
  reportPushFailure?: (failure: SafePushFailure) => void
  /** The recipient's app language when the server knows it; English otherwise. */
  resolveRecipientLocale?: (userId: string) => Promise<PushLocale | undefined>
  /** Provider calls in flight per dispatch cycle (default 3; pool max is 10). */
  dispatchConcurrency?: number
  /** How long a confirmed registration answers repeats from memory (default 10 min; 0 disables). */
  deviceRegistrationCacheTtlMs?: number
  /** The recipient's unread message total, read at dispatch for the iOS badge. */
  resolveRecipientBadge?: (userId: string) => Promise<number | undefined>
  /**
   * Re-checked right before each provider call: a block, ban, deleted account
   * or answered invite since enqueue must stop a queued or retried push.
   */
  isDeliveryCurrent?: (
    delivery: { userId: string; notification: PushNotification },
    now: Date
  ) => Promise<boolean>
  /**
   * How long a chat message push waits in the outbox before its first send
   * (default 0). A recipient who has the conversation open reads the message
   * within this time, and `isDeliveryCurrent` then drops the push.
   */
  chatMessagePushHoldMs?: number
}

export interface SafePushFailure {
  stage: "ticket" | "receipt"
  errorCode: string
  notificationType: string
  attempt: number
  count: number
}

export function createNotificationService(
  options: CreateNotificationServiceOptions = {}
): NotificationService {
  const registrationCache = createDeviceRegistrationCache({ ttlMs: options.deviceRegistrationCacheTtlMs })
  const repository = withDeviceRegistrationInvalidation(
    options.repository ?? createInMemoryNotificationRepository(),
    registrationCache
  )
  const pushProvider = options.pushProvider ?? createDevelopmentPushProvider()
  const now = options.now ?? (() => new Date())
  const deliveryIdFactory = options.deliveryIdFactory ?? createDeliveryId
  const providerTimeoutMs = options.providerTimeoutMs ?? 10_000
  const reportPushFailure = (stage: SafePushFailure["stage"], errorCode: string, attempt: number, type?: string) => {
    const notificationType = ["chat.message", "chat.room_invite", "discovery.match", "discovery.like", "discovery.watch_match"].includes(type ?? "")
      ? type! : "unknown"
    const failure = { stage, errorCode, notificationType, attempt, count: 1 }
    try {
      if (options.reportPushFailure) options.reportPushFailure(failure)
      else logPushFailure(failure)
    } catch { /* Diagnostics must not change durable delivery state. */ }
  }
  const resolveBadge = createPushBadgeResolver(options.resolveRecipientBadge)
  const chatMessagePushHoldMs = options.chatMessagePushHoldMs ?? 0
  if (!Number.isSafeInteger(chatMessagePushHoldMs) || chatMessagePushHoldMs < 0 || chatMessagePushHoldMs > MAX_CHAT_MESSAGE_PUSH_HOLD_MS) {
    throw new Error("Chat message push hold must be between 0 and 10 seconds.")
  }
  const dispatchConcurrency = options.dispatchConcurrency ?? DEFAULT_DISPATCH_CONCURRENCY
  if (!Number.isSafeInteger(dispatchConcurrency) || dispatchConcurrency < 1) {
    throw new Error("Push dispatch concurrency must be a positive integer.")
  }
  if (!Number.isSafeInteger(providerTimeoutMs) || providerTimeoutMs < 1 || providerTimeoutMs >= DELIVERY_LEASE_MS) {
    throw new Error("Provider timeout must be shorter than the delivery lease.")
  }
  const queuedListeners = new Set<() => void>()
  const announceQueued = () => {
    for (const listener of queuedListeners) {
      try { listener() } catch { /* A wake-up hint must not fail a durable enqueue. */ }
    }
  }
  const resolveLocale = async (userId: string, type: string | undefined): Promise<PushLocale> => {
    if (!options.resolveRecipientLocale || !resolvePushCopy(type, "en")) return "en"
    try {
      return (await options.resolveRecipientLocale(userId)) === "tr" ? "tr" : "en"
    } catch {
      return "en"
    }
  }

  const ensureDeviceRegistered: NotificationService["ensureDeviceRegistered"] = async (userId, input, now = new Date()) => {
    const device: DeviceRegistration = {
      registrationId: randomUUID(),
      userId: normalizeUserId(userId),
      platform: normalizePlatform(input.platform),
      pushToken: normalizePushToken(input.pushToken),
      registeredAt: now.toISOString()
    }
    const cached = registrationCache.get(device.userId, device.platform, device.pushToken)
    if (cached) return { device: cached, changed: false }
    const findCurrent = async () => (await repository.listDevices(device.userId))
      .find((entry) => entry.pushToken === device.pushToken)
    const readEpoch = registrationCache.epoch()
    const existing = await findCurrent()
    if (existing?.platform === device.platform) {
      registrationCache.remember(existing, readEpoch)
      return { device: existing, changed: false }
    }
    await repository.saveDevice(device)
    const savedEpoch = registrationCache.epoch()
    const current = await findCurrent()
    if (!current) throw new Error("Device registration changed. Please try again.")
    registrationCache.remember(current, savedEpoch)
    return { device: current, changed: true }
  }

  return {
    repository,
    async registerDevice(userId, input, now = new Date()) {
      return (await ensureDeviceRegistered(userId, input, now)).device
    },
    ensureDeviceRegistered,
    async removeDevice(userId, pushToken) {
      await repository.removeDevice(
        normalizeUserId(userId),
        normalizePushToken(pushToken)
      )
    },
    async getPreferences(userId) {
      return repository.getPreferences(normalizeUserId(userId))
    },
    async updatePreferences(userId, preferences, fields) {
      const normalizedUserId = normalizeUserId(userId)
      const normalizedPreferences = normalizePreferences(preferences)
      await repository.savePreferences(normalizedUserId, normalizedPreferences, fields)
      return repository.getPreferences(normalizedUserId)
    },
    async sendPushToUser(userId, notification, discoveryWatch) {
      const normalizedUserId = normalizeUserId(userId)
      // Validated before any read; the locale only picks the copy, so it is
      // read only for a recipient with a device (one round trip less per
      // chat message to a phone without push).
      const validated = normalizeNotification(notification, "en")
      if (discoveryWatch && (discoveryWatch.userId !== normalizedUserId || validated.data?.type !== "discovery.watch_match")) {
        throw new Error("Discovery Watch authorization does not match notification recipient or type.")
      }
      const devices = await repository.listDevices(normalizedUserId)
      if (devices.length === 0) return { outcome: "no_device", deliveryCount: 0 }
      const normalizedNotification = normalizeNotification(
        notification,
        await resolveLocale(normalizedUserId, notification.data?.type)
      )
      const queuedAt = now()
      const availableAt = new Date(queuedAt.getTime() +
        (normalizedNotification.data?.type === "chat.message" ? chatMessagePushHoldMs : 0))
      const deliveries = devices.map((device) => ({
        deliveryId: normalizeDeliveryId(deliveryIdFactory()),
        userId: normalizedUserId,
        pushToken: device.pushToken,
        registrationId: device.registrationId,
        notification: normalizedNotification,
        attemptCount: 0,
        availableAt: availableAt.toISOString(),
        createdAt: queuedAt.toISOString(),
        ...(discoveryWatch ? { discoveryWatch: { generation: discoveryWatch.generation, authorization: discoveryWatch.authorization } } : {})
      }))
      const policy = resolveNotificationPolicy(normalizedNotification, queuedAt)
      if (policy) {
        const decision = await repository.claimPolicyAndEnqueueDeliveries({
          userId: normalizedUserId,
          notificationType: policy.type,
          dedupeKey: discoveryWatch ? `discovery-watch:${normalizedUserId}:${discoveryWatch.generation}` : policy.dedupeKey,
          now: queuedAt,
          deliveries,
          discoveryWatch
        })
        if (!decision.allowed) return { outcome: decision.reason, deliveryCount: 0 }
        if (decision.deliveryCount > 0) announceQueued()
        return { outcome: "queued", deliveryCount: decision.deliveryCount }
      }
      await Promise.all(deliveries.map((delivery) => repository.enqueueDelivery(delivery)))
      announceQueued()
      return { outcome: "queued", deliveryCount: deliveries.length }
    },
    onDeliveriesQueued(listener) {
      queuedListeners.add(listener)
      return () => { queuedListeners.delete(listener) }
    },
    async dispatchDue(dispatchAt = now()) {
      await dispatchDue(dispatchAt)
      if (pushProvider.getReceipts || pushProvider.getReceipt) {
        const receipts = await repository.claimDueReceipts({ now: dispatchAt, limit: DELIVERY_BATCH_SIZE, leaseMs: DELIVERY_LEASE_MS })
        if (pushProvider.getReceipts) await dispatchReceiptBatch(receipts, dispatchAt)
        else await forEachWithConcurrency(receipts, dispatchConcurrency, (receipt) => dispatchReceipt(receipt, dispatchAt))
      }
    }
  }

  async function dispatchDue(dispatchAt: Date): Promise<void> {
    for (;;) {
      const deliveries = await repository.claimDueDeliveries({
        now: dispatchAt,
        limit: DELIVERY_CLAIM_SIZE,
        leaseMs: DELIVERY_LEASE_MS
      })
      if (deliveries.length === 0) return

      // Bounded: each authorized send holds a pooled connection in an open
      // transaction across the provider call (see withAuthorizedDelivery).
      await forEachWithConcurrency(deliveries, dispatchConcurrency, (delivery) => dispatchDelivery(delivery, dispatchAt))
      if (deliveries.length < DELIVERY_CLAIM_SIZE) return
    }
  }

  async function dispatchDelivery(delivery: PushDelivery, dispatchAt: Date): Promise<void> {
    const attempt = delivery.attemptCount + 1
    try {
      const devices = await repository.listDevices(delivery.userId)
      const owned = delivery.registrationId && devices.some((device) =>
        device.pushToken === delivery.pushToken && device.registrationId === delivery.registrationId)
      if (!owned) {
        if (delivery.leaseToken) await repository.markDeliveryFailed({
          deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt,
          now: dispatchAt, errorCode: "registration_changed"
        })
        return
      }
      if (isPushExpired(delivery.notification, dispatchAt)) {
        if (delivery.leaseToken) await repository.markDeliveryFailed({
          deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt,
          now: dispatchAt, errorCode: "expired"
        })
        return
      }
      if (options.isDeliveryCurrent) {
        let current: boolean
        try {
          current = await options.isDeliveryCurrent({ userId: delivery.userId, notification: delivery.notification }, dispatchAt)
        } catch {
          await scheduleRetryOrFail(delivery, attempt, dispatchAt, "relevance_check_failed")
          return
        }
        if (!current) {
          if (delivery.leaseToken) await repository.markDeliveryFailed({
            deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt,
            now: dispatchAt, errorCode: "no_longer_relevant"
          })
          return
        }
      }
      // Read before the authorized send, which holds a database connection.
      const outgoing = withPushBadge(
        toOutgoingPushNotification({ userId: delivery.userId, notification: delivery.notification }),
        await resolveBadge(delivery.userId)
      )
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let ticket: void | { ticketId: string }
      try {
        const admitted = await repository.withAuthorizedDelivery(delivery, dispatchAt, () => Promise.race([
          pushProvider.sendPush(delivery.pushToken, outgoing, { signal: controller.signal }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort()
              reject(new Error("provider unavailable: timeout"))
            }, providerTimeoutMs)
          })
        ]))
        if (!admitted.authorized) {
          if (delivery.leaseToken) await repository.markDeliveryFailed({ deliveryId: delivery.deliveryId,
            leaseToken: delivery.leaseToken, attempt, now: dispatchAt, errorCode: "authorization_changed" })
          return
        }
        ticket = admitted.value
      } finally {
        clearTimeout(timer)
      }
      if (!delivery.leaseToken) return
      await repository.markDeliverySent({ deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt, now: dispatchAt,
        ...(ticket?.ticketId ? { ticketId: ticket.ticketId } : {}) })
    } catch (error) {
      const errorCode = toSafeErrorCode(error)
      reportPushFailure("ticket", errorCode, attempt, delivery.notification.data?.type)
      const failure = resolveTicketFailure(errorCode, attempt, MAX_DELIVERY_ATTEMPTS)
      if (failure.action === "unregister" && delivery.registrationId) {
        if (delivery.leaseToken) await repository.markDeliveryFailed({ deliveryId: delivery.deliveryId,
          leaseToken: delivery.leaseToken, attempt, now: dispatchAt, errorCode: "DeviceNotRegistered" })
        await repository.removeDeviceRegistration({ ...delivery, registrationId: delivery.registrationId })
        return
      }
      if (failure.action === "fail" || failure.action === "retry") {
        await applyTicketFailure(delivery, attempt, dispatchAt, errorCode, failure)
        return
      }
      await scheduleRetryOrFail(delivery, attempt, dispatchAt, errorCode)
    }
  }

  /** Configuration/payload rejections stop at once; rate limits back off slowly. */
  async function applyTicketFailure(
    delivery: PushDelivery,
    attempt: number,
    dispatchAt: Date,
    errorCode: string,
    failure: { action: "fail" } | { action: "retry"; delayMs: number }
  ): Promise<void> {
    if (!delivery.leaseToken) return
    if (failure.action === "fail") {
      await repository.markDeliveryFailed({ deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt, now: dispatchAt, errorCode })
      return
    }
    await repository.markDeliveryRetry({
      deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt,
      availableAt: new Date(dispatchAt.getTime() + failure.delayMs), now: dispatchAt, errorCode
    })
  }

  async function scheduleRetryOrFail(delivery: PushDelivery, attempt: number, dispatchAt: Date, errorCode: string): Promise<void> {
    if (attempt >= MAX_DELIVERY_ATTEMPTS) {
      if (!delivery.leaseToken) return
      await repository.markDeliveryFailed({ deliveryId: delivery.deliveryId, leaseToken: delivery.leaseToken, attempt, now: dispatchAt, errorCode })
      return
    }
    await repository.markDeliveryRetry({
      deliveryId: delivery.deliveryId,
      leaseToken: delivery.leaseToken ?? "",
      attempt,
      availableAt: new Date(dispatchAt.getTime() + retryDelayMs(attempt)),
      now: dispatchAt,
      errorCode
    })
  }

  async function dispatchReceipt(receipt: PendingPushReceipt, dispatchAt: Date): Promise<void> {
    const getReceipt = pushProvider.getReceipt
    if (!receipt.leaseToken || !getReceipt) return
    if (await finishIfReceiptExpired(receipt, dispatchAt)) return
    try {
      const result = await withProviderTimeout((signal) => getReceipt(receipt.ticketId, { signal }), "Receipt timeout")
      await applyReceiptResult(receipt, result, dispatchAt)
    } catch {
      reportPushFailure("receipt", "provider_unavailable", 1)
      await retryReceiptLater(receipt, dispatchAt)
    }
  }

  /** One getReceipts request for every due ticket (Expo accepts 1000 ids per call). */
  async function dispatchReceiptBatch(receipts: PendingPushReceipt[], dispatchAt: Date): Promise<void> {
    const getReceipts = pushProvider.getReceipts
    if (!getReceipts) return
    const due: PendingPushReceipt[] = []
    for (const receipt of receipts) {
      if (!receipt.leaseToken) continue
      if (!await finishIfReceiptExpired(receipt, dispatchAt)) due.push(receipt)
    }
    if (due.length === 0) return
    let results: Map<string, PushReceipt>
    try {
      results = await withProviderTimeout((signal) => getReceipts(due.map((receipt) => receipt.ticketId), { signal }), "Receipt timeout")
    } catch {
      reportPushFailure("receipt", "provider_unavailable", 1)
      await forEachWithConcurrency(due, dispatchConcurrency, (receipt) => retryReceiptLater(receipt, dispatchAt))
      return
    }
    await forEachWithConcurrency(due, dispatchConcurrency, (receipt) =>
      applyReceiptResult(receipt, results.get(receipt.ticketId) ?? null, dispatchAt))
  }

  async function finishIfReceiptExpired(receipt: PendingPushReceipt, dispatchAt: Date): Promise<boolean> {
    if (dispatchAt.getTime() - Date.parse(receipt.createdAt) < 24 * 60 * 60_000) return false
    await repository.finishReceipt({ ticketId: receipt.ticketId, leaseToken: receipt.leaseToken!, outcome: "receipt_unavailable" })
    return true
  }

  async function retryReceiptLater(receipt: PendingPushReceipt, dispatchAt: Date): Promise<void> {
    await repository.retryReceipt({ ticketId: receipt.ticketId, leaseToken: receipt.leaseToken!,
      availableAt: new Date(dispatchAt.getTime() + 15 * 60_000) })
  }

  /**
   * DeviceNotRegistered unregisters the original registration. A receipt-level
   * MessageRateExceeded cannot be resent: the outbox row (title, body, data)
   * was deleted when the ticket was accepted and the receipt row keeps no
   * content, so it is recorded and logged only.
   */
  async function applyReceiptResult(receipt: PendingPushReceipt, result: PushReceipt | null, dispatchAt: Date): Promise<void> {
    if (!result) {
      await retryReceiptLater(receipt, dispatchAt)
      return
    }
    const errorCode = result.errorCode ? safePushErrorCode(result.errorCode) : undefined
    if (result.status === "error") reportPushFailure("receipt", errorCode ?? "provider_receipt_error", 1)
    if (result.status === "error" && result.errorCode === "DeviceNotRegistered") await repository.removeDeviceRegistration(receipt)
    await repository.finishReceipt({ ticketId: receipt.ticketId, leaseToken: receipt.leaseToken!,
      outcome: result.status === "ok" ? "provider_handoff" : "rejected",
      ...(errorCode ? { errorCode } : {}) })
  }

  async function withProviderTimeout<T>(call: (signal: AbortSignal) => Promise<T>, message: string): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        call(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error(message)) }, providerTimeoutMs)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}

function normalizePreferences(preferences: NotificationPreferences): NotificationPreferences {
  const timeZone = preferences.quietHoursTimeZone
  if (timeZone !== undefined && timeZone !== null) {
    try {
      if (typeof timeZone !== "string" || timeZone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(timeZone)) throw new Error("Invalid time zone")
      new Intl.DateTimeFormat("en", { timeZone }).format()
    } catch { throw new PublicRequestError("Choose a valid quiet-hours time zone.") }
  }
  if (
    typeof preferences.likesEnabled !== "boolean" ||
    typeof preferences.messagesEnabled !== "boolean" ||
    typeof preferences.matchesEnabled !== "boolean" ||
    typeof preferences.discoveryWatchEnabled !== "boolean"
  ) {
    throw new PublicRequestError("Choose valid notification preferences.")
  }
  if (
    !Number.isSafeInteger(preferences.quietHoursUtcOffsetMinutes) ||
    preferences.quietHoursUtcOffsetMinutes < -14 * 60 ||
    preferences.quietHoursUtcOffsetMinutes > 14 * 60
  ) {
    throw new PublicRequestError("Choose a valid quiet-hours time zone.")
  }
  if (
    !Number.isSafeInteger(preferences.maxPushesPerHour) ||
    preferences.maxPushesPerHour < MIN_PUSHES_PER_HOUR ||
    preferences.maxPushesPerHour > MAX_PUSHES_PER_HOUR
  ) {
    throw new PublicRequestError("Choose a notification frequency between 1 and 20 per hour.")
  }
  const quietHours = normalizeQuietHours(preferences.quietHours)
  return {
    likesEnabled: preferences.likesEnabled,
    messagesEnabled: preferences.messagesEnabled,
    matchesEnabled: preferences.matchesEnabled,
    discoveryWatchEnabled: preferences.discoveryWatchEnabled,
    quietHours,
    quietHoursUtcOffsetMinutes: preferences.quietHoursUtcOffsetMinutes,
    maxPushesPerHour: preferences.maxPushesPerHour,
    ...(timeZone !== undefined ? { quietHoursTimeZone: timeZone } : {})
  }
}

function normalizeQuietHours(
  quietHours: NotificationPreferences["quietHours"]
): NotificationPreferences["quietHours"] {
  if (quietHours === null) return null
  if (
    !quietHours ||
    !Number.isSafeInteger(quietHours.startMinute) ||
    !Number.isSafeInteger(quietHours.endMinute) ||
    quietHours.startMinute < 0 || quietHours.startMinute >= 24 * 60 ||
    quietHours.endMinute < 0 || quietHours.endMinute >= 24 * 60 ||
    quietHours.startMinute === quietHours.endMinute
  ) {
    throw new PublicRequestError("Choose valid quiet hours.")
  }
  return { startMinute: quietHours.startMinute, endMinute: quietHours.endMinute }
}

function resolveNotificationPolicy(
  notification: PushNotification,
  queuedAt: Date
): { type: NotificationValueType; dedupeKey: string } | null {
  const type = notification.data?.type
  switch (type) {
    case "discovery.like":
      // likeId: anonymous per-like id; sourceUserId: payloads queued before 2026-10-01.
      return policyFor("like", notification.data?.likeId ?? notification.data?.sourceUserId, queuedAt)
    case "chat.message":
      return policyFor("message", notification.data?.messageId, queuedAt)
    case "discovery.match":
      return policyFor("match", notification.data?.matchId, queuedAt)
    case "discovery.watch_match":
      return policyFor("discovery_watch", notification.data?.profileId, queuedAt)
    // Chat-initiated room invites belong to the conversation: the Messages
    // preference and quiet hours apply, the hourly budget does not.
    case "chat.room_invite":
      return policyFor("message", eventKey("room-invite", notification.data?.inviteId), queuedAt)
    case "mini_room.invite":
      return policyFor("message", eventKey("lobby-invite", notification.data?.inviteId), queuedAt)
    case "connection.matched":
      return policyFor("match", eventKey("connection", notification.data?.miniRoomId), queuedAt)
    default:
      return null
  }
}

function eventKey(prefix: string, id: string | undefined): string | undefined {
  const normalized = id?.trim()
  return normalized ? `${prefix}:${normalized}` : undefined
}

function policyFor(
  type: NotificationValueType,
  eventId: string | undefined,
  queuedAt: Date
): { type: NotificationValueType; dedupeKey: string } {
  const normalizedEventId = eventId?.trim()
  const fallbackWindow = Math.floor(queuedAt.getTime() / (15 * 60 * 1000))
  return {
    type,
    dedupeKey: normalizedEventId
      ? `${type}:${normalizedEventId}`
      : `${type}:window:${fallbackWindow}`
  }
}

function normalizeUserId(userId: string): string {
  const trimmed = userId.trim()
  if (!trimmed) throw new PublicRequestError("Choose a valid user.")
  return trimmed
}

function normalizePlatform(platform: string): "ios" | "android" {
  if (platform === "ios" || platform === "android") return platform
  throw new PublicRequestError("Choose a valid device platform.")
}

function normalizePushToken(pushToken: string): string {
  const trimmed = pushToken.trim()
  if (!trimmed || trimmed.length > MAX_PUSH_TOKEN_LENGTH) {
    throw new PublicRequestError("Choose a valid push token.")
  }
  return trimmed
}

function normalizeNotification(notification: PushNotification, locale: PushLocale): PushNotification {
  const copy = resolvePushCopy(notification.data?.type, locale)
  if (notification.data?.type === "chat.message") {
    return {
      ...copy!,
      data: Object.fromEntries(Object.entries(normalizeData(notification.data))
        .filter(([key]) => ["type", "messageId", "threadId"].includes(key)))
    }
  }
  // Known types always use the server's neutral copy, so no caller can put a
  // name or message text on a lock screen.
  if (copy) return { ...copy, data: normalizeData(notification.data!) }
  const title = normalizeText(notification.title, MAX_PUSH_TITLE_LENGTH)
  const body = normalizeText(notification.body, MAX_PUSH_BODY_LENGTH)
  return {
    title,
    body,
    ...(notification.data ? { data: normalizeData(notification.data) } : {})
  }
}

function normalizeText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  if (!normalized) {
    throw new PublicRequestError("Push notification content is required.")
  }
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength).trim()
    : normalized
}

function normalizeData(data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => key.trim() && typeof value === "string")
      .map(([key, value]) => [key.trim(), value])
  )
}

function createDeliveryId(): string {
  return `push_${randomUUID().replace(/-/g, "")}`
}

function normalizeDeliveryId(value: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new Error("Push delivery ID factory returned an invalid ID.")
  }
  return value
}

const MAX_CHAT_MESSAGE_PUSH_HOLD_MS = 10_000

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1))
}

function toSafeErrorCode(error: unknown): string {
  if (error instanceof PushProviderRejection) return safePushErrorCode(error.code)
  if (error instanceof PushProviderHttpError) return error.status === 429 ? "provider_rate_limited" : "provider_unavailable"
  const message = error instanceof Error ? error.message : "push_failed"
  const normalized = message.toLowerCase()
  if (normalized.includes("unavailable")) return "provider_unavailable"
  if (normalized.includes("token")) return "invalid_push_token"
  return "push_delivery_failed"
}
