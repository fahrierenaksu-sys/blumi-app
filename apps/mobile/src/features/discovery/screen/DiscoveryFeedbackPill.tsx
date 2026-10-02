import { useCallback, useRef, useState } from "react"
import { StyleSheet, Text } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { MOTION_DURATIONS } from "../../../ui/motion"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"

export type DiscoverFeedbackTone = "soft" | "warm"

export interface DiscoverFeedback {
  id: number
  text: string
  tone: DiscoverFeedbackTone
}

const FEEDBACK_HOLD_MS = 1050

export type ShowDiscoverFeedback = (text: string, tone: DiscoverFeedbackTone) => void

// Short-lived decision feedback ("Like sent.", "Passed for now."). The latest
// message wins; an older animation never clears a newer message.
export function useDiscoveryFeedback() {
  const [discoverFeedback, setDiscoverFeedback] =
    useState<DiscoverFeedback | null>(null)
  const feedbackAnim = useSharedValue(0)
  const feedbackCounterRef = useRef(0)

  const showDiscoverFeedback = useCallback(
    (text: string, tone: DiscoverFeedbackTone): void => {
      feedbackCounterRef.current += 1
      const nextId = feedbackCounterRef.current
      setDiscoverFeedback({ id: nextId, text, tone })
      const clearIfLatest = (id: number) => {
        setDiscoverFeedback((current) => (current?.id === id ? null : current))
      }
      // Fades in, holds, fades out on the UI thread; a newer message
      // restarts it, and only the latest message is ever cleared.
      feedbackAnim.value = withSequence(
        withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
        withTiming(1, { duration: MOTION_DURATIONS.fadeIn, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }),
        withDelay(
          FEEDBACK_HOLD_MS,
          withTiming(0, { duration: MOTION_DURATIONS.fadeOut, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.Never }, () => {
            "worklet"
            scheduleOnRN(clearIfLatest, nextId)
          }),
          ReduceMotion.Never
        )
      )
    },
    [feedbackAnim]
  )

  return { discoverFeedback, feedbackAnim, showDiscoverFeedback }
}

export function DiscoveryFeedbackPill(props: {
  discoverFeedback: DiscoverFeedback
  feedbackAnim: SharedValue<number>
}) {
  const { discoverFeedback, feedbackAnim } = props
  const reduceMotion = useReducedMotion()
  // Reduce Motion: the pill fades without rising.
  const pillMotionStyle = useAnimatedStyle(() => ({
    opacity: feedbackAnim.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - feedbackAnim.value) * 8 }]
  }))
  return (
    <Animated.View
      style={[
        styles.feedbackPill,
        discoverFeedback.tone === "warm"
          ? styles.feedbackPillWarm
          : styles.feedbackPillSoft,
        pillMotionStyle
      ]}
    >
      <Text
        style={[
          styles.feedbackText,
          discoverFeedback.tone === "warm"
            ? styles.feedbackTextWarm
            : null
        ]}
      >
        {discoverFeedback.text}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  feedbackPill: {
    alignSelf: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    marginTop: -uiTheme.spacing.xs,
  },
  feedbackPillSoft: {
    backgroundColor: uiTheme.colors.glass,
    borderColor: uiTheme.colors.glassBorder,
  },
  feedbackPillWarm: {
    backgroundColor: uiTheme.colors.primarySoft,
    borderColor: "#FAD0E3",
  },
  feedbackText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  feedbackTextWarm: {
    color: uiTheme.colors.primaryDeep,
  },
})
