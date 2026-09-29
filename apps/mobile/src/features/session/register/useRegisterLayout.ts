import { useWindowDimensions } from "react-native"
import { getSetupLayoutMetrics } from "../setupFlow/setupFlowShellModel"
import { resolveRegisterHeroLayout } from "./registerScreenModel"

/**
 * Viewport-driven Register layout: the shared setup metrics that size the
 * keyboard-collapsing create shell and the sign-in card, plus the hero and
 * recovery-action thresholds for narrow, short, and large-text screens.
 */
export function useRegisterLayout() {
  const {
    width: viewportWidth,
    height: viewportHeight,
    fontScale: viewportFontScale
  } = useWindowDimensions()
  const setupMetrics = getSetupLayoutMetrics({
    width: viewportWidth,
    height: viewportHeight,
    fontScale: viewportFontScale
  })
  const heroLayout = resolveRegisterHeroLayout(
    { width: viewportWidth, height: viewportHeight, fontScale: viewportFontScale },
    setupMetrics
  )
  return { setupMetrics, ...heroLayout }
}

export type RegisterLayout = ReturnType<typeof useRegisterLayout>
