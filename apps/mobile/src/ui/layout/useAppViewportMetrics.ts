import { useMemo } from "react"
import { useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  resolveAppViewportMetrics,
  type AppViewportMetrics,
} from "./appViewportMetrics"

export interface UseAppViewportMetricsOptions {
  bottomNavVisible?: boolean
}

export function useAppViewportMetrics(
  options: UseAppViewportMetricsOptions = {}
): AppViewportMetrics {
  const { bottomNavVisible = true } = options
  const { width, height, fontScale } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  return useMemo(
    () => resolveAppViewportMetrics({
      width,
      height,
      fontScale,
      safeAreaInsets: {
        top: insets.top,
        right: insets.right,
        bottom: insets.bottom,
        left: insets.left,
      },
      bottomNavVisible,
    }),
    [
      bottomNavVisible,
      fontScale,
      height,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      width,
    ]
  )
}
