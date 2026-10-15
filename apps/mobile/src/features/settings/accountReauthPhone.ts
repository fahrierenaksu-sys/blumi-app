import type { FirebaseAccountActionChallenge } from "../session/sessionApi"
import type { PendingPhoneChangeStore } from "./pendingPhoneChangeStore"

const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/

export interface AccountReauthTarget {
  challenge: FirebaseAccountActionChallenge
  /** The phone to text, or null: sign in again (Firebase then holds it). */
  phoneNumber: string | null
}

/**
 * Starts a re-authentication challenge (phone change, account deletion, data
 * export) and finds the phone its code must go to.
 *
 * The server's account phone is the source of truth: an interrupted phone
 * change can leave Firebase on the new number while the account kept the old
 * one, or the change may have landed after its answer was lost, leaving the
 * saved original stale. The server never tells a bare session token the
 * phone; it confirms one the device already holds. So the device offers its
 * phones in turn (one verified earlier in this flow, the saved original even
 * past its TTL, then Firebase's) until the server names one:
 *
 * - Named: text it, and drop a saved original that disagrees (stale).
 * - Withheld for every phone: text nothing (null); signing in again puts the
 *   account's phone in Firebase.
 * - An older server names nothing: the in-flow phone, the saved original
 *   within its TTL, then Firebase's phone.
 *
 * Never logs a number.
 */
export async function requestAccountReauthTarget(input: {
  userId: string
  pending: PendingPhoneChangeStore
  firebasePhone: () => string | null
  /** A phone this flow already verified as the account's (phone change). */
  verifiedPhone?: string | null
  requestChallenge: (knownPhone: string | undefined) => Promise<FirebaseAccountActionChallenge>
}): Promise<AccountReauthTarget> {
  const { firebasePhone, pending, requestChallenge, userId, verifiedPhone } = input
  const savedOrigin = await pending.readOrigin(userId, { pastTtl: true })
  const candidates = [...new Set([verifiedPhone, savedOrigin, firebasePhone()])]
    .filter((phone): phone is string => typeof phone === "string" && E164_PHONE_PATTERN.test(phone))

  let challenge = await requestChallenge(candidates[0])
  for (const candidate of candidates.slice(1)) {
    if (!challenge.targetPhoneNumberWithheld) break
    challenge = await requestChallenge(candidate)
  }
  const named = challenge.targetPhoneNumber
  if (named) {
    if (savedOrigin && savedOrigin !== named) await pending.clear()
    return { challenge, phoneNumber: named }
  }
  if (challenge.targetPhoneNumberWithheld) return { challenge, phoneNumber: null }
  const unconfirmedOrigin = await pending.readOrigin(userId)
  return { challenge, phoneNumber: verifiedPhone || unconfirmedOrigin || firebasePhone() }
}
