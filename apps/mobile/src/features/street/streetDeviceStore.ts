import AsyncStorage from "@react-native-async-storage/async-storage"
import { EMPTY_STREET_DEVICE_STATE, type StreetDeviceState } from "./streetModel"

const STORAGE_PREFIX = "blumi.street.device.v1:"

/** Keyed by account: one phone, several accounts, nothing shared between them. */
export function getStreetDeviceStorageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}${ownerUserId}`
}

export async function readStreetDeviceState(ownerUserId: string): Promise<StreetDeviceState> {
  try {
    const raw = await AsyncStorage.getItem(getStreetDeviceStorageKey(ownerUserId))
    if (!raw) return EMPTY_STREET_DEVICE_STATE
    const parsed = JSON.parse(raw) as Partial<StreetDeviceState>
    return {
      infoCardSeen: parsed.infoCardSeen === true,
      wakeEdition: typeof parsed.wakeEdition === "string" ? parsed.wakeEdition : null,
      seenEdition: typeof parsed.seenEdition === "string" ? parsed.seenEdition : null,
      seenThreadIds: Array.isArray(parsed.seenThreadIds) ? parsed.seenThreadIds.filter((id) => typeof id === "string") : [],
      snapshots: parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {}
    }
  } catch {
    // A damaged entry only costs the local memory (seen windows, Dün); the street still shows.
    return EMPTY_STREET_DEVICE_STATE
  }
}

export async function writeStreetDeviceState(ownerUserId: string, state: StreetDeviceState): Promise<void> {
  try {
    await AsyncStorage.setItem(getStreetDeviceStorageKey(ownerUserId), JSON.stringify(state))
  } catch {
    // Same as a read failure: the next open simply plays as a fresh device.
  }
}
