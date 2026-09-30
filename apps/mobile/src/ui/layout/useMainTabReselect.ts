import { useEffect } from "react"
import { subscribeToMainTabReselect, type MainTabReselectKey } from "./mainTabReselectStore"
/** Runs `onReselect` (keep it stable with useCallback) when this tab is tapped while already selected. */
export function useMainTabReselect(key: MainTabReselectKey, onReselect: () => void): void {
  useEffect(() => subscribeToMainTabReselect((reselected) => {
    if (reselected === key) onReselect()
  }), [key, onReselect])
}
