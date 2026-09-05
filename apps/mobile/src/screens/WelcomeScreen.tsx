import { useCallback, useEffect, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { SoftBlobBackground } from "../ui/backgrounds"
import { BrandMark } from "../ui/brandMark"
import { LinearGradient } from "../ui/linearGradient"
import { useReducedMotion } from "../ui/animations"
import { blumiEntryTheme as uiTheme } from "../ui/theme"

interface WelcomeScreenProps {
  isSubmitting: boolean
  errorMessage: string | null
  onComplete: () => Promise<void>
}

const STEPS = [
  {
    icon: "person-circle-outline",
    title: "Start with your profile",
    body: "Choose a public name and the details that help people get to know you."
  },
  {
    icon: "color-palette-outline",
    title: "Lead with your avatar",
    body: "Build an avatar that feels like you. Discover shared vibes without the pressure."
  },
  {
    icon: "chatbubble-ellipses-outline",
    title: "Match, then chat",
    body: "When the vibe is mutual, begin a low-pressure conversation and take it at your pace."
  },
  {
    icon: "sparkles-outline",
    title: "Keep your world fresh",
    body: "Update your look whenever you want and show up with a vibe that feels current."
  }
] as const satisfies readonly {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}[]

/* ─── Animated dot component ─────────────────────────────────── */

function AnimatedDot({
  active,
  reduceMotion
}: {
  active: boolean
  reduceMotion: boolean
}) {
  const widthAnim = useRef(new Animated.Value(active ? 28 : 8)).current
  const opacityAnim = useRef(new Animated.Value(active ? 1 : 0.45)).current

  useEffect(() => {
    if (reduceMotion) {
      widthAnim.stopAnimation()
      opacityAnim.stopAnimation()
      widthAnim.setValue(active ? 28 : 8)
      opacityAnim.setValue(active ? 1 : 0.45)
      return
    }
    const animation = Animated.parallel([
      Animated.spring(widthAnim, {
        toValue: active ? 28 : 8,
        damping: uiTheme.animation.spring.damping,
        stiffness: uiTheme.animation.spring.stiffness,
        mass: uiTheme.animation.spring.mass,
        useNativeDriver: false
      }),
      Animated.timing(opacityAnim, {
        toValue: active ? 1 : 0.45,
        duration: uiTheme.animation.durationNormal,
        useNativeDriver: false
      })
    ])
    animation.start()
    return () => animation.stop()
  }, [active, opacityAnim, reduceMotion, widthAnim])

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: widthAnim,
          opacity: opacityAnim
        }
      ]}
    >
      {active ? (
        <LinearGradient
          colors={uiTheme.gradients.primary}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.dotGradient}
        />
      ) : (
        <View style={styles.dotInactive} />
      )}
    </Animated.View>
  )
}

/* ─── Main screen ─────────────────────────────────────────────── */

export function WelcomeScreen(props: WelcomeScreenProps) {
  const { errorMessage, isSubmitting, onComplete } = props
  const reduceMotion = useReducedMotion()
  const [currentStep, setCurrentStep] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current

  // Step card entrance: scale + opacity spring
  const cardScale = useRef(new Animated.Value(1)).current
  const cardOpacity = useRef(new Animated.Value(1)).current

  // Brand row entrance animation
  const brandTranslateY = useRef(new Animated.Value(-18)).current
  const brandOpacity = useRef(new Animated.Value(0)).current

  // Button press scale
  const buttonScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduceMotion) {
      brandTranslateY.stopAnimation()
      brandOpacity.stopAnimation()
      brandTranslateY.setValue(0)
      brandOpacity.setValue(1)
      return
    }
    const animation = Animated.parallel([
      Animated.spring(brandTranslateY, {
        toValue: 0,
        damping: uiTheme.animation.springGentle.damping,
        stiffness: uiTheme.animation.springGentle.stiffness,
        mass: uiTheme.animation.springGentle.mass,
        useNativeDriver: true
      }),
      Animated.timing(brandOpacity, {
        toValue: 1,
        duration: uiTheme.animation.durationEntrance,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      })
    ])
    animation.start()
    return () => animation.stop()
  }, [brandOpacity, brandTranslateY, reduceMotion])

  const animateCardEntrance = useCallback(() => {
    if (reduceMotion) {
      cardScale.stopAnimation()
      cardOpacity.stopAnimation()
      cardScale.setValue(1)
      cardOpacity.setValue(1)
      return
    }
    cardScale.setValue(0.92)
    cardOpacity.setValue(0)
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        damping: uiTheme.animation.springBouncy.damping,
        stiffness: uiTheme.animation.springBouncy.stiffness,
        mass: uiTheme.animation.springBouncy.mass,
        useNativeDriver: true
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: uiTheme.animation.durationNormal,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      })
    ]).start()
  }, [cardOpacity, cardScale, reduceMotion])

  const goToStep = useCallback(
    (step: number) => {
      if (reduceMotion) {
        fadeAnim.stopAnimation()
        fadeAnim.setValue(1)
        setCurrentStep(step)
        return
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true
      }).start(() => {
        setCurrentStep(step)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }).start()
        animateCardEntrance()
      })
    },
    [animateCardEntrance, fadeAnim, reduceMotion]
  )

  const completeWelcome = useCallback(() => {
    if (isSubmitting) return
    void onComplete().catch(() => undefined)
  }, [isSubmitting, onComplete])

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1)
    } else {
      completeWelcome()
    }
  }, [completeWelcome, currentStep, goToStep])

  const handleButtonPressIn = useCallback(() => {
    if (reduceMotion) return
    Animated.spring(buttonScale, {
      toValue: uiTheme.animation.scalePress,
      damping: uiTheme.animation.spring.damping,
      stiffness: uiTheme.animation.spring.stiffness,
      useNativeDriver: true
    }).start()
  }, [buttonScale, reduceMotion])

  const handleButtonPressOut = useCallback(() => {
    if (reduceMotion) {
      buttonScale.stopAnimation()
      buttonScale.setValue(1)
      return
    }
    Animated.spring(buttonScale, {
      toValue: 1,
      damping: uiTheme.animation.spring.damping,
      stiffness: uiTheme.animation.spring.stiffness,
      useNativeDriver: true
    }).start()
  }, [buttonScale, reduceMotion])

  const isLast = currentStep === STEPS.length - 1

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="bootstrap" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        {/* Brand row with entrance animation */}
        <Animated.View
          style={[
            styles.brandRow,
            {
              opacity: brandOpacity,
              transform: [{ translateY: brandTranslateY }]
            }
          ]}
        >
          <BrandMark size={36} />
          <Text style={styles.brandText}>Blumi</Text>
        </Animated.View>

        {/* Step card with scale + opacity spring entrance */}
        <Animated.View
          style={[
            styles.contentWrap,
            {
              opacity: fadeAnim,
              transform: [{ scale: cardScale }]
            }
          ]}
        >
          <Animated.View style={[styles.stepCard, { opacity: cardOpacity }]}>
            {/* Gradient icon circle with glow */}
            <View style={styles.iconCircleOuter}>
              <LinearGradient
                colors={uiTheme.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <Ionicons
                  accessible={false}
                  name={STEPS[currentStep].icon}
                  size={34}
                  color={uiTheme.colors.textInverted}
                />
              </LinearGradient>
            </View>
            <Text style={styles.stepTitle}>{STEPS[currentStep].title}</Text>
            <Text style={styles.stepBody}>{STEPS[currentStep].body}</Text>
          </Animated.View>
        </Animated.View>

        {/* Animated dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <AnimatedDot
              key={i}
              active={i === currentStep}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
          <Animated.View
            style={[
              styles.primaryButtonWrap,
              { transform: [{ scale: buttonScale }] }
            ]}
          >
            <Pressable
              accessibilityLabel={
                isLast ? "Finish Blumi introduction" : "Next introduction step"
              }
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleNext}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.primaryButtonPressed : null
              ]}
              testID="welcome-primary-action"
            >
              <LinearGradient
                colors={uiTheme.gradients.primary}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {isSubmitting
                    ? "Saving..."
                    : isLast
                      ? "Build my vibe"
                      : "Next"}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {!isLast ? (
            <Pressable
              accessibilityLabel="Skip Blumi introduction"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={completeWelcome}
              hitSlop={8}
              testID="welcome-skip-action"
            >
              <Text style={styles.skipText}>Skip intro</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.md
  },
  brandText: {
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.heading,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  contentWrap: {
    flex: 1,
    justifyContent: "center"
  },
  stepCard: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    padding: uiTheme.spacing.xl,
    alignItems: "center",
    gap: uiTheme.spacing.md,
    ...uiTheme.shadow.deep
  },
  iconCircleOuter: {
    borderRadius: 44,
    ...uiTheme.shadow.glow
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  stepTitle: {
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.title,
    textAlign: "center"
  },
  stepBody: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.body,
    textAlign: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: uiTheme.spacing.lg
  },
  dot: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden"
  },
  dotGradient: {
    flex: 1,
    borderRadius: 4,
    ...uiTheme.shadow.glowSubtle
  },
  dotInactive: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: uiTheme.colors.border
  },
  actions: {
    gap: uiTheme.spacing.md,
    alignItems: "center",
    paddingBottom: uiTheme.spacing.lg
  },
  primaryButtonWrap: {
    width: "100%",
    ...uiTheme.shadow.glow
  },
  primaryButton: {
    width: "100%",
    borderRadius: uiTheme.radius.full,
    overflow: "hidden"
  },
  primaryButtonPressed: {
    opacity: 0.88
  },
  primaryButtonGradient: {
    width: "100%",
    minHeight: 56,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: uiTheme.spacing.md
  },
  primaryButtonText: {
    color: "#FFFFFF",
    ...uiTheme.font.bodyBold,
    fontWeight: "800"
  },
  skipText: {
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.bodySmall,
    fontWeight: "600"
  },
  errorText: {
    color: uiTheme.colors.dangerInk,
    ...uiTheme.font.bodySmall,
    textAlign: "center"
  }
})
