import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useState } from "react"

export function useChatNotificationPrompt(input: {
  userId: string
  mode: "demo" | "production"
  isFocused: boolean
  permissionStatus: "unknown" | "undetermined" | "granted" | "denied"
}) {
  const { userId, mode, isFocused, permissionStatus } = input
  const [visibleForUser, setVisibleForUser] = useState<string | null>(null)
  const eligible = mode === "production" && isFocused && permissionStatus === "undetermined"
  useEffect(() => {
    if (!eligible) { setVisibleForUser(null); return }
    let active = true
    const key = `blumi:chat-notification-explanation:v1:${userId}`
    void AsyncStorage.getItem(key).then(async (seen) => {
      if (!active || seen === "seen") return
      // Persist before displaying so opening another conversation cannot repeat
      // the explanation. This is a local UI preference, never an OS permission.
      await AsyncStorage.setItem(key, "seen")
      if (active) setVisibleForUser(userId)
    }).catch(() => undefined)
    return () => { active = false }
  }, [eligible, userId])
  const dismiss = useCallback(() => setVisibleForUser(null), [])
  return { visible: eligible && visibleForUser === userId, dismiss }
}
