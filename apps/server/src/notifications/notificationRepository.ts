import { randomUUID } from "node:crypto"
import { createKeyedSerialQueue, type DiscoveryWatchAuthorization } from "../matches/discoveryWatchAuthority"
import type { DiscoveryWatchClaim } from "../matches/matchRepository"

export interface DeviceRegistration {
  registrationId?: string
  userId: string
  platform: "ios" | "android"
  pushToken: string
  registeredAt: string
}

export interface PushDelivery {
  discoveryWatch?: { generation: string; authorization?: DiscoveryWatchAuthorization }
  registrationId?: string
  deliveryId: string
  userId: string
  pushToken: string
  notification: {
    title: string
    body: string
    data?: Record<string, string>
  }
  attemptCount: number
  availableAt: string
  createdAt: string
  leaseToken?: string
}

export interface PushDeliveryAudit {
  deliveryId: string
  attempt: number
  outcome: "sent" | "retry_scheduled" | "failed_permanently"
  occurredAt: string
  errorCode?: string
}

export interface PendingPushReceipt {
  ticketId: string
  deliveryId: string
  userId: string
  pushToken: string
  registrationId: string
  createdAt: string
  availableAt: string
  leaseToken?: string
}
export interface PushReceiptResult {
  ticketId: string
  outcome: "provider_handoff" | "rejected" | "receipt_unavailable"
  errorCode?: string
}

export interface NotificationPreferences {
  quietHoursTimeZone?: string | null
  likesEnabled: boolean
  messagesEnabled: boolean
  matchesEnabled: boolean
  discoveryWatchEnabled: boolean
  quietHours: { startMinute: number; endMinute: number } | null
  quietHoursUtcOffsetMinutes: number
  maxPushesPerHour: number
}

export type NotificationPolicyReason =
  | "queued"
  | "disabled"
  | "quiet_hours"
  | "frequency_cap"
  | "duplicate"
  | "stale_watch"

export interface NotificationPolicyAudit {
  userId: string
  notificationType: NotificationValueType
  reason: NotificationPolicyReason
  occurredAt: string
  dedupeKey: string
}

export type NotificationValueType =
  | "like"
  | "message"
  | "match"
  | "discovery_watch"

export interface NotificationPolicyDecision {
  allowed: boolean
  reason: NotificationPolicyReason
}

export interface NotificationPolicyDeliveryDecision extends NotificationPolicyDecision {
  deliveryCount: number
}

export interface NotificationRepository {
  withAuthorizedDelivery<T>(delivery: PushDelivery, now: Date, send: () => Promise<T>): Promise<{ authorized: boolean; value?: T }>
  claimDueReceipts(input: { now: Date; limit: number; leaseMs: number }): Promise<PendingPushReceipt[]>
  finishReceipt(input: PushReceiptResult & { leaseToken: string }): Promise<void>
  retryReceipt(input: { ticketId: string; leaseToken: string; availableAt: Date }): Promise<void>
  listReceiptResults(): Promise<PushReceiptResult[]>
  removeDeviceRegistration(input: { userId: string; pushToken: string; registrationId: string }): Promise<void>
  listDevices(userId: string): Promise<DeviceRegistration[]>
  saveDevice(device: DeviceRegistration): Promise<void>
  removeDevice(userId: string, pushToken: string): Promise<void>
  removeAllDevices(userId: string): Promise<void>
  getPreferences(userId: string): Promise<NotificationPreferences>
  savePreferences(userId: string, preferences: NotificationPreferences, fields?: (keyof NotificationPreferences)[]): Promise<void>
  claimPolicyDecision(input: {
    userId: string
    notificationType: NotificationValueType
    dedupeKey: string
    now: Date
  }): Promise<NotificationPolicyDecision>
  claimPolicyAndEnqueueDeliveries(input: {
    discoveryWatch?: DiscoveryWatchClaim
    userId: string
    notificationType: NotificationValueType
    dedupeKey: string
    now: Date
    deliveries: PushDelivery[]
  }): Promise<NotificationPolicyDeliveryDecision>
  enqueueDelivery(delivery: PushDelivery): Promise<void>
  claimDueDeliveries(input: {
    now: Date
    limit: number
    leaseMs: number
  }): Promise<PushDelivery[]>
  markDeliverySent(input: { deliveryId: string; leaseToken: string; attempt: number; now: Date; ticketId?: string }): Promise<void>
  markDeliveryRetry(input: {
    deliveryId: string
    leaseToken: string
    attempt: number
    availableAt: Date
    now: Date
    errorCode: string
  }): Promise<void>
  markDeliveryFailed(input: {
    deliveryId: string
    leaseToken: string
    attempt: number
    now: Date
    errorCode: string
  }): Promise<void>
  listPendingDeliveries(): Promise<PushDelivery[]>
  listDeliveryAudits(): Promise<PushDeliveryAudit[]>
  listPolicyAudits(): Promise<NotificationPolicyAudit[]>
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  likesEnabled: true,
  messagesEnabled: true,
  matchesEnabled: true,
  discoveryWatchEnabled: true,
  quietHours: null,
  quietHoursUtcOffsetMinutes: 0,
  maxPushesPerHour: 6
}

export function createInMemoryNotificationRepository(): NotificationRepository {
  const devices = new Map<string, DeviceRegistration>()
  const deliveries = new Map<string, PushDelivery>()
  const audits: PushDeliveryAudit[] = []
  const receipts = new Map<string, PendingPushReceipt>()
  const receiptResults: PushReceiptResult[] = []
  const preferences = new Map<string, NotificationPreferences>()
  const policyEvents: Array<NotificationPolicyAudit> = []
  const deviceQueue = createKeyedSerialQueue()

  return {
    async withAuthorizedDelivery(delivery, now, send) {
      const admit = () => deviceQueue(delivery.pushToken, async () => {
        const device = devices.get(deviceKey(delivery.userId, delivery.pushToken))
        if (!delivery.leaseToken || !delivery.registrationId || device?.registrationId !== delivery.registrationId ||
          deliveries.get(delivery.deliveryId)?.leaseToken !== delivery.leaseToken) return { authorized: false }
        return { authorized: true, value: await send() }
      })
      if (!delivery.discoveryWatch) return delivery.notification.data?.type === "discovery.watch_match" ? { authorized: false } : admit()
      if (!delivery.discoveryWatch.authorization) return { authorized: false }
      const result = await delivery.discoveryWatch.authorization.dispatch(now, admit)
      return result.authorized ? result.value! : { authorized: false }
    },
    async claimDueReceipts({ now, limit, leaseMs }) {
      const due = [...receipts.values()].filter((receipt) => Date.parse(receipt.availableAt) <= now.getTime()).slice(0, limit)
      return due.map((receipt) => {
        const claimed = { ...receipt, availableAt: new Date(now.getTime() + leaseMs).toISOString(), leaseToken: randomUUID() }
        receipts.set(receipt.ticketId, claimed)
        return { ...claimed }
      })
    },
    async finishReceipt({ ticketId, leaseToken, outcome, errorCode }) {
      if (receipts.get(ticketId)?.leaseToken !== leaseToken) return
      receipts.delete(ticketId)
      receiptResults.push({ ticketId, outcome, ...(errorCode ? { errorCode } : {}) })
    },
    async retryReceipt({ ticketId, leaseToken, availableAt }) {
      const receipt = receipts.get(ticketId)
      if (receipt?.leaseToken !== leaseToken) return
      receipts.set(ticketId, { ...receipt, availableAt: availableAt.toISOString(), leaseToken: undefined })
    },
    async listReceiptResults() { return receiptResults.map((result) => ({ ...result })) },
    async removeDeviceRegistration({ userId, pushToken, registrationId }) {
      await deviceQueue(pushToken, async () => {
      if (devices.get(deviceKey(userId, pushToken))?.registrationId !== registrationId) return
      devices.delete(deviceKey(userId, pushToken))
      for (const [id, delivery] of deliveries) {
        if (delivery.pushToken === pushToken && delivery.registrationId === registrationId) deliveries.delete(id)
      }
      })
    },
    async listDevices(userId) {
      return [...devices.values()]
        .filter((device) => device.userId === userId)
        .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))
        .map(cloneDevice)
    },
    async saveDevice(device) {
      await deviceQueue(device.pushToken, async () => {
      const existing = devices.get(deviceKey(device.userId, device.pushToken))
      const registrationId = existing?.registrationId ?? device.registrationId ?? randomUUID()
      for (const [id, delivery] of deliveries) {
        if (delivery.pushToken === device.pushToken && delivery.registrationId !== registrationId) deliveries.delete(id)
      }
      for (const [key, registeredDevice] of devices.entries()) {
        if (
          registeredDevice.pushToken === device.pushToken &&
          registeredDevice.userId !== device.userId
        ) {
          devices.delete(key)
        }
      }
      devices.set(deviceKey(device.userId, device.pushToken), { ...device, registrationId })
      })
    },
    async removeDevice(userId, pushToken) {
      await deviceQueue(pushToken, async () => {
      devices.delete(deviceKey(userId, pushToken))
      for (const [id, delivery] of deliveries) {
        if (delivery.userId === userId && delivery.pushToken === pushToken) deliveries.delete(id)
      }
      })
    },
    async removeAllDevices(userId) {
      const tokens = [...devices.values()].filter((device) => device.userId === userId).map((device) => device.pushToken).sort()
      for (const token of tokens) await this.removeDevice(userId, token)
    },
    async getPreferences(userId) {
      return clonePreferences(preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES)
    },
    async savePreferences(userId, value, fields) {
      const patch = fields ? Object.fromEntries(fields.map((key) => [key, value[key]])) : value
      preferences.set(userId, clonePreferences({ ...(preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES), ...patch }))
    },
    async claimPolicyDecision({ userId, notificationType, dedupeKey, now }) {
      const reason = resolvePolicyReason({
        preferences: preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES,
        policyEvents,
        userId,
        notificationType,
        dedupeKey,
        now
      })
      policyEvents.push({ userId, notificationType, reason, occurredAt: now.toISOString(), dedupeKey })
      return { allowed: reason === "queued", reason }
    },
    async claimPolicyAndEnqueueDeliveries({
      userId,
      notificationType,
      dedupeKey,
      now,
      deliveries: newDeliveries,
      discoveryWatch
    }) {
      if (discoveryWatch) {
        if (!discoveryWatch.authorization) return { allowed: false, reason: "stale_watch", deliveryCount: 0 }
        return discoveryWatch.authorization.enqueue(now, () => this.claimPolicyAndEnqueueDeliveries({
          userId, notificationType, dedupeKey, now, deliveries: newDeliveries
        }), () => {
          for (const [id, delivery] of deliveries) {
            if (delivery.userId === userId && delivery.discoveryWatch?.generation === discoveryWatch.generation) deliveries.delete(id)
          }
        })
      }
      if (newDeliveries.length === 0) {
        throw new Error("Policy deliveries must not be empty.")
      }
      const reason = resolvePolicyReason({
        preferences: preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES,
        policyEvents,
        userId,
        notificationType,
        dedupeKey,
        now
      })
      if (reason !== "queued") {
        policyEvents.push({ userId, notificationType, reason, occurredAt: now.toISOString(), dedupeKey })
        return { allowed: false, reason, deliveryCount: 0 }
      }
      const deliveryIds = new Set<string>()
      for (const delivery of newDeliveries) {
        if (deliveries.has(delivery.deliveryId) || deliveryIds.has(delivery.deliveryId)) {
          throw new Error("Push delivery ID must be unique.")
        }
        deliveryIds.add(delivery.deliveryId)
      }
      for (const delivery of newDeliveries) {
        deliveries.set(delivery.deliveryId, cloneDelivery(delivery))
      }
      policyEvents.push({ userId, notificationType, reason, occurredAt: now.toISOString(), dedupeKey })
      return { allowed: true, reason, deliveryCount: newDeliveries.length }
    },
    async enqueueDelivery(delivery) {
      if (deliveries.has(delivery.deliveryId)) {
        throw new Error("Push delivery ID must be unique.")
      }
      deliveries.set(delivery.deliveryId, cloneDelivery(delivery))
    },
    async claimDueDeliveries({ now, limit, leaseMs }) {
      const due = [...deliveries.values()]
        .filter((delivery) => Date.parse(delivery.availableAt) <= now.getTime())
        .sort((left, right) => Date.parse(left.availableAt) - Date.parse(right.availableAt))
        .slice(0, limit)
      for (const delivery of due) {
        deliveries.set(delivery.deliveryId, {
          ...delivery,
          availableAt: new Date(now.getTime() + leaseMs).toISOString(),
          leaseToken: `lease_${randomUUID().replace(/-/g, "")}`
        })
      }
      return due.map((delivery) => cloneDelivery(deliveries.get(delivery.deliveryId)!))
    },
    async markDeliverySent({ deliveryId, leaseToken, attempt, now, ticketId }) {
      const delivery = deliveries.get(deliveryId)
      if (delivery?.leaseToken !== leaseToken) return
      if (ticketId && delivery.registrationId) receipts.set(ticketId, {
        ticketId, deliveryId, userId: delivery.userId, pushToken: delivery.pushToken,
        registrationId: delivery.registrationId, createdAt: now.toISOString(),
        availableAt: new Date(now.getTime() + 15 * 60_000).toISOString()
      })
      deliveries.delete(deliveryId)
      audits.push({ deliveryId, attempt, outcome: "sent", occurredAt: now.toISOString() })
    },
    async markDeliveryRetry({ deliveryId, leaseToken, attempt, availableAt, now, errorCode }) {
      const delivery = deliveries.get(deliveryId)
      if (!delivery || delivery.leaseToken !== leaseToken) return
      deliveries.set(deliveryId, {
        ...delivery,
        attemptCount: attempt,
        availableAt: availableAt.toISOString(),
        leaseToken: undefined
      })
      audits.push({
        deliveryId,
        attempt,
        outcome: "retry_scheduled",
        occurredAt: now.toISOString(),
        errorCode
      })
    },
    async markDeliveryFailed({ deliveryId, leaseToken, attempt, now, errorCode }) {
      if (deliveries.get(deliveryId)?.leaseToken !== leaseToken) return
      deliveries.delete(deliveryId)
      audits.push({
        deliveryId,
        attempt,
        outcome: "failed_permanently",
        occurredAt: now.toISOString(),
        errorCode
      })
    },
    async listPendingDeliveries() {
      return [...deliveries.values()]
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map(cloneDelivery)
    },
    async listDeliveryAudits() {
      return audits.map((audit) => ({ ...audit }))
    },
    async listPolicyAudits() {
      return policyEvents.map((entry) => ({ ...entry }))
    }
  }
}

function resolvePolicyReason(input: {
  preferences: NotificationPreferences
  policyEvents: NotificationPolicyAudit[]
  userId: string
  notificationType: NotificationValueType
  dedupeKey: string
  now: Date
}): NotificationPolicyReason {
  const { preferences, policyEvents, userId, notificationType, dedupeKey, now } = input
  const oneHourAgo = now.getTime() - 60 * 60 * 1000
  const existing = policyEvents.some((event) =>
    event.userId === userId &&
    event.notificationType === notificationType &&
    event.dedupeKey === dedupeKey &&
    event.reason === "queued"
  )
  if (!isEnabled(preferences, notificationType)) return "disabled"
  if (isWithinQuietHours(now, preferences)) return "quiet_hours"
  if (existing) return "duplicate"
  if (policyEvents.filter((event) =>
    event.userId === userId &&
    event.reason === "queued" &&
    Date.parse(event.occurredAt) > oneHourAgo
  ).length >= preferences.maxPushesPerHour) return "frequency_cap"
  return "queued"
}

function deviceKey(userId: string, pushToken: string): string {
  return `${userId}:${pushToken}`
}

function cloneDevice(device: DeviceRegistration): DeviceRegistration {
  return { ...device }
}

function cloneDelivery(delivery: PushDelivery): PushDelivery {
  return {
    ...delivery,
    notification: {
      ...delivery.notification,
      ...(delivery.notification.data ? { data: { ...delivery.notification.data } } : {})
    }
  }
}

function clonePreferences(preferences: NotificationPreferences): NotificationPreferences {
  return {
    ...preferences,
    ...(preferences.quietHours ? { quietHours: { ...preferences.quietHours } } : {})
  }
}

function isEnabled(preferences: NotificationPreferences, type: NotificationValueType): boolean {
  switch (type) {
    case "like": return preferences.likesEnabled
    case "message": return preferences.messagesEnabled
    case "match": return preferences.matchesEnabled
    case "discovery_watch": return preferences.discoveryWatchEnabled
  }
}

function isWithinQuietHours(now: Date, preferences: NotificationPreferences): boolean {
  const quietHours = preferences.quietHours
  if (!quietHours) return false
  const local = new Date(now.getTime() + preferences.quietHoursUtcOffsetMinutes * 60_000)
  const parts = preferences.quietHoursTimeZone ? new Intl.DateTimeFormat("en-GB", {
    timeZone: preferences.quietHoursTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now) : null
  const minute = parts
    ? Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value)
    : local.getUTCHours() * 60 + local.getUTCMinutes()
  const { startMinute, endMinute } = quietHours
  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute
}
