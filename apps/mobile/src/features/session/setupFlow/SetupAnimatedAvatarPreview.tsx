import { useEffect, useState } from "react"
import {
  AppState,
  type AppStateStatus
} from "react-native"
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import type { AvatarAnimationState } from "../../avatarV2/avatarV2.types"
import {
  AvatarPreview2D,
  type AvatarPreview2DProps
} from "../../avatarV2/components/AvatarPreview2D"
import { useReducedMotionPreference } from "../../../ui/animations"
import {
  getSetupCharacterMotionPlan,
  type SetupCharacterMotionVariant
} from "./setupCharacterMotionModel"

interface SetupAnimatedAvatarPreviewProps extends Omit<
  AvatarPreview2DProps,
  "animationState"
> {
  active?: boolean
  variant: SetupCharacterMotionVariant
}

export function SetupAnimatedAvatarPreview({
  active = true,
  variant,
  ...previewProps
}: SetupAnimatedAvatarPreviewProps) {
  const plan = getSetupCharacterMotionPlan(variant)
  const { reduceMotion, isResolved } = useReducedMotionPreference()
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  const [animationState, setAnimationState] = useState<AvatarAnimationState>(
    "idle_front"
  )
  const entrance = useSharedValue(active ? 0 : 1)
  const breath = useSharedValue(0)
  const spriteTravel = useSharedValue(0)
  const canAnimate = active && appState === "active" && isResolved && !reduceMotion

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    cancelAnimation(entrance)
    if (!active || reduceMotion) {
      entrance.value = 1
      return
    }
    entrance.value = 0
    entrance.value = withDelay(plan.entranceDelayMs, withTiming(1, {
      duration: plan.entranceDurationMs,
      easing: Easing.out(Easing.cubic)
    }))
    return () => cancelAnimation(entrance)
  }, [active, entrance, plan.entranceDelayMs, plan.entranceDurationMs, reduceMotion])

  useEffect(() => {
    cancelAnimation(breath)
    if (!canAnimate) {
      breath.value = 0
      setAnimationState("idle_front")
      return
    }
    const halfDuration = plan.breathDurationMs / 2
    breath.value = withRepeat(withSequence(
      withTiming(1, {
        duration: halfDuration,
        easing: Easing.inOut(Easing.sin)
      }),
      withTiming(0, {
        duration: halfDuration,
        easing: Easing.inOut(Easing.sin)
      })
    ), -1, false)
    return () => cancelAnimation(breath)
  }, [breath, canAnimate, plan.breathDurationMs])

  useEffect(() => {
    if (!canAnimate) return
    let spriteTimer: ReturnType<typeof setTimeout> | null = null
    const runSpriteCue = () => {
      setAnimationState(plan.spriteCueState)
      spriteTravel.value = 0
      spriteTravel.value = withSequence(
        withTiming(-1, {
          duration: Math.round(plan.spriteCueDurationMs * 0.22),
          easing: Easing.out(Easing.cubic)
        }),
        withTiming(1, {
          duration: Math.round(plan.spriteCueDurationMs * 0.5),
          easing: Easing.inOut(Easing.sin)
        }),
        withTiming(0, {
          duration: Math.round(plan.spriteCueDurationMs * 0.28),
          easing: Easing.out(Easing.cubic)
        })
      )
      spriteTimer = setTimeout(
        () => setAnimationState("idle_front"),
        plan.spriteCueDurationMs
      )
    }
    const firstSpriteCue = setTimeout(
      runSpriteCue,
      plan.entranceDelayMs + 60
    )
    const cue = setInterval(runSpriteCue, plan.cueIntervalMs)
    return () => {
      clearTimeout(firstSpriteCue)
      if (spriteTimer) clearTimeout(spriteTimer)
      clearInterval(cue)
      cancelAnimation(spriteTravel)
      spriteTravel.value = 0
      setAnimationState("idle_front")
    }
  }, [
    canAnimate,
    plan.cueIntervalMs,
    plan.entranceDelayMs,
    plan.spriteCueDurationMs,
    plan.spriteCueState,
    spriteTravel
  ])

  const motionStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      {
        translateY:
          18 * (1 - entrance.value) - plan.breathOffset * breath.value
      },
      { translateX: plan.spriteTravel * spriteTravel.value },
      {
        scale:
          (0.96 + 0.04 * entrance.value) *
          (1 + (plan.breathScale - 1) * breath.value)
      }
    ]
  }))

  return (
    <Animated.View
      style={motionStyle}
    >
      <AvatarPreview2D
        {...previewProps}
        animationState={animationState}
      />
    </Animated.View>
  )
}
