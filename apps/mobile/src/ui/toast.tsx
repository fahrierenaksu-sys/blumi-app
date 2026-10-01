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
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useReducedMotion } from "./animations"
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

const TOAST_LIFT_DURATION_MS = 220
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
  const reduceMotion = useReducedMotion()
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
  const slideAnim = useRef(new Animated.Value(100)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  // The resting position is a native-driver translateY above the screen
  // bottom, so a bar, safe-area or keyboard change never animates layout.
  const liftAnim = useRef(new Animated.Value(-bottomOffset)).current
  const translateY = useMemo(() => Animated.add(slideAnim, liftAnim), [slideAnim, liftAnim])
  const isOnScreen = toast !== null
  const announcedToast = phase === "visible" ? toast : null

  useEffect(() => {
    const listener: ToastListener = (t) =>
      dispatch(t ? { type: "show", toast: t } : { type: "hide" })
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    liftAnim.stopAnimation()
    if (!isOnScreen || reduceMotion) {
      liftAnim.setValue(-bottomOffset)
      return
    }
    Animated.timing(liftAnim, {
      toValue: -bottomOffset,
      duration: TOAST_LIFT_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start()
  }, [bottomOffset, isOnScreen, liftAnim, reduceMotion])

  useEffect(() => {
    // iOS has no live regions: announce each toast once it is shown.
    if (!announcedToast || Platform.OS !== "ios") return
    AccessibilityInfo.announceForAccessibility(getToastAnnouncement(announcedToast))
  }, [announcedToast])

  useEffect(() => {
    if (!toast) return
    if (phase === "visible") {
      progressAnim.setValue(1)
      // Reduce Motion: the toast fades in place instead of sliding up.
      if (reduceMotion) slideAnim.setValue(0)
      Animated.parallel([
        ...(reduceMotion ? [] : [Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 280,
        })]),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        })
      ]).start()

      // Progress bar countdown: a native-driver scaleX from the left edge
      // instead of animating layout width on the JS thread.
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: toast.durationMs ?? 3000,
        useNativeDriver: true,
      }).start()
      return
    }
    // Exiting: the last toast stays mounted until its own exit finishes. A
    // new toast restarts these values, which stops this exit unfinished.
    const exitingId = toast.id
    Animated.parallel([
      ...(reduceMotion ? [] : [Animated.timing(slideAnim, {
        toValue: 100,
        duration: 220,
        useNativeDriver: true
      })]),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true
      })
    ]).start(({ finished }) => {
      if (finished) dispatch({ type: "exitFinished", id: exitingId })
    })
  }, [toast, phase, slideAnim, opacityAnim, progressAnim, reduceMotion])

  if (!toast) return null

  const config = TYPE_CONFIG[toast.type]

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={phase === "exiting" ? "none" : "auto"}
      style={[
        styles.container,
        {
          borderColor: config.border,
          transform: [{ translateY }],
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
            style={[
              styles.progressBar,
              {
                transform: [{ scaleX: progressAnim }],
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
    // Anchored to the screen bottom; `liftAnim` raises it above the bar,
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
