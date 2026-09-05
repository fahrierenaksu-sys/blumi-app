import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View
} from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { LinearGradient } from "../../../ui/linearGradient"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { SETUP_MOTION_TIMELINE_MS } from "./setupFlowShellModel"
import { ONBOARDING_PRIMARY_ACTION_LAYOUT } from "../onboardingActionLayout"

interface SetupFlowPrimaryActionProps {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  reduceMotion: boolean
  testID?: string
}

export function SetupFlowPrimaryAction({
  label,
  onPress,
  disabled = false,
  busy = false,
  reduceMotion,
  testID = "setup-flow-primary-action"
}: SetupFlowPrimaryActionProps) {
  const scale = useSharedValue(1)
  const labelProgress = useSharedValue(1)
  const committedLabel = useRef(label)
  const [outgoingLabel, setOutgoingLabel] = useState<string | null>(null)
  const lastPressAt = useRef(0)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(scale)
      cancelAnimation(labelProgress)
      scale.value = 1
      labelProgress.value = 1
      setOutgoingLabel(null)
    }
    return () => {
      cancelAnimation(scale)
      cancelAnimation(labelProgress)
    }
  }, [labelProgress, reduceMotion, scale])

  useLayoutEffect(() => {
    if (committedLabel.current === label) return undefined
    setOutgoingLabel(committedLabel.current)
    committedLabel.current = label
    labelProgress.value = 0
    labelProgress.value = reduceMotion
      ? withTiming(1, { duration: SETUP_MOTION_TIMELINE_MS.reduced })
      : withDelay(
          SETUP_MOTION_TIMELINE_MS.ctaStart,
          withTiming(1, {
            duration:
              SETUP_MOTION_TIMELINE_MS.ctaEnd -
              SETUP_MOTION_TIMELINE_MS.ctaStart,
            easing: Easing.out(Easing.cubic)
          })
        )
    const cleanup = setTimeout(
      () => setOutgoingLabel(null),
      reduceMotion
        ? SETUP_MOTION_TIMELINE_MS.reduced
        : SETUP_MOTION_TIMELINE_MS.total
    )
    return () => clearTimeout(cleanup)
  }, [label, labelProgress, reduceMotion])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }))
  const outgoingLabelStyle = useAnimatedStyle(() => ({
    opacity: 1 - labelProgress.value
  }))
  const incomingLabelStyle = useAnimatedStyle(() => ({
    opacity: labelProgress.value
  }))

  const handlePress = () => {
    const now = Date.now()
    if (now - lastPressAt.current < 600) return
    lastPressAt.current = now
    onPress()
  }

  return (
    <Animated.View style={[styles.root, scaleStyle]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: disabled || busy }}
        disabled={disabled || busy}
        onPress={handlePress}
        onPressIn={() => {
          if (!reduceMotion) {
            scale.value = withTiming(0.985, { duration: 90 })
          }
        }}
        onPressOut={() => {
          scale.value = reduceMotion
            ? 1
            : withSpring(1, { damping: 22, stiffness: 300 })
        }}
        style={styles.pressable}
        testID={testID}
      >
        <LinearGradient
          colors={
            disabled
              ? [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]
              : [uiTheme.colors.actionDark, uiTheme.colors.actionDark]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.surface}
        >
          {busy ? (
            <ActivityIndicator color={uiTheme.colors.textInverted} />
          ) : (
            <View style={styles.labelFrame}>
              {outgoingLabel ? (
              <Animated.Text
                accessible={false}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.25}
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[styles.label, styles.outgoingLabel, outgoingLabelStyle]}
                >
                  {outgoingLabel}
                </Animated.Text>
              ) : null}
              <Animated.Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.25}
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[styles.label, incomingLabelStyle]}
              >
                {label}
              </Animated.Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    height: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    width: "100%"
  },
  pressable: {
    borderRadius: uiTheme.radius.full,
    height: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    overflow: "hidden",
    width: "100%"
  },
  surface: {
    alignItems: "center",
    borderRadius: uiTheme.radius.full,
    height: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.lg,
    width: "100%"
  },
  labelFrame: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    width: "100%"
  },
  label: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textInverted,
    textAlign: "center"
  },
  outgoingLabel: {
    position: "absolute"
  }
})
