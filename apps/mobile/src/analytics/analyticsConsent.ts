import { useCallback, useEffect, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  getProductAnalyticsClient,
  setProductAnalyticsCaptureEnabled
} from "./productAnalytics"

export const ANALYTICS_CONSENT_STORAGE_KEY =
  "@blumi/privacy/product_analytics_consent_v1"

export type AnalyticsConsent = "unknown" | "granted" | "denied"

let consent: AnalyticsConsent = "unknown"
let hydrated = false
let hydrationPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

async function applyConsent(nextConsent: AnalyticsConsent): Promise<void> {
  const client = getProductAnalyticsClient()
  if (nextConsent === "granted") {
    await client?.optIn()
    setProductAnalyticsCaptureEnabled(true)
    return
  }
  setProductAnalyticsCaptureEnabled(false)
  await client?.optOut()
  client?.reset()
}

export async function hydrateAnalyticsConsent(): Promise<void> {
  if (hydrated) return
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
        consent =
          stored === "granted" || stored === "denied" ? stored : "unknown"
      } catch {
        consent = "unknown"
      }
      await applyConsent(consent)
      hydrated = true
      notify()
    })().finally(() => {
      hydrationPromise = null
    })
  }
  await hydrationPromise
}

export async function setAnalyticsConsent(
  nextConsent: Exclude<AnalyticsConsent, "unknown">
): Promise<void> {
  await hydrateAnalyticsConsent()
  const previousConsent = consent
  try {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, nextConsent)
    await applyConsent(nextConsent)
    consent = nextConsent
    notify()
  } catch (error) {
    await applyConsent(previousConsent)
    throw error
  }
}

export function useAnalyticsConsent(): {
  consent: AnalyticsConsent
  hydrated: boolean
  setEnabled: (enabled: boolean) => Promise<void>
} {
  const [, setTick] = useState(0)
  const sync = useCallback(() => setTick((value) => value + 1), [])
  useEffect(() => {
    listeners.add(sync)
    void hydrateAnalyticsConsent()
    return () => {
      listeners.delete(sync)
    }
  }, [sync])
  return {
    consent,
    hydrated,
    setEnabled: (enabled) => setAnalyticsConsent(enabled ? "granted" : "denied")
  }
}
