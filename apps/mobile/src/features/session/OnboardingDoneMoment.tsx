import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  ReduceMotion
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { hapticSuccess } from "../../ui/haptics"
import { animateTo, animateToAfter, useMotion } from "../../ui/motion"
import { MyAvatar } from "../../ui/myAvatar"
import { uiTheme } from "../../ui/theme"
import { getAppLocale } from "./appLocale"
import { getOnboardingDoneCopy, ONBOARDING_DONE_HOLD_MS } from "./onboardingDoneMomentModel"

/**
 * The "you did it" beat after a new account finishes setting up
 * (onboardingDoneMoment): the person's own chibi lands on a soft veil above
 * Discover (bouncy spring, success haptic as it lands), the congratulation
 * fades in under it, and after a short hold the veil and chibi dissolve into
 * Discover, which is already live underneath. A tap anywhere skips it.
 * Reduce Motion: no travel or scale, crossfades only, the haptic stays.
 */
export function OnboardingDoneMoment({ displayName, onDone }: {
  displayName: string
  onDone: () => void
}) {
  const motion = useMotion()
  const [copy] = useState(() => getOnboardingDoneCopy(getAppLocale(), displayName))
  const veil = useSharedValue(0)
  const arrive = useSharedValue(0)
  const leave = useSharedValue(0)
  const words = useSharedValue(0)

  useEffect(() => {
    const reduced = motion.reduceMotion
    arrive.value = animateToAfter(reduced ? 0 : 80, 1, reduced ? motion.crossfade : motion.bouncy, (finished) => {
      "worklet"
      // The success tap lands with the chibi.
      if (finished) scheduleOnRN(hapticSuccess)
    })
    words.value = animateToAfter(reduced ? 0 : 160, 1, motion.fadeIn)
    // Hold, then the chibi settles into Discover a little faster than it came
    // (exits ≈ 0.7× the entrance) while the veil dissolves.
    leave.value = withDelay(ONBOARDING_DONE_HOLD_MS + 320, animateTo(1, reduced ? motion.crossfade : motion.snappy), ReduceMotion.Never)
    veil.value = withSequence(
      animateTo(1, motion.fadeIn),
      withDelay(ONBOARDING_DONE_HOLD_MS + 320, animateTo(0, motion.fadeOut, (finished) => {
        "worklet"
        if (finished) scheduleOnRN(onDone)
      }), ReduceMotion.Never)
    )
  }, [arrive, leave, motion, onDone, veil, words])

  const reduceMotion = motion.reduceMotion
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }))
  const heroStyle = useAnimatedStyle(() => {
    const arriving = arrive.value
    const leaving = Math.min(1, Math.max(0, leave.value))
    if (reduceMotion) {
      return { opacity: Math.min(1, Math.max(0, arriving)) * (1 - leaving), transform: [{ translateY: 0 }, { scale: 1 }] }
    }
    // Rises and grows into place (the bouncy spring may overshoot), then
    // sinks slightly as it hands over to Discover.
    return {
      opacity: Math.min(1, Math.max(0, arriving) * 1.5) * (1 - leaving),
      transform: [
        { translateY: (1 - arriving) * 28 + leaving * 18 },
        { scale: 0.7 + 0.3 * arriving - 0.12 * leaving }
      ]
    }
  })
  const wordsStyle = useAnimatedStyle(() => ({ opacity: words.value }))

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${copy.headline} ${copy.body} ${copy.skipLabel}`}
        onPress={onDone}
        style={styles.press}
      >
        <View style={styles.content}>
          <Animated.View style={heroStyle}>
            <MyAvatar name={displayName} seed={displayName} size={168} ring="strong" />
          </Animated.View>
          <Animated.View style={[styles.words, wordsStyle]}>
            <Text style={styles.headline}>{copy.headline}</Text>
            <Text style={styles.body}>{copy.body}</Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: uiTheme.colors.background
  },
  press: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    alignItems: "center",
    gap: uiTheme.spacing.lg,
    paddingHorizontal: uiTheme.spacing.xl
  },
  words: {
    alignItems: "center",
    gap: uiTheme.spacing.xs
  },
  headline: {
    ...uiTheme.font.display,
    color: uiTheme.colors.textPrimary,
    textAlign: "center",
    fontSize: 34
  },
  body: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  }
})
