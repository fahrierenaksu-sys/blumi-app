import { memo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { FadeOut, ReduceMotion } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { uiTheme } from "../../ui/theme"
import { MAIN_TAB_PAGE_CROSSFADE_MS } from "./mainTabPagerConfig"

/** Opacity only, so it stays under Reduce Motion (fading is not movement). */
const SHELL_EXITING = FadeOut
  .duration(MAIN_TAB_PAGE_CROSSFADE_MS)
  .reduceMotion(ReduceMotion.Never)

/**
 * What a main page draws before its content has mounted: the page background
 * and a static title-bar placeholder where every main page has its header.
 * A drag or a tab tap that reaches a page that is still warming lands on
 * this instead of an empty background. It is static (no pulse, no state),
 * takes no touches and is hidden from assistive technology; when the real
 * content arrives the shell fades out over it.
 */
export const MainTabPageShell = memo(function MainTabPageShell() {
  const insets = useSafeAreaInsets()
  return (
    <Animated.View
      exiting={SHELL_EXITING}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.shell, { paddingTop: insets.top + uiTheme.spacing.sm }]}
    >
      <View style={styles.titleBar}>
        <View style={styles.title} />
      </View>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: uiTheme.spacing.lg,
    backgroundColor: uiTheme.colors.background
  },
  titleBar: {
    minHeight: 60,
    justifyContent: "center"
  },
  title: {
    width: "42%",
    height: 26,
    borderRadius: uiTheme.radius.sm,
    backgroundColor: uiTheme.colors.surfaceMuted
  }
})
