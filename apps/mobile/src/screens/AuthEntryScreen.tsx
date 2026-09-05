import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import {
  useEntranceAnimation,
  useReducedMotionPreference
} from "../ui/animations"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { SoftBlobBackground } from "../ui/backgrounds"
import { blumiEntryTheme as uiTheme } from "../ui/theme"
import { hapticLight } from "../ui/haptics"
import { captureProductEvent } from "../analytics/productAnalytics"
import { IS_BLUMI_DEMO_ENABLED } from "../config/env"
import { getAuthEntryCopy } from "../features/session/authEntryCopy"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { resolveCompactViewportLayout } from "../ui/compactViewportLayout"
import {
  ONBOARDING_PRIMARY_ACTION_LAYOUT,
  getOnboardingPrimaryActionMetrics
} from "../features/session/onboardingActionLayout"
import { OnboardingWorldScene } from "../features/session/OnboardingWorldScene"
import {
  createOnboardingIntroState,
  ONBOARDING_INTRO_TIMELINE_MS,
  ONBOARDING_SCENE_HANDOFF_MS,
  reduceOnboardingIntro
} from "../features/session/onboardingIntroModel"
import { continueFromOnboardingIntro } from "../features/session/onboardingIntroAction"
import {
  getCreateAccountInitialStep,
  getUnauthenticatedOnboardingDestination
} from "../features/session/onboardingFlowModel"
import type { PreAuthOnboardingResumeStep } from "../features/session/preAuthOnboardingStorage"

type AuthEntryScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "AuthEntry"
> & {
  isSubmitting: boolean
  errorMessage: string | null
  onStartDemo: () => Promise<void>
  onClearError: () => void
  hasSeenIntro: boolean
  onCompleteIntro: () => Promise<void>
  createInitialStep?: PreAuthOnboardingResumeStep
}

function waitForHandoff(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

interface CinematicActionButtonProps {
  busy?: boolean
  compact: boolean
  disabled?: boolean
  label: string
  onPress: () => void
  testID: string
}

function CinematicActionButton({
  busy = false,
  compact,
  disabled = false,
  label,
  onPress,
  testID
}: CinematicActionButtonProps) {
  const entrance = useEntranceAnimation({ delay: 0, duration: 240, translateY: 10 })
  return (
    <Animated.View style={[styles.cinematicActionContainer, entrance]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || disabled}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.cinematicAction,
          compact ? styles.controlCompact : null,
          pressed ? styles.cinematicActionPressed : null,
          busy ? styles.cinematicActionBusy : null,
          disabled ? styles.cinematicActionDisabled : null
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.25}
            minimumFontScale={0.82}
            numberOfLines={1}
            style={styles.cinematicActionText}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  )
}

function PreludeAccountLink({
  disabled,
  label,
  onPress
}: {
  disabled: boolean
  label: string
  onPress: () => void
}) {
  const entrance = useEntranceAnimation({ delay: 120, duration: 240, translateY: 8 })
  return (
    <Animated.View style={entrance}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.accountLink,
          pressed ? styles.accountLinkPressed : null,
          disabled ? styles.accountLinkDisabled : null
        ]}
        testID="onboarding-already-have-account"
      >
        <Text maxFontSizeMultiplier={1.35} style={styles.accountLinkText}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

export function AuthEntryScreen({
  navigation,
  isSubmitting,
  errorMessage,
  onStartDemo,
  onClearError,
  hasSeenIntro,
  onCompleteIntro,
  createInitialStep = "profile"
}: AuthEntryScreenProps) {
  const {
    width: viewportWidth,
    height: viewportHeight,
    fontScale
  } = useWindowDimensions()
  const viewportLayout = resolveCompactViewportLayout(viewportHeight, fontScale)
  const primaryActionMetrics = getOnboardingPrimaryActionMetrics(viewportWidth)
  const {
    reduceMotion,
    isResolved: motionPreferenceResolved
  } = useReducedMotionPreference()
  const [introState, dispatchIntro] = useReducer(
    reduceOnboardingIntro,
    undefined,
    () => createOnboardingIntroState(hasSeenIntro, reduceMotion)
  )
  const [isCompletingIntro, setIsCompletingIntro] = useState(false)
  // Persisted onboarding completion must not fast-forward the visual opening.
  // Every fresh mount preserves scan -> brand -> character choreography.
  const [arePreludeActionsVisible, setArePreludeActionsVisible] = useState(false)
  const [isPreludeSecondaryVisible, setIsPreludeSecondaryVisible] = useState(false)
  const [isPreludeInteractive, setIsPreludeInteractive] = useState(false)
  const [isPreludeActionsExiting, setIsPreludeActionsExiting] = useState(false)
  const [isWhoaVisible, setIsWhoaVisible] = useState(false)
  const preludeActionsExit = useRef(new Animated.Value(0)).current
  const didCaptureWorldBeat = useRef(false)
  const handlePreludeActionsVisible = useCallback(() => setArePreludeActionsVisible(true), [])
  const handlePreludeSecondaryVisible = useCallback(
    () => setIsPreludeSecondaryVisible(true),
    []
  )
  const handleGreetingFinished = useCallback(() => setIsPreludeInteractive(true), [])
  const handleWhoaVisible = useCallback(() => setIsWhoaVisible(true), [])
  const copy = getAuthEntryCopy(resolveAccountRecoveryLocale(
    getNativeAppLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale
  ))
  const revealWorld = useCallback(() => {
    if (isPreludeActionsExiting) return
    hapticLight()
    onClearError()
    setIsWhoaVisible(false)
    if (!didCaptureWorldBeat.current) {
      didCaptureWorldBeat.current = true
      captureProductEvent("onboarding_step_viewed", {
        step: "intro_world",
        flow: "auth_entry_intro",
        reduce_motion: reduceMotion
      })
    }
    setIsPreludeActionsExiting(true)
    if (reduceMotion) {
      dispatchIntro({ type: "reveal-world", reduceMotion })
      setIsPreludeActionsExiting(false)
      return
    }
    preludeActionsExit.setValue(0)
    Animated.timing(preludeActionsExit, {
      toValue: 1,
      duration: ONBOARDING_SCENE_HANDOFF_MS.actionResponse,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false
    }).start(({ finished }) => {
      if (!finished) return
      dispatchIntro({ type: "reveal-world", reduceMotion })
      setIsPreludeActionsExiting(false)
      preludeActionsExit.setValue(0)
    })
  }, [isPreludeActionsExiting, onClearError, preludeActionsExit, reduceMotion])
  const openCharacterGreeting = useCallback(() => {
    if (!isPreludeInteractive || isPreludeActionsExiting) return
    dispatchIntro({ type: "open-greeting" })
  }, [isPreludeActionsExiting, isPreludeInteractive])
  const openDemo = useCallback(async (): Promise<void> => {
    if (!IS_BLUMI_DEMO_ENABLED || isCompletingIntro || isSubmitting) return
    onClearError()
    setIsCompletingIntro(true)
    try {
      await onStartDemo()
    } finally {
      setIsCompletingIntro(false)
    }
  }, [isCompletingIntro, isSubmitting, onClearError, onStartDemo])
  const openRegister = useCallback(async (intent: "create" | "sign-in"): Promise<void> => {
    if (isCompletingIntro) return
    const startsWorldHandoff =
      !reduceMotion &&
      intent === "create" &&
      (isWhoaVisible || introState.phase === "world-ready")
    const canFadeOutgoingWorld = introState.phase === "world-ready"
    onClearError()
    setIsCompletingIntro(true)
    try {
      await continueFromOnboardingIntro({
        requiresCompletion: !hasSeenIntro,
        completeIntro: onCompleteIntro,
        beforeNavigate: startsWorldHandoff
          ? async () => {
              // The CTA is intentionally available during the population and
              // chase beats. Only the settled world has an authored outgoing
              // fade; those earlier beats hand directly into the destination
              // entrance so we do not add an unexplained 200ms dead frame.
              if (!canFadeOutgoingWorld) return
              dispatchIntro({ type: "handoff-started" })
              await waitForHandoff(ONBOARDING_INTRO_TIMELINE_MS.handoffDuration)
            }
          : undefined,
        navigate: () => {
          if (!startsWorldHandoff) {
            dispatchIntro({ type: "intro-completed" })
          }
          const destination = getUnauthenticatedOnboardingDestination(intent)
          if (destination === "PreAuthSetup") {
            navigation.navigate("PreAuthSetup", {
              initialStep: getCreateAccountInitialStep(createInitialStep),
              ...(startsWorldHandoff ? { entryMotion: "world-handoff" as const } : {})
            })
          } else {
            navigation.navigate(
              "Register",
              startsWorldHandoff
                ? { intent, entryMotion: "world-handoff" }
                : { intent }
            )
          }
        }
      })
    } catch {
      if (startsWorldHandoff) {
        dispatchIntro({ type: "handoff-cancelled" })
      }
      // The session boundary publishes a localized, user-safe error.
    } finally {
      setIsCompletingIntro(false)
    }
  }, [
    introState.phase,
    hasSeenIntro,
    isCompletingIntro,
    isWhoaVisible,
    navigation,
    onClearError,
    onCompleteIntro,
    createInitialStep,
    reduceMotion
  ])

  useEffect(() => {
    if (!hasSeenIntro || introState.phase !== "handoff") return undefined
    return navigation.addListener("focus", () => {
      dispatchIntro({ type: "intro-completed" })
    })
  }, [hasSeenIntro, introState.phase, navigation])

  const isGreeting = introState.phase === "greeting"
  const isCharacterGreeting = introState.phase === "character-greeting"
  const isPrelude = isGreeting || isCharacterGreeting
  const isWorldReady = introState.phase === "world-ready"
  const shouldRenderPreludeActions =
    (arePreludeActionsVisible || isPreludeSecondaryVisible) &&
    isPrelude
  const shouldRenderWhoaAction = isWorldReady || isWhoaVisible
  return (
    <View style={[styles.root, styles.rootCinematic]}>
      <SoftBlobBackground
        animated={false}
        style={styles.cinematicBackdrop}
        variant="register"
      />
      <SafeAreaView
        contentGutter={false}
          style={[
            styles.safe,
            viewportLayout.compact ? styles.safeCompact : null,
            { paddingHorizontal: primaryActionMetrics.horizontalInset }
        ]}
      >
        <OnboardingWorldScene
          compact={viewportLayout.compact}
          copy={copy}
          introState={introState}
          motionPreferenceResolved={motionPreferenceResolved}
          onEvent={dispatchIntro}
          onPreludeActionsVisible={handlePreludeActionsVisible}
          onPreludeSecondaryActionVisible={handlePreludeSecondaryVisible}
          onGreetingFinished={handleGreetingFinished}
          onWhoaVisible={handleWhoaVisible}
          reduceMotion={reduceMotion}
        />

        <View
          style={[
            styles.actions,
            styles.cinematicActions,
            viewportLayout.compact ? styles.actionsCompact : null
          ]}
        >
          {errorMessage && (
            isPrelude ||
            isWorldReady
          ) ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.cinematicActionSlot}>
              {shouldRenderPreludeActions ? (
                <Animated.View
                  style={[
                    styles.preludeActions,
                    !reduceMotion
                      ? {
                          opacity: preludeActionsExit.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0]
                          }),
                          transform: [{
                            translateY: preludeActionsExit.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 12]
                            })
                          }]
                        }
                      : null
                  ]}
                >
                  {isGreeting && isPreludeSecondaryVisible && !isPreludeActionsExiting ? (
                    <PreludeAccountLink
                      disabled={
                        isPreludeActionsExiting ||
                        isCompletingIntro ||
                        isSubmitting
                      }
                      label={copy.alreadyHaveAccount}
                      onPress={() => { void openRegister("sign-in") }}
                    />
                  ) : null}
                  {IS_BLUMI_DEMO_ENABLED ? (
                    <PreludeAccountLink
                      disabled={isCompletingIntro || isSubmitting}
                      label={copy.tryDemoFirst}
                      onPress={() => { void openDemo() }}
                    />
                  ) : null}
                  {arePreludeActionsVisible ? (
                    <CinematicActionButton
                      compact={viewportLayout.compact}
                      disabled={!isPreludeInteractive || isPreludeActionsExiting}
                      label={isCharacterGreeting
                        ? copy.introGreetingAction
                        : copy.letsGetStarted}
                      onPress={isCharacterGreeting ? revealWorld : openCharacterGreeting}
                      testID={isCharacterGreeting
                        ? "onboarding-character-greeting-action"
                        : "onboarding-get-started"}
                    />
                  ) : (
                    <View style={styles.cinematicPrimaryPlaceholder} />
                  )}
                </Animated.View>
              ) : shouldRenderWhoaAction ? (
                <CinematicActionButton
                  busy={isCompletingIntro || isSubmitting}
                  compact={viewportLayout.compact}
                  label={copy.whoa}
                  onPress={() => { void openRegister("create") }}
                  testID="onboarding-whoa"
                />
              ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.backgroundWarm
  },
  rootCinematic: {
    backgroundColor: "transparent"
  },
  cinematicBackdrop: {
    opacity: 0.46
  },
  safe: {
    flex: 1,
    paddingHorizontal: ONBOARDING_PRIMARY_ACTION_LAYOUT.horizontalInset.regular,
    paddingTop: uiTheme.spacing.lg,
    // Match the setup shell's primary-action rail so Whoa and the following
    // onboarding CTAs keep the exact same safe-area bottom edge.
    paddingBottom: ONBOARDING_PRIMARY_ACTION_LAYOUT.bottomInset
  },
  safeCompact: {
    paddingTop: uiTheme.spacing.sm
  },
  actions: {
    gap: uiTheme.spacing.sm
  },
  cinematicActions: {
    minHeight: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    justifyContent: "flex-end"
  },
  cinematicActionSlot: {
    minHeight: 112,
    width: "100%",
    justifyContent: "flex-end"
  },
  preludeActions: {
    width: "100%",
    minHeight: 108,
    gap: uiTheme.spacing.xs,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  accountLink: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.lg
  },
  accountLinkPressed: { opacity: 0.62 },
  accountLinkDisabled: { opacity: 0.45 },
  accountLinkText: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  actionsCompact: {
    gap: uiTheme.spacing.xs
  },
  cinematicAction: {
    minHeight: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    paddingHorizontal: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: uiTheme.colors.actionDark,
    ...uiTheme.shadow.deep
  },
  cinematicActionContainer: { width: "100%" },
  cinematicPrimaryPlaceholder: {
    width: "100%",
    minHeight: ONBOARDING_PRIMARY_ACTION_LAYOUT.height
  },
  cinematicActionText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    letterSpacing: -0.1
  },
  cinematicActionPressed: {
    backgroundColor: uiTheme.colors.actionDarkPressed,
    opacity: 0.94,
    transform: [{ scale: 0.988 }]
  },
  cinematicActionBusy: {
    opacity: 0.72
  },
  cinematicActionDisabled: { opacity: 0.78 },
  controlCompact: {
    minHeight: ONBOARDING_PRIMARY_ACTION_LAYOUT.height
  },
  error: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk,
    textAlign: "center"
  }
})
