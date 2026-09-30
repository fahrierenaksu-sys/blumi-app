import type { ComponentType } from "react"
import type { StyleProp, ViewStyle } from "react-native"

export interface OptionalBlurViewProps {
  intensity?: number
  tint?: "light" | "dark" | "default"
  style?: StyleProp<ViewStyle>
}

let cached: ComponentType<OptionalBlurViewProps> | null | undefined

/**
 * expo-blur's native view, or null when this binary does not include it (an
 * older development or store build). Callers then draw the plain surface.
 */
export function getOptionalBlurView(): ComponentType<OptionalBlurViewProps> | null {
  if (cached !== undefined) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the native module is optional; a static import would crash builds without it.
    const blur = require("expo-blur") as { BlurView?: ComponentType<OptionalBlurViewProps> }
    cached = blur.BlurView ?? null
  } catch {
    cached = null
  }
  return cached
}
