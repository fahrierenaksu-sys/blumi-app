import type { NotificationPreferences } from "../notifications/notificationApi"

/**
 * Last server answers for the Settings switches, kept in memory so a return
 * visit paints them at once and the server only revalidates in the
 * background. The server stays the authority: nothing here is ever sent
 * back as truth, and every fetch overwrites it.
 *
 * One slot, owned by one account. Reading or writing for another account
 * drops the previous account's values, and `resetSettingsServerCache` empties
 * it on sign-out, so a value can never be shown to a different person.
 */
export interface ReadReceiptsSnapshot {
  readonly available: boolean
  readonly enabled: boolean
}

interface SettingsCacheSlot {
  readonly owner: string
  readonly notifications: NotificationPreferences | null
  readonly readReceipts: ReadReceiptsSnapshot | null
}

let slot: SettingsCacheSlot | null = null

function slotFor(owner: string): SettingsCacheSlot {
  return slot?.owner === owner ? slot : { owner, notifications: null, readReceipts: null }
}

export function readCachedNotificationPreferences(owner: string): NotificationPreferences | null {
  return slot?.owner === owner ? slot.notifications : null
}

export function cacheNotificationPreferences(owner: string, preferences: NotificationPreferences): void {
  slot = { ...slotFor(owner), notifications: preferences }
}

export function readCachedReadReceipts(owner: string): ReadReceiptsSnapshot | null {
  return slot?.owner === owner ? slot.readReceipts : null
}

export function cacheReadReceipts(owner: string, snapshot: ReadReceiptsSnapshot): void {
  slot = { ...slotFor(owner), readReceipts: snapshot }
}

/** Sign-out and account switch: forget everything. */
export function resetSettingsServerCache(): void {
  slot = null
}
