/**
 * In-app toast notification system.
 *
 * Usage:
 *   showToast({ title: "New match!", body: "You matched with Luna", type: "success" })
 *
 * Renders above the tab bar — slides in, auto-dismisses after 3s.
 */

import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { useEffect, useRef, useState } from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "./theme"
import { LinearGradient } from "./linearGradient"

type ToastType = "info" | "success" | "warning"

interface ToastData {
  id: string
  title: string
  body?: string
  type: ToastType
  durationMs?: number
}

// ── Global toast state ──────────────────────────────────────
type ToastListener = (toast: ToastData | null) => void
const listeners: Set<ToastListener> = new Set()
let currentToast: ToastData | null = null
let toastCounter = 0
let dismissTimer: ReturnType<typeof setTimeout> | null = null

export function showToast(opts: Omit<ToastData, "id">): void {
  if (dismissTimer) clearTimeout(dismissTimer)
  toastCounter += 1
  const toast: ToastData = { ...opts, id: `toast_${toastCounter}` }
  currentToast = toast
  for (const l of listeners) l(toast)

  dismissTimer = setTimeout(() => {
    currentToast = null
    for (const l of listeners) l(null)
    dismissTimer = null
  }, opts.durationMs ?? 3000)
}

export function dismissToast(): void {
  if (dismissTimer) clearTimeout(dismissTimer)
  currentToast = null
  for (const l of listeners) l(null)
}

// ── UI Component ────────────────────────────────────────────

const TYPE_CONFIG: Record<ToastType, {
  bg: string
  bgGradient: [string, string]
  border: string
  icon: ComponentProps<typeof Ionicons>["name"]
  iconBg: string
  textColor: string
}> = {
  success: {
    bg: uiTheme.colors.successSoft,
    bgGradient: ["#E8FAF0", "#DDF5EA"],
    border: "rgba(58, 192, 138, 0.25)",
    icon: "checkmark",
    iconBg: "rgba(58, 192, 138, 0.18)",
    textColor: uiTheme.colors.successInk
  },
  info: {
    bg: uiTheme.colors.primarySoft,
    bgGradient: ["#FFF0F6", "#FFE2EE"],
    border: "rgba(255, 79, 152, 0.2)",
    icon: "information",
    iconBg: "rgba(255, 79, 152, 0.15)",
    textColor: uiTheme.colors.primaryDeep
  },
  warning: {
    bg: uiTheme.colors.warningSoft,
    bgGradient: ["#FFF8ED", "#FFF2D9"],
    border: "rgba(224, 165, 58, 0.25)",
    icon: "warning",
    iconBg: "rgba(224, 165, 58, 0.18)",
    textColor: uiTheme.colors.warningInk
  }
}

export function ToastContainer() {
  const [toast, setToast] = useState<ToastData | null>(currentToast)
  const slideAnim = useRef(new Animated.Value(100)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const listener: ToastListener = (t) => setToast(t)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    if (toast) {
      progressAnim.setValue(1)
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 280,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        })
      ]).start()

      // Progress bar countdown
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: toast.durationMs ?? 3000,
        useNativeDriver: false,
      }).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 220,
          useNativeDriver: true
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true
        })
      ]).start()
    }
  }, [toast, slideAnim, opacityAnim, progressAnim])

  if (!toast) return null

  const config = TYPE_CONFIG[toast.type]
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  })

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderColor: config.border,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim
        }
      ]}
    >
      <LinearGradient
        colors={config.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss notification: ${toast.title}`}
          style={styles.content}
          onPress={dismissToast}
        >
          <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
            <Ionicons
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name={config.icon}
              size={16}
              color={config.textColor}
            />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: config.textColor }]} numberOfLines={1}>
              {toast.title}
            </Text>
            {toast.body ? (
              <Text style={[styles.body, { color: config.textColor }]} numberOfLines={2}>
                {toast.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressWidth,
                backgroundColor: config.textColor,
              }
            ]}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 110,
    left: uiTheme.spacing.lg,
    right: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 200,
    ...uiTheme.shadow.deep,
  },
  gradient: {
    borderRadius: uiTheme.radius.lg - 1,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: 2
  },
  title: {
    ...uiTheme.font.captionBold,
  },
  body: {
    ...uiTheme.font.caption,
    opacity: 0.8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  progressBar: {
    height: 3,
    opacity: 0.35,
    borderRadius: 2,
  },
})
