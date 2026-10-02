/**
 * In-app toast notification system.
 *
 * Usage:
 *   showToast({ title: "New match!", body: "You matched with Luna", type: "success" })
 *
 * Sits above the visible bottom bar, the safe area or an open keyboard
 * (`getToastBottomOffset`); slides in, auto-dismisses after 3s and plays its
 * exit before unmounting (`reduceToastPresentation`).
 */

import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { useEffect, useReducer, useState, useSyncExternalStore } from "react"
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { scheduleOnRN } from "react-native-worklets"
import { animateTo, useMotion } from "./motion"
import { hapticError, hapticSuccess } from "./haptics"
import { uiTheme } from "./theme"
import { LinearGradient } from "./linearGradient"
import { getToastCopy, resolveToastLocale } from "./toastCopy"
import { getToastBottomBarInset, subscribeToToastBottomBarInset } from "./toastLayoutStore"
import {
  TOAST_PRESENTATION_HIDDEN,
  getToastAnnouncement,
  getToastBottomOffset,
  getToastHapticKind,
  getToastPressLabel,
  handleToastPress,
  reduceToastPresentation,
  resolveToastKeyboardInset,
  type ToastData,
  type ToastKeyboardState,
  type ToastPresentationState,
  type ToastType
} from "./toastPresentationModel"

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
  if (opts.haptic) playToastHaptic(opts.type)

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

function playToastHaptic(type: ToastType): void {
  const kind = getToastHapticKind(type)
  if (kind === "success") hapticSuccess()
  else if (kind === "error") hapticError()
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

/** How far below its resting place the toast starts and leaves. */
const TOAST_HIDDEN_OFFSET = 100
const KEYBOARD_HIDDEN: ToastKeyboardState = { visible: false, inset: 0 }

function initToastPresentation(toast: ToastData | null): ToastPresentationState {
  return toast ? { toast, phase: "visible" } : TOAST_PRESENTATION_HIDDEN
}

/**
 * Keyboard coverage from keyboard events only (never per frame). iOS reports
 * the final frame; Android resizes the window, so only visibility matters.
 */
function useToastKeyboard(): ToastKeyboardState {
  const { height: windowHeight } = useWindowDimensions()
  const [keyboard, setKeyboard] = useState<ToastKeyboardState>(KEYBOARD_HIDDEN)

  useEffect(() => {
    const apply = (next: ToastKeyboardState): void => {
      setKeyboard((last) =>
        last.visible === next.visible && last.inset === next.inset ? last : next
      )
    }
    if (Platform.OS === "ios") {
      const frame = Keyboard.addListener("keyboardWillChangeFrame", (event) => {
        const inset = resolveToastKeyboardInset({
          windowHeight,
          keyboardScreenY: event.endCoordinates.screenY
        })
        apply(inset > 0 ? { visible: true, inset } : KEYBOARD_HIDDEN)
      })
      const hide = Keyboard.addListener("keyboardWillHide", () => apply(KEYBOARD_HIDDEN))
      return () => {
        frame.remove()
        hide.remove()
      }
    }
    const show = Keyboard.addListener("keyboardDidShow", () => apply({ visible: true, inset: 0 }))
    const hide = Keyboard.addListener("keyboardDidHide", () => apply(KEYBOARD_HIDDEN))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [windowHeight])

  return keyboard
}

export function ToastContainer() {
  const [presentation, dispatch] = useReducer(
    reduceToastPresentation,
    currentToast,
    initToastPresentation
  )
  const { toast, phase } = presentation
  const motion = useMotion()
  const { reduceMotion } = motion
  const [copy] = useState(() => getToastCopy(resolveToastLocale()))
  const insets = useSafeAreaInsets()
  const keyboard = useToastKeyboard()
  const bottomBarInset = useSyncExternalStore(
    subscribeToToastBottomBarInset,
    getToastBottomBarInset,
    getToastBottomBarInset
  )
  const bottomOffset = getToastBottomOffset({
    safeAreaBottom: insets.bottom,
    bottomBarInset,
    keyboard
  })
  // All toast motion runs on the UI thread. The resting position is a
  // translateY above the screen bottom (`lift`), so a bar, safe-area or
  // keyboard change never animates layout.
  const slide = useSharedValue(TOAST_HIDDEN_OFFSET)
  const opacity = useSharedValue(0)
  const progress = useSharedValue(0)
  const lift = useSharedValue(-bottomOffset)
  const containerMotionStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: slide.value + lift.value }]
  }))
  const progressMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }]
  }))
  const isOnScreen = toast !== null
  const announcedToast = phase === "visible" ? toast : null

  useEffect(() => {
    const listener: ToastListener = (t) =>
      dispatch(t ? { type: "show", toast: t } : { type: "hide" })
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    lift.value = isOnScreen ? animateTo(-bottomOffset, motion.smooth) : -bottomOffset
  }, [bottomOffset, isOnScreen, lift, motion])

  useEffect(() => {
    // iOS has no live regions: announce each toast once it is shown.
    if (!announcedToast || Platform.OS !== "ios") return
    AccessibilityInfo.announceForAccessibility(getToastAnnouncement(announcedToast))
  }, [announcedToast])

  useEffect(() => {
    if (!toast) return
    if (phase === "visible") {
      // Reduce Motion: the toast fades in place instead of sliding up.
      slide.value = reduceMotion ? 0 : animateTo(0, motion.snappy)
      opacity.value = animateTo(1, motion.fadeIn)
      // Progress bar countdown: a UI-thread scaleX from the left edge
      // instead of animating layout width.
      progress.value = 1
      progress.value = withTiming(0, {
        duration: toast.durationMs ?? 3000,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.Never
      })
      return
    }
    // Exiting: the last toast stays mounted until its own exit finishes. A
    // new toast restarts these values, which ends this exit unfinished.
    const exitingId = toast.id
    if (!reduceMotion) slide.value = animateTo(TOAST_HIDDEN_OFFSET, motion.fadeOut)
    opacity.value = animateTo(0, motion.fadeOut, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(dispatch, { type: "exitFinished", id: exitingId })
    })
  }, [toast, phase, slide, opacity, progress, motion, reduceMotion])

  if (!toast) return null

  const config = TYPE_CONFIG[toast.type]

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={phase === "exiting" ? "none" : "auto"}
      style={[styles.container, { borderColor: config.border }, containerMotionStyle]}
    >
      <LinearGradient
        colors={config.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={getToastPressLabel(toast, copy)}
          style={styles.content}
          onPress={() => handleToastPress(toast, dismissToast)}
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
            style={[styles.progressBar, { backgroundColor: config.textColor }, progressMotionStyle]}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    // Anchored to the screen bottom; `lift` raises it above the bar,
    // safe area or keyboard.
    bottom: 0,
    left: uiTheme.spacing.lg,
    right: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 200,
    ...uiTheme.shadow.deep,
  },
  gradient: {
    borderRadius: uiTheme.radius.lg - 1,
    borderCurve: "continuous",
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
    width: "100%",
    height: 3,
    transformOrigin: "left center",
    opacity: 0.35,
    borderRadius: 2,
  },
})
