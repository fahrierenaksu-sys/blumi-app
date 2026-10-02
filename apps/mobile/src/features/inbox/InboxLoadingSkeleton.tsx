import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { uiTheme } from "../../ui/theme"
import {
  INBOX_SKELETON_FADE_MS,
  INBOX_SKELETON_PULSE_HALF_MS,
  INBOX_SKELETON_PULSE_MIN_OPACITY,
  INBOX_SKELETON_ROW_COUNT
} from "./inboxEntranceModel"

interface InboxLoadingSkeletonProps {
  isVisible: boolean
  /** Announced once for the whole placeholder; the rows themselves are hidden. */
  label: string
  reduceMotion: boolean
  rowHeight: number
  rowGap: number
}

const SKELETON_ROWS = Array.from({ length: INBOX_SKELETON_ROW_COUNT }, (_, index) => index)
const AVATAR_SIZE = 56

/** Skeleton → content is a crossfade: the placeholder fades out over the arriving rows. */
const SKELETON_EXITING = FadeOut
  .duration(INBOX_SKELETON_FADE_MS)
  .easing(Easing.out(Easing.quad))
  .reduceMotion(ReduceMotion.Never)

/**
 * Placeholder rows shown over the list while conversations open. It
 * crossfades out over the arriving rows (a UI-thread exiting animation, kept
 * under Reduce Motion because it is only opacity); its breathing pulse stops
 * under Reduce Motion.
 */
export function InboxLoadingSkeleton(props: InboxLoadingSkeletonProps) {
  const { isVisible, label, reduceMotion, rowHeight, rowGap } = props
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (!isVisible || reduceMotion) {
      pulse.value = 1
      return
    }
    const half = { duration: INBOX_SKELETON_PULSE_HALF_MS, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }
    pulse.value = withRepeat(
      withSequence(withTiming(INBOX_SKELETON_PULSE_MIN_OPACITY, half), withTiming(1, half)),
      -1
    )
  }, [isVisible, pulse, reduceMotion])
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  if (!isVisible) return null

  return (
    <Animated.View
      testID="inbox-loading-skeleton"
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      exiting={SKELETON_EXITING}
      style={styles.overlay}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ gap: rowGap }, pulseStyle]}
      >
        {SKELETON_ROWS.map((row) => (
          <View key={row} style={[styles.row, { minHeight: rowHeight }]}>
            <View style={styles.avatar} />
            <View style={styles.body}>
              <View style={[styles.bar, styles.nameBar, row % 2 === 1 ? styles.nameBarShort : null]} />
              <View style={[styles.bar, styles.previewBar, row % 2 === 0 ? styles.previewBarShort : null]} />
            </View>
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden"
  },
  // Mirrors the conversation card frame so arriving rows land in place.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md,
    padding: uiTheme.spacing.md,
    paddingLeft: uiTheme.spacing.md + 4,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: uiTheme.colors.avatarBackground
  },
  body: {
    flex: 1,
    gap: uiTheme.spacing.sm
  },
  bar: {
    borderRadius: uiTheme.radius.full
  },
  nameBar: {
    width: "46%",
    height: 14,
    backgroundColor: uiTheme.colors.primarySoft
  },
  nameBarShort: {
    width: "34%"
  },
  previewBar: {
    width: "82%",
    height: 10,
    backgroundColor: uiTheme.colors.surfaceMuted
  },
  previewBarShort: {
    width: "64%"
  }
})
