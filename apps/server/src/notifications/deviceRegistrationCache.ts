import type { DeviceRegistration, NotificationRepository } from "./notificationRepository"

/**
 * Recently confirmed push registrations, so a phone that repeats the same
 * POST /v1/devices (build 14 looped every ~340 ms) is answered from memory
 * without a database write or read.
 *
 * Keyed by push token, because the database keeps a token on at most one
 * account (ON CONFLICT (push_token)). An entry only answers for the same
 * account and platform. Every device mutation that goes through the
 * notification repository drops the affected entries at once.
 *
 * Single replica (Railway today): exact. With several replicas a token moved
 * to another account on a different replica stays cached here for at most
 * the TTL; the next miss re-reads the database. Account deletion removes the
 * account's sessions, so a stale entry for a deleted account is never asked.
 */
export interface DeviceRegistrationCache {
  get(userId: string, platform: DeviceRegistration["platform"], pushToken: string): DeviceRegistration | undefined
  /** Changes whenever any entry is forgotten; pass it back to `remember`. */
  epoch(): number
  /** Ignored when a mutation happened since `epochAtRead` (a racing removal wins). */
  remember(device: DeviceRegistration, epochAtRead: number): void
  forgetToken(pushToken: string): void
  forgetUser(userId: string): void
}

export const DEVICE_REGISTRATION_CACHE_TTL_MS = 10 * 60_000
export const DEVICE_REGISTRATION_CACHE_MAX_ENTRIES = 10_000

export function createDeviceRegistrationCache(options: {
  now?: () => number
  ttlMs?: number
  maxEntries?: number
} = {}): DeviceRegistrationCache {
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DEVICE_REGISTRATION_CACHE_TTL_MS
  const maxEntries = options.maxEntries ?? DEVICE_REGISTRATION_CACHE_MAX_ENTRIES
  const entries = new Map<string, { device: DeviceRegistration; expiresAt: number }>()
  let mutations = 0
  return {
    epoch: () => mutations,
    get(userId, platform, pushToken) {
      const entry = entries.get(pushToken)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(pushToken)
        return undefined
      }
      if (entry.device.userId !== userId || entry.device.platform !== platform) return undefined
      return { ...entry.device }
    },
    remember(device, epochAtRead) {
      if (ttlMs <= 0 || epochAtRead !== mutations) return
      entries.delete(device.pushToken)
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(device.pushToken, { device: { ...device }, expiresAt: now() + ttlMs })
    },
    forgetToken(pushToken) {
      mutations += 1
      entries.delete(pushToken)
    },
    forgetUser(userId) {
      mutations += 1
      for (const [token, entry] of entries) if (entry.device.userId === userId) entries.delete(token)
    }
  }
}

/** The same repository, with every device mutation invalidating the cache first. */
export function withDeviceRegistrationInvalidation(
  repository: NotificationRepository,
  cache: DeviceRegistrationCache
): NotificationRepository {
  return {
    ...repository,
    async saveDevice(device) {
      cache.forgetToken(device.pushToken)
      try {
        await repository.saveDevice(device)
      } finally {
        cache.forgetToken(device.pushToken)
      }
    },
    async removeDevice(userId, pushToken) {
      cache.forgetToken(pushToken)
      try {
        await repository.removeDevice(userId, pushToken)
      } finally {
        cache.forgetToken(pushToken)
      }
    },
    async removeAllDevices(userId) {
      cache.forgetUser(userId)
      try {
        await repository.removeAllDevices(userId)
      } finally {
        cache.forgetUser(userId)
      }
    },
    async removeDeviceRegistration(input) {
      cache.forgetToken(input.pushToken)
      try {
        await repository.removeDeviceRegistration(input)
      } finally {
        cache.forgetToken(input.pushToken)
      }
    }
  }
}
