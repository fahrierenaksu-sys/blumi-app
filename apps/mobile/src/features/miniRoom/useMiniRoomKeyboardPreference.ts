import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect, useSyncExternalStore } from "react"
import { createMiniRoomKeyboardPreference } from "./miniRoomKeyboardPreference"

const preference = createMiniRoomKeyboardPreference(AsyncStorage)
const toggle = () => { void preference.setEnabled(!preference.getSnapshot()) }

export function useMiniRoomKeyboardPreference() {
  const suggestionsEnabled = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  useEffect(() => { void preference.hydrate() }, [])
  return { suggestionsEnabled, toggle }
}
