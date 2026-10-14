import * as SecureStore from "expo-secure-store"
import { createPendingPhoneChangeStore } from "./pendingPhoneChangeStore"

/** The app's pending phone change record, in the device's secure storage. */
export const pendingPhoneChange = createPendingPhoneChangeStore({
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync
})
