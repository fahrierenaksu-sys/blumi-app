import type { PendingPhoneChangeStore } from "./pendingPhoneChangeStore"

/**
 * The phone a re-authentication code (phone change, account deletion, data
 * export) must go to. The server's account phone is the source of truth: an
 * interrupted phone change can leave Firebase on the new number while the
 * account kept the old one, or the change may have landed after its answer
 * was lost, leaving the saved original stale.
 *
 * - The server named the phone: use it, and drop a saved original that
 *   disagrees (the change landed, so the record is stale).
 * - An older server did not: the saved original, then Firebase's phone.
 *
 * Never logs the number.
 */
export async function resolveAccountReauthPhone(input: {
  userId: string
  serverPhone: string | undefined
  pending: PendingPhoneChangeStore
  firebasePhone: () => string | null
}): Promise<string | null> {
  const { firebasePhone, pending, serverPhone, userId } = input
  const savedOrigin = await pending.readOrigin(userId)
  if (!serverPhone) return savedOrigin ?? firebasePhone()
  if (savedOrigin && savedOrigin !== serverPhone) await pending.clear()
  return serverPhone
}
