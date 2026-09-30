import { useEffect, useRef, useState } from "react"
import { Animated, Easing, StyleSheet, View } from "react-native"
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

/**
 * Placeholder rows shown over the list while conversations open. It fades out
 * over the arriving rows, and is static and instant under Reduce Motion.
 */
export function InboxLoadingSkeleton(props: InboxLoadingSkeletonProps) {
  const { isVisible, label, reduceMotion, rowHeight, rowGap } = props
  const fade = useRef(new Animated.Value(isVisible ? 1 : 0)).current
  const pulse = useRef(new Animated.Value(1)).current
  const [wasVisible, setWasVisible] = useState(isVisible)
  const [isFadingOut, setIsFadingOut] = useState(false)

  if (wasVisible !== isVisible) {
    setWasVisible(isVisible)
    setIsFadingOut(!isVisible && !reduceMotion)
  }
  if (isFadingOut && reduceMotion) setIsFadingOut(false)

  useEffect(() => {
    if (isVisible) {
      fade.stopAnimation()
      fade.setValue(1)
      return undefined
    }
    if (!isFadingOut) return undefined
    const animation = Animated.timing(fade, {
      toValue: 0,
      duration: INBOX_SKELETON_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    })
    animation.start(() => setIsFadingOut(false))
    return () => animation.stop()
  }, [fade, isFadingOut, isVisible])

  useEffect(() => {
    if (!isVisible || reduceMotion) {
      pulse.stopAnimation()
      pulse.setValue(1)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: INBOX_SKELETON_PULSE_MIN_OPACITY,
          duration: INBOX_SKELETON_PULSE_HALF_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: INBOX_SKELETON_PULSE_HALF_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [isVisible, pulse, reduceMotion])

  if (!isVisible && !isFadingOut) return null

  return (
    <Animated.View
      testID="inbox-loading-skeleton"
      pointerEvents="none"
      accessible={isVisible}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[styles.overlay, { opacity: fade }]}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: rowGap, opacity: pulse }}
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
