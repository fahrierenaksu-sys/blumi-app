import { useFocusEffect } from "@react-navigation/native"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, BackHandler } from "react-native"
import { getCurrentSetupFlowCopy } from "../../features/session/setupFlow/setupFlowLocale"

export function useOnboardingSignOut(
  onSignOut: () => Promise<void>,
  isSubmitting: boolean
) {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isMountedRef = useRef(true)
  const busy = isSubmitting || isSigningOut
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setIsSigningOut(true)
    try {
      await onSignOut()
    } catch {
      // Session state owns the visible error and keeps saved progress intact.
    } finally {
      if (isMountedRef.current) setIsSigningOut(false)
    }
  }, [onSignOut])

  const requestSignOut = useCallback((): void => {
    if (busyRef.current) return
    const copy = getCurrentSetupFlowCopy().signOut
    Alert.alert(
      copy.title,
      copy.body,
      [
        { text: copy.keepGoing, style: "cancel" },
        {
          text: copy.confirm,
          style: "destructive",
          onPress: () => void signOut()
        }
      ]
    )
  }, [signOut])

  return {
    busy,
    isSigningOut,
    requestSignOut
  }
}

export function useOnboardingHardwareBack(
  onBack: () => void,
  disabled: boolean
): void {
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (!disabled) onBack()
          return true
        }
      )
      return () => subscription.remove()
    }, [disabled, onBack])
  )
}
