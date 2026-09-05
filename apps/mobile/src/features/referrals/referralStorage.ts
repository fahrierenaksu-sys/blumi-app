import AsyncStorage from "@react-native-async-storage/async-storage"
import { notifyPendingReferralCaptured } from "./referralCaptureSignal"
import { isReferralCode } from "./referralModel"

const PENDING_REFERRAL_STORAGE_KEY = "blumi.referrals.pending.v1"

export interface StoredPendingReferral {
  code: string
  userId?: string
}

export async function savePendingReferral(
  pending: StoredPendingReferral
): Promise<void> {
  if (!isReferralCode(pending.code)) {
    throw new Error("Blumi could not save that invite link safely.")
  }
  await AsyncStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, JSON.stringify(pending))
}

export async function capturePendingReferral(
  pending: StoredPendingReferral
): Promise<void> {
  await savePendingReferral(pending)
  notifyPendingReferralCaptured()
}

export async function loadPendingReferral(): Promise<StoredPendingReferral | null> {
  const raw = await AsyncStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredPendingReferral).code === "string" &&
      isReferralCode((parsed as StoredPendingReferral).code) &&
      (typeof (parsed as StoredPendingReferral).userId === "string" ||
        (parsed as StoredPendingReferral).userId === undefined)
    ) return parsed as StoredPendingReferral
  } catch {
    // Backward-compatible migration from the pre-binding opaque code value.
    if (isReferralCode(raw)) return { code: raw }
  }
  await AsyncStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY)
  return null
}

export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY)
}
