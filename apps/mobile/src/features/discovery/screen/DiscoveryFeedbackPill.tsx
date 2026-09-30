import { useCallback, useRef, useState } from "react"
import { Animated, Easing, StyleSheet, Text } from "react-native"
import { uiTheme } from "../../../ui/theme"

export type DiscoverFeedbackTone = "soft" | "warm"

export interface DiscoverFeedback {
  id: number
  text: string
  tone: DiscoverFeedbackTone
}

export type ShowDiscoverFeedback = (text: string, tone: DiscoverFeedbackTone) => void

// Short-lived decision feedback ("Like sent.", "Passed for now."). The latest
// message wins; an older animation never clears a newer message.
export function useDiscoveryFeedback() {
  const [discoverFeedback, setDiscoverFeedback] =
    useState<DiscoverFeedback | null>(null)
  const feedbackAnim = useRef(new Animated.Value(0)).current
  const feedbackCounterRef = useRef(0)

  const showDiscoverFeedback = useCallback(
    (text: string, tone: DiscoverFeedbackTone): void => {
      feedbackCounterRef.current += 1
      const nextId = feedbackCounterRef.current
      setDiscoverFeedback({ id: nextId, text, tone })
      feedbackAnim.stopAnimation()
      feedbackAnim.setValue(0)
      Animated.sequence([
        Animated.timing(feedbackAnim, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.delay(1050),
        Animated.timing(feedbackAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        })
      ]).start(() => {
        setDiscoverFeedback((current) =>
          current?.id === nextId ? null : current
        )
      })
    },
    [feedbackAnim]
  )

  return { discoverFeedback, feedbackAnim, showDiscoverFeedback }
}

export function DiscoveryFeedbackPill(props: {
  discoverFeedback: DiscoverFeedback
  feedbackAnim: Animated.Value
}) {
  const { discoverFeedback, feedbackAnim } = props
  return (
    <Animated.View
      style={[
        styles.feedbackPill,
        discoverFeedback.tone === "warm"
          ? styles.feedbackPillWarm
          : styles.feedbackPillSoft,
        {
          opacity: feedbackAnim,
          transform: [
            {
              translateY: feedbackAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0]
              })
            }
          ]
        }
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
