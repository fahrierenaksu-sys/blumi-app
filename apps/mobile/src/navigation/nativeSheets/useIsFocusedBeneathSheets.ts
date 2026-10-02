import { useIsFocused, useNavigationState, useRoute } from "@react-navigation/native"
import { isFocusedBeneathSheets } from "./nativeSheetModel"

/**
 * `useIsFocused()` that stays true while only native sheets sit over the
 * screen: a sheet is part of the screen it opened from, so a chat keeps its
 * read state, typing and alert suppression while its report sheet is up.
 * Re-renders only when the answer changes.
 */
export function useIsFocusedBeneathSheets(): boolean {
  const isFocused = useIsFocused()
  const { key } = useRoute()
  const focusedBeneathSheets = useNavigationState((state) => isFocusedBeneathSheets(state, key))
  return isFocused || focusedBeneathSheets
}
