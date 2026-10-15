/**
 * The account's original sign-in phone, kept while a phone change is open.
 *
 * Once the new phone's code is confirmed, Firebase is signed in as the new
 * number while Blumi may still hold the old one (the final step failed, or the
 * app was closed before it finished). A restart must send the "current phone"
 * code to the account's own number, not to whatever Firebase reports, so the
 * verified original number is kept in secure storage until the change ends.
 *
 * Minimal and short-lived: one record for the signed-in user, dropped on
 * success, on every session change after start-up (sign-out, forced reset,
 * a new sign-in, another user; createPendingPhoneChangeSessionWatcher), on
 * expiry, and whenever the server's account phone disagrees with it
 * (resolveAccountReauthPhone). It is only a fallback: re-authentication texts
 * the phone the server names. Never logged.
 */
export const PENDING_PHONE_CHANGE_STORAGE_KEY = "blumi.mobile.pending_phone_change.v1"
export const PENDING_PHONE_CHANGE_TTL_MS = 1000 * 60 * 60 * 24

export interface PendingPhoneChangeKeyValueStore {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

export interface PendingPhoneChangeStore {
  /** Remembers the verified original phone of `userId`. */
  remember: (userId: string, originPhone: string) => Promise<void>
  /** The original phone of `userId`, or null (other users' records are dropped). */
  readOrigin: (userId: string) => Promise<string | null>
  clear: () => Promise<void>
}

interface StoredPendingPhoneChange {
  userId: string
  originPhone: string
  expiresAtMs: number
}

function parseRecord(raw: string | null): StoredPendingPhoneChange | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredPendingPhoneChange> | null
    if (
      typeof value?.userId !== "string" ||
      typeof value.originPhone !== "string" ||
      typeof value.expiresAtMs !== "number" ||
      !Number.isFinite(value.expiresAtMs)
    ) {
      return null
    }
    return { userId: value.userId, originPhone: value.originPhone, expiresAtMs: value.expiresAtMs }
  } catch {
    return null
  }
}

function warnStorageFailure(): void {
  // A fixed flag only: never the number, the user or the storage error text.
  console.warn("[Blumi] Pending phone change storage is unavailable.")
}

export function createPendingPhoneChangeStore(
  store: PendingPhoneChangeKeyValueStore,
  now: () => number = Date.now
): PendingPhoneChangeStore {
  const clear = async () => {
    try {
      await store.removeItem(PENDING_PHONE_CHANGE_STORAGE_KEY)
    } catch {
      warnStorageFailure()
    }
  }
  return {
    remember: async (userId, originPhone) => {
      const record: StoredPendingPhoneChange = {
        userId,
        originPhone,
        expiresAtMs: now() + PENDING_PHONE_CHANGE_TTL_MS
      }
      try {
        await store.setItem(PENDING_PHONE_CHANGE_STORAGE_KEY, JSON.stringify(record))
      } catch {
        warnStorageFailure()
      }
    },
    readOrigin: async (userId) => {
      let raw: string | null
      try {
        raw = await store.getItem(PENDING_PHONE_CHANGE_STORAGE_KEY)
      } catch {
        warnStorageFailure()
        return null
      }
      if (raw === null) return null
      const record = parseRecord(raw)
      if (!record || record.userId !== userId || record.expiresAtMs <= now()) {
        await clear()
        return null
      }
      return record.originPhone
    },
    clear
  }
}

/**
 * Drops the pending record whenever the signed-in user changes after the
 * stored session was restored at start-up: sign-out, a forced reset (401),
 * another account, or a new sign-in (Firebase then holds the phone just used
 * to sign in, which is the account's). Restoring the stored session keeps it.
 */
export function createPendingPhoneChangeSessionWatcher(clear: () => Promise<void>) {
  let observedUserId: string | null | undefined
  return {
    /** `ready` is false until the stored session has been restored. */
    observe(userId: string | null, ready: boolean): void {
      if (observedUserId === undefined) {
        if (ready) observedUserId = userId
        return
      }
      if (userId === observedUserId) return
      observedUserId = userId
      void clear()
    }
  }
}
