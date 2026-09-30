import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RealtimeConnectionStatus } from "@blumi/realtime-client"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import { getAppLocale } from "../../session/appLocale"
import { getConnectionBannerLabel } from "./connectionBannerCopy"
import type { ConnectionBannerState } from "./connectionBannerModel"
import { useConnectionBannerState } from "./useConnectionBannerState"

type VisibleBannerState = Exclude<ConnectionBannerState, "hidden">

interface ConnectionBannerProps {
  status: RealtimeConnectionStatus
}

/**
 * Compact status pill floating under the status bar. It overlays the screen
 * (no layout shift), never takes touches, and appears only when a connection
 * problem outlasts the grace period, so a normal resume reconnect is silent.
 */
export function ConnectionBanner({ status }: ConnectionBannerProps) {
  const bannerState = useConnectionBannerState(status)
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [locale] = useState(getAppLocale)
  const progress = useRef(new Animated.Value(0)).current
  const visible = bannerState !== "hidden"
  // The pill stays mounted; while it fades out it keeps its last message.
  const [lastVisibleState, setLastVisibleState] = useState<VisibleBannerState>("reconnecting")
  const displayedState = visible ? bannerState : lastVisibleState

  useEffect(() => {
    if (bannerState === "hidden") return
    setLastVisibleState(bannerState)
    // iOS has no live regions: announce once the problem is actually shown.
    AccessibilityInfo.announceForAccessibility(getConnectionBannerLabel(bannerState, locale))
  }, [bannerState, locale])

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation()
      progress.setValue(visible ? 1 : 0)
      return undefined
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [progress, reduceMotion, visible])

  const label = getConnectionBannerLabel(displayedState, locale)
  const isWarning = displayedState !== "reconnecting"

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[styles.overlay, { top: insets.top + 6 }]}
    >
      <Animated.View
        accessible={visible}
        accessibilityRole="alert"
        accessibilityLiveRegion={visible ? "polite" : "none"}
        accessibilityLabel={label}
        style={[
          styles.pill,
          isWarning ? styles.pillWarning : styles.pillNeutral,
          {
            opacity: progress,
            transform: [{
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] })
            }]
          }
        ]}
      >
        <View style={[styles.dot, isWarning ? styles.dotWarning : styles.dotNeutral]} />
        <Text
          style={[styles.text, isWarning ? styles.textWarning : styles.textNeutral]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 100
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    ...uiTheme.shadow.soft
  },
  pillNeutral: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: uiTheme.colors.primarySoft
  },
  pillWarning: {
    backgroundColor: uiTheme.colors.warningSoft,
    borderColor: "rgba(224, 165, 58, 0.35)"
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  dotNeutral: {
    backgroundColor: uiTheme.colors.primary
  },
  dotWarning: {
    backgroundColor: uiTheme.colors.warning
  },
  text: {
    ...uiTheme.font.caption,
    flexShrink: 1,
    textAlign: "center"
  },
  textNeutral: {
    color: uiTheme.colors.textSecondary
  },
  textWarning: {
    color: uiTheme.colors.warningInk
  }
})
