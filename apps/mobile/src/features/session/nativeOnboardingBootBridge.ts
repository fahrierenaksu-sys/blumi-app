import { NativeModules, Platform } from "react-native"

interface BlumiBootBridgeModule {
  readonly bootStartedAtMs?: number
  readonly reduceMotionEnabled?: boolean
  markOnboardingContentReady?: () => void
}

function getBridge(): BlumiBootBridgeModule | undefined {
  return NativeModules.BlumiBootBridge as BlumiBootBridgeModule | undefined
}

export function getNativeOnboardingBootStartedAtMs(): number | null {
  if (Platform.OS !== "ios") return null
  const startedAtMs = getBridge()?.bootStartedAtMs
  return typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
    ? startedAtMs
    : null
}

export function getNativeOnboardingBootReduceMotion(): boolean | null {
  if (Platform.OS !== "ios") return null
  const reduceMotionEnabled = getBridge()?.reduceMotionEnabled
  return typeof reduceMotionEnabled === "boolean" ? reduceMotionEnabled : null
}

let didMarkContentReady = false

export function markOnboardingContentReady(): void {
  if (didMarkContentReady) return
  didMarkContentReady = true
  getBridge()?.markOnboardingContentReady?.()
}
