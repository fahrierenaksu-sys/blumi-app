import { useEffect, useRef } from "react"
import { Linking } from "react-native"
import {
  parseLocalQaSignInSlot,
  resolveLocalQaCredentials,
  type LocalQaCredentials
} from "./localQaPhoneAuth"

export type { LocalQaCredentials }

/**
 * Simulator QA cannot type reliably into the phone field, so a local-QA dev
 * build also signs in from a deep link: `blumi://qa-sign-in?slot=1` signs in
 * as the first number in EXPO_PUBLIC_BLUMI_LOCAL_QA_PHONES, `slot=2` as the
 * second. Only mounted when local QA sign-in is allowed (localQaPhoneAuth).
 */
export function useLocalQaDeepLinkSignIn(input: {
  enabled: boolean
  phoneList: string | undefined
  code: string | undefined
  signIn: (credentials: LocalQaCredentials) => Promise<void>
}): void {
  const latestRef = useRef(input)
  latestRef.current = input
  const { enabled } = input

  useEffect(() => {
    if (!enabled) return
    let active = true
    const handleUrl = (url: string | null): void => {
      if (!active || !url) return
      const slot = parseLocalQaSignInSlot(url)
      if (slot === null) return
      const { phoneList, code, signIn } = latestRef.current
      const credentials = resolveLocalQaCredentials(slot, phoneList, code)
      if (!credentials) {
        console.warn("[Blumi QA] No local QA user for that slot; check EXPO_PUBLIC_BLUMI_LOCAL_QA_PHONES/CODE.")
        return
      }
      signIn(credentials).catch((error: unknown) => {
        // The session state already shows the error; no phone number here.
        console.warn("[Blumi QA] Local QA sign-in failed.", error instanceof Error ? error.message : "unknown")
      })
    }
    void Linking.getInitialURL().then(handleUrl).catch(() => undefined)
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url))
    return () => {
      active = false
      subscription.remove()
    }
  }, [enabled])
}
