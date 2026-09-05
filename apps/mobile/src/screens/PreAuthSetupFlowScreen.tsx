import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import { StyleSheet } from "react-native"
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from "react-native-reanimated"
import type { UserAvatar } from "../features/avatarV2/avatarV2.types"
import type { UserRoomDecor } from "../features/roomV2/roomV2.types"
import type { PreAuthOnboardingDraft } from "../features/session/preAuthOnboardingDraft"
import type { PreAuthOnboardingResumeStep } from "../features/session/preAuthOnboardingStorage"
import {
  createOnboardingFunnelEvent,
  getPreAuthSetupLayerDirection,
  getPreviousPreAuthSetupStep,
  shouldAcceptRegisterStageChange,
  type PreAuthSetupStep
} from "../features/session/onboardingFlowModel"
import type {
  RegisterAccountInput,
  UpdateSessionProfileInput
} from "../features/session/sessionApi"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { captureProductEvent } from "../analytics/productAnalytics"
import { useReducedMotionPreference } from "../ui/animations"
import { AvatarSetupScreen } from "./AvatarSetupScreen"
import { ProfileSetupScreen } from "./ProfileSetupScreen"
import { RegisterScreen } from "./RegisterScreen"
import { RoomSetupScreen } from "./RoomSetupScreen"

type SetupNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  "PreAuthSetup"
>

export interface PreAuthSetupFlowScreenProps extends SetupNavigationProps {
  initialStep: PreAuthOnboardingResumeStep
  entryMotion?: "world-handoff"
  draft: PreAuthOnboardingDraft<
    UpdateSessionProfileInput,
    UserAvatar,
    UserRoomDecor
  >
  isSubmitting: boolean
  errorMessage: string | null
  onPersistDraft: (
    draft: PreAuthOnboardingDraft<
      UpdateSessionProfileInput,
      UserAvatar,
      UserRoomDecor
    >,
    resumeStep: PreAuthOnboardingResumeStep
  ) => Promise<void>
  onClearDraft: () => Promise<void>
  onRequestVerificationCode: (input: { phoneNumber: string }) => Promise<void>
  onRegister: (input: RegisterAccountInput) => Promise<void>
  onClearError: () => void
}

type PreAuthSetupDraft = PreAuthSetupFlowScreenProps["draft"]

function PersistentStepLayer({
  direction,
  children,
  reduceMotion = false,
  animateOnMount = false
}: {
  direction: -1 | 0 | 1
  children: ReactNode
  reduceMotion?: boolean
  animateOnMount?: boolean
}) {
  const active = direction === 0
  const opacity = useSharedValue(active && !animateOnMount ? 1 : 0)
  const translateY = useSharedValue(reduceMotion ? 0 : direction * 8)
  const didMountRef = useRef(false)

  useLayoutEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      if (active && animateOnMount && !reduceMotion) {
        opacity.value = 0
        opacity.value = withTiming(1, {
          duration: 360,
          easing: Easing.out(Easing.cubic)
        })
      } else if (active) {
        opacity.value = 1
      }
      return
    }
    const duration = reduceMotion ? 120 : active ? 360 : 180
    opacity.value = withTiming(active ? 1 : 0, {
      duration,
      easing: active ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic)
    })
    translateY.value = withTiming(reduceMotion ? 0 : direction * 8, {
      duration,
      easing: Easing.out(Easing.cubic)
    })
  }, [active, animateOnMount, direction, opacity, reduceMotion, translateY])

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }]
    }
  }, [opacity, translateY])

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "yes" : "no-hide-descendants"}
      pointerEvents={active ? "auto" : "none"}
      style={[styles.layer, animatedStyle, active ? styles.activeLayer : null]}
    >
      {children}
    </Animated.View>
  )
}

export function PreAuthSetupFlowScreen({
  navigation,
  initialStep,
  draft,
  isSubmitting,
  errorMessage,
  onPersistDraft,
  onClearDraft,
  onRequestVerificationCode,
  onRegister,
  onClearError,
  entryMotion
}: PreAuthSetupFlowScreenProps) {
  const [step, setStep] = useState<PreAuthSetupStep>(initialStep)
  const [mountedSteps, setMountedSteps] = useState<ReadonlySet<PreAuthSetupStep>>(
    () => new Set([initialStep])
  )
  // Render the destination immediately while persistence runs in the
  // background. The parent draft catches up when onPersistDraft resolves;
  // keeping this optimistic snapshot mounted prevents a blank/remounted stage
  // during the handoff.
  const [optimisticDraft, setOptimisticDraft] = useState<PreAuthSetupDraft | null>(null)
  const renderedDraft = optimisticDraft ?? draft
  const { reduceMotion, isResolved: motionPreferenceResolved } = useReducedMotionPreference()
  const entryProgress = useSharedValue(entryMotion === "world-handoff" ? 0 : 1)
  const transitionLockedStepRef = useRef<PreAuthSetupStep | null>(null)
  const transitionVersionRef = useRef(0)
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve())
  const stepStartedAtRef = useRef(Date.now())

  useLayoutEffect(() => {
    if (entryMotion !== "world-handoff") {
      entryProgress.value = 1
      return
    }
    if (!motionPreferenceResolved) {
      entryProgress.value = 0
      return
    }
    if (reduceMotion) {
      entryProgress.value = 1
      return
    }
    entryProgress.value = 0
    entryProgress.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic)
    })
  }, [entryMotion, entryProgress, motionPreferenceResolved, reduceMotion])

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entryProgress.value,
    transform: [{ translateY: 12 * (1 - entryProgress.value) }]
  }), [entryProgress])

  // AuthEntry can navigate back to an already-mounted PreAuthSetup route.
  // React Navigation updates the route params without remounting this screen,
  // so keep the local state aligned with the requested entry step. This is
  // what makes a second Whoa tap start at profile even after a prior draft had
  // reached room or phone.
  useLayoutEffect(() => {
    transitionVersionRef.current += 1
    transitionLockedStepRef.current = null
    setStep((currentStep) => currentStep === initialStep ? currentStep : initialStep)
    setOptimisticDraft(null)
  }, [initialStep])

  useEffect(() => {
    if (!motionPreferenceResolved) return
    stepStartedAtRef.current = Date.now()
    const event = createOnboardingFunnelEvent("viewed", {
      step,
      resumed: initialStep !== "profile",
      reduceMotion,
      flow: "create-account"
    })
    captureProductEvent(event.name, event.properties)
  }, [initialStep, motionPreferenceResolved, reduceMotion, step])

  useEffect(() => {
    setMountedSteps((currentSteps) =>
      currentSteps.has(step)
        ? currentSteps
        : new Set([...currentSteps, step])
    )
  }, [step])

  const persistDraftInOrder = useCallback((
    nextDraft: PreAuthSetupDraft,
    nextStep: PreAuthOnboardingResumeStep
  ): Promise<void> => {
    const persist = persistenceQueueRef.current.then(
      () => onPersistDraft(nextDraft, nextStep),
      () => onPersistDraft(nextDraft, nextStep)
    )
    persistenceQueueRef.current = persist.catch(() => undefined)
    return persist
  }, [onPersistDraft])

  const moveTo = useCallback(async (
    nextStep: PreAuthOnboardingResumeStep,
    nextDraft = renderedDraft,
    completedStep?: PreAuthSetupStep
  ): Promise<void> => {
    // Debounce only repeated actions from the same visible step. A new step
    // becomes interactive immediately, even if the previous draft write is
    // still queued in storage.
    if (transitionLockedStepRef.current === step) return
    transitionLockedStepRef.current = step
    const transitionVersion = transitionVersionRef.current + 1
    transitionVersionRef.current = transitionVersion
    const previousStep = step
    setOptimisticDraft(nextDraft)
    setStep(nextStep)
    try {
      await persistDraftInOrder(nextDraft, nextStep)
      if (transitionVersionRef.current === transitionVersion) {
        setOptimisticDraft(null)
      }
      if (completedStep) {
        const event = createOnboardingFunnelEvent("completed", {
          step: completedStep,
          elapsedMs: Date.now() - stepStartedAtRef.current,
          resumed: initialStep !== "profile",
          reduceMotion,
          flow: "create-account"
        })
        captureProductEvent(event.name, event.properties)
      }
      if (transitionLockedStepRef.current === step) {
        transitionLockedStepRef.current = null
      }
    } catch (error) {
      if (transitionVersionRef.current === transitionVersion) {
        setOptimisticDraft(null)
        setStep(previousStep)
      }
      if (transitionLockedStepRef.current === step) {
        transitionLockedStepRef.current = null
      }
      throw error
    }
  }, [
    initialStep,
    persistDraftInOrder,
    reduceMotion,
    renderedDraft,
    step
  ])

  const handleRegisterStageChange = useCallback((nextStep: "phone" | "otp") => {
    if (!shouldAcceptRegisterStageChange(step)) return
    if (nextStep === "otp" && step === "phone") {
      const event = createOnboardingFunnelEvent("completed", {
        step: "phone",
        elapsedMs: Date.now() - stepStartedAtRef.current,
        resumed: initialStep !== "profile",
        reduceMotion,
        flow: "create-account"
      })
      captureProductEvent(event.name, event.properties)
    }
    setStep(nextStep)
  }, [initialStep, reduceMotion, step])

  const leaveSetup = useCallback(() => {
    onClearError()
    navigation.navigate("AuthEntry")
  }, [navigation, onClearError])

  const goBack = useCallback(() => {
    const previousStep = getPreviousPreAuthSetupStep(step)
    if (previousStep === null) {
      leaveSetup()
      return
    }
    const resumableStep = previousStep === "otp" ? "phone" : previousStep
    void moveTo(resumableStep)
  }, [leaveSetup, moveTo, step])

  const signOut = useCallback(async () => {
    await onClearDraft()
    navigation.navigate("AuthEntry")
  }, [navigation, onClearDraft])

  const registerNavigation = useMemo(() => ({
    ...navigation,
    goBack
  }), [goBack, navigation])

  const registerRoute = useMemo(() => ({
    key: "pre-auth-setup-register",
    name: "Register" as const,
    params: { intent: "create" as const }
  }), [])

  return (
    <Animated.View style={[styles.root, entryStyle]} testID="pre-auth-setup-flow">
      <PersistentStepLayer
        direction={getPreAuthSetupLayerDirection("profile", step)}
        reduceMotion={reduceMotion}
      >
        <ProfileSetupScreen
          initialProfile={{
            displayName: renderedDraft.profile?.displayName ?? "",
            age: renderedDraft.profile?.age,
            gender: renderedDraft.profile?.gender,
            avatar: { presetId: "dusk" }
          }}
          mode="first-completion"
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          onBack={leaveSetup}
          onComplete={async (profile) => {
            await moveTo("avatar", { ...renderedDraft, profile }, "profile")
          }}
          onSignOut={signOut}
          motionActive={step === "profile"}
        />
      </PersistentStepLayer>

      {mountedSteps.has("avatar") || step === "avatar" ? (
        <PersistentStepLayer
          direction={getPreAuthSetupLayerDirection("avatar", step)}
          reduceMotion={reduceMotion}
          animateOnMount={!mountedSteps.has("avatar")}
        >
          <AvatarSetupScreen
            displayName={renderedDraft.profile?.displayName ?? ""}
            age={renderedDraft.profile?.age}
            initialGender={renderedDraft.profile?.gender}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
            onComplete={async (avatar) => {
              await moveTo("room", { ...renderedDraft, avatar }, "avatar")
            }}
            onBackToProfile={() => { void moveTo("profile") }}
            onEditProfile={() => { void moveTo("profile") }}
            onSignOut={signOut}
            motionActive={step === "avatar"}
          />
        </PersistentStepLayer>
      ) : null}

      {mountedSteps.has("room") || step === "room" ? (
        <PersistentStepLayer
          direction={getPreAuthSetupLayerDirection("room", step)}
          reduceMotion={reduceMotion}
          animateOnMount={!mountedSteps.has("room")}
        >
          <RoomSetupScreen
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
            onBackToAvatar={() => { void moveTo("avatar") }}
            onEditProfile={() => { void moveTo("profile") }}
            onSignOut={signOut}
            completionLabel="Devam et"
            motionActive={step === "room"}
            onComplete={async (room) => {
              await moveTo("phone", { ...renderedDraft, room }, "room")
            }}
          />
        </PersistentStepLayer>
      ) : null}

      {mountedSteps.has("phone") || step === "phone" || step === "otp" ? (
        <PersistentStepLayer
          direction={
            step === "phone" || step === "otp"
              ? 0
              : getPreAuthSetupLayerDirection("phone", step)
          }
          reduceMotion={reduceMotion}
          animateOnMount={!mountedSteps.has("phone")}
        >
          <RegisterScreen
            navigation={registerNavigation as never}
            route={registerRoute}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
            onRequestVerificationCode={onRequestVerificationCode}
            onRegister={async (input) => {
              await onRegister(input)
              const event = createOnboardingFunnelEvent("completed", {
                step: "otp",
                elapsedMs: Date.now() - stepStartedAtRef.current,
                resumed: initialStep !== "profile",
                reduceMotion,
                flow: "create-account"
              })
              captureProductEvent(event.name, event.properties)
            }}
            onClearError={onClearError}
            onCreateFlowStageChange={handleRegisterStageChange}
            createFlowAvatar={renderedDraft.avatar}
            motionActive={step === "phone" || step === "otp"}
          />
        </PersistentStepLayer>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden"
  },
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0
  },
  activeLayer: {
    zIndex: 1
  }
})
