import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import {
  createSessionPersistence,
  NATIVE_SESSION_CLEARED_STORAGE_KEY,
  type SessionKeyValueStore
} from "./sessionPersistence"
import {
  shouldIgnoreNativeUiSessionResetError,
  shouldResetNativeUiTestSession
} from "./nativeUiSessionReset"

const INTRO_SEEN_STORAGE_KEY = "@blumi/welcome_seen"

const asyncStore: SessionKeyValueStore = {
  getItem: AsyncStorage.getItem,
  setItem: AsyncStorage.setItem,
  removeItem: AsyncStorage.removeItem
}

const secureStore: SessionKeyValueStore = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync
}

const sessionPersistence = createSessionPersistence({
  platform: Platform.OS === "web" ? "web" : "native",
  asyncStore,
  secureStore
})

export const loadSessionActor = sessionPersistence.load
export const saveSessionActor = sessionPersistence.save
export const clearSessionActor = sessionPersistence.clear

/**
 * Used only by the separately flagged native UI test build. iOS Keychain
 * entries survive app uninstall, so clearing only the simulator app container
 * does not reliably restore first-launch state.
 */
export async function resetNativeUiTestSessionState(): Promise<void> {
  const clearedMarker = await AsyncStorage.getItem(
    NATIVE_SESSION_CLEARED_STORAGE_KEY
  )
  if (!shouldResetNativeUiTestSession(clearedMarker)) return
  try {
    await clearSessionActor()
  } catch (error) {
    // The native UI runner intentionally builds without signing entitlements,
    // so iOS Keychain cleanup can fail even though the async cleared marker is
    // sufficient to prevent stale credentials from being loaded. Production
    // session reads and writes remain fail-closed in sessionPersistence.
    if (!shouldIgnoreNativeUiSessionResetError(error)) throw error
  }
  // An unsigned simulator may report a successful delete while still
  // rejecting the next secure-store read. Reassert the async marker after the
  // reset so the following load never probes unavailable Keychain storage.
  await AsyncStorage.setItem(NATIVE_SESSION_CLEARED_STORAGE_KEY, "true")
  await AsyncStorage.removeItem(INTRO_SEEN_STORAGE_KEY)
}

export async function loadHasSeenIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(INTRO_SEEN_STORAGE_KEY)) === "true"
}

export async function saveHasSeenIntro(): Promise<void> {
  await AsyncStorage.setItem(INTRO_SEEN_STORAGE_KEY, "true")
}
