import { useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "./theme"
import { useReducedMotion } from "./animations"

export type ConnectionPillStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected"
  | "error"

interface ConnectionPillProps {
  status: ConnectionPillStatus
  tone?: "light" | "dark"
}

interface PillVisual {
  label: string
  dot: string
  bg: string
  text: string
  nightBg: string
  nightText: string
}

const visualByStatus: Record<ConnectionPillStatus, PillVisual> = {
  idle: {
    label: "Ready",
    dot: uiTheme.colors.textMuted,
    bg: uiTheme.colors.secondary,
    text: uiTheme.colors.secondaryText,
    nightBg: uiTheme.colors.nightSurfaceSoft,
    nightText: uiTheme.colors.nightTextSecondary
  },
  connecting: {
    label: "Connecting",
    dot: uiTheme.colors.warning,
    bg: uiTheme.colors.warningSoft,
    text: uiTheme.colors.warningInk,
    nightBg: "rgba(224, 165, 58, 0.18)",
    nightText: "#FFD58E"
  },
  reconnecting: {
    label: "Reconnecting",
    dot: uiTheme.colors.warning,
    bg: uiTheme.colors.warningSoft,
    text: uiTheme.colors.warningInk,
    nightBg: "rgba(224, 165, 58, 0.18)",
    nightText: "#FFD58E"
  },
  connected: {
    label: "Live",
    dot: uiTheme.colors.success,
    bg: uiTheme.colors.successSoft,
    text: uiTheme.colors.successInk,
    nightBg: "rgba(58, 192, 138, 0.18)",
    nightText: "#7CE3B7"
  },
  disconnected: {
    label: "Sync paused",
    dot: uiTheme.colors.danger,
    bg: uiTheme.colors.dangerSoft,
    text: uiTheme.colors.dangerInk,
    nightBg: "rgba(226, 88, 108, 0.22)",
    nightText: "#FFA5B0"
  },
  error: {
    label: "Sync paused",
    dot: uiTheme.colors.danger,
    bg: uiTheme.colors.dangerSoft,
    text: uiTheme.colors.dangerInk,
    nightBg: "rgba(226, 88, 108, 0.22)",
    nightText: "#FFA5B0"
  }
}

export function ConnectionPill(props: ConnectionPillProps) {
  const { status, tone = "light" } = props
  const visual = visualByStatus[status]
  const isDark = tone === "dark"
  const backgroundColor = isDark ? visual.nightBg : visual.bg
  const textColor = isDark ? visual.nightText : visual.text

  const pulseAnim = useRef(new Animated.Value(1)).current
  const isConnected = status === "connected"
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!isConnected || reduceMotion) {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(1)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [isConnected, pulseAnim, reduceMotion])

  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <View style={styles.dotWrap}>
        {isConnected ? (
          <Animated.View
            style={[
              styles.dotPulse,
              {
                backgroundColor: visual.dot,
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.6],
                  outputRange: [0.4, 0],
                }),
                transform: [{ scale: pulseAnim }],
              }
            ]}
            pointerEvents="none"
          />
        ) : null}
        <View style={[styles.dot, { backgroundColor: visual.dot }]} />
      </View>
      <Text style={[styles.label, { color: textColor }]}>{visual.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  dotWrap: {
    width: 8,
    height: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotPulse: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    ...uiTheme.font.micro,
  }
})
