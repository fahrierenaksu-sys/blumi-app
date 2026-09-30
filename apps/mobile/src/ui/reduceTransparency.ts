import { useSyncExternalStore } from "react"
import { AccessibilityInfo } from "react-native"
import {
  createReduceTransparencyStore,
  type ReduceTransparencyPreference
} from "./reduceTransparencyStore"

const reduceTransparencyStore = createReduceTransparencyStore({
  isReduceTransparencyEnabled: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  addEventListener: (event, listener) =>
    AccessibilityInfo.addEventListener(event, listener)
})

/**
 * The shared preference with `isResolved`: false only until the first OS
 * answer in this process, while `reduceTransparency` holds the fail-closed
 * (opaque) default.
 */
export function useReduceTransparencyState(): ReduceTransparencyPreference {
  return useSyncExternalStore(
    reduceTransparencyStore.subscribe,
    reduceTransparencyStore.getSnapshot,
    reduceTransparencyStore.getSnapshot
  )
}

/** True when the OS asks for less transparency; glass falls back to solid surfaces. */
export function useReduceTransparency(): boolean {
  return useReduceTransparencyState().reduceTransparency
}
