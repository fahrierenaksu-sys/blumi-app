import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import Reanimated, { useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withTiming } from "react-native-reanimated"
import { AVATAR_STILL_MANIFEST, resolveAvatarStillLayers, type AvatarLoadoutCoercionHints } from "@blumi/domain"
import type { AvatarLiveScope } from "../model/avatarLiveBudget"
import { avatarStillWindow, layoutAvatarStill } from "../model/avatarStillLayout"
import { resolveAvatarDraw } from "../model/resolveAvatarDraw"
import { Avatar25Canvas, AVATAR25_POSES, type Avatar25Instance } from "../renderer/Avatar25Canvas"
import { AVATAR_RIG_DATA } from "../renderer/avatar25Assets"
import { stepBreathWeight } from "../renderer/avatar25Life"
import { AvatarStill } from "./AvatarStill"
import { useAvatarLiveSlot } from "./useAvatarLiveSlot"

/** Above this height (pt) the live surface is capped at 2x pixel ratio (plan 2.2 memory budget). */
const PIXEL_RATIO_CAP_ABOVE_PT = 250
const PIXEL_RATIO_CAP = 2
const CROSS_FADE_MS = 160
const POSE_STAND = AVATAR25_POSES.indexOf("stand")

export interface AvatarHeroProps {
  loadout: unknown
  hints?: AvatarLoadoutCoercionHints
  width: number
  height: number
  mirror?: boolean
  /**
   * Opt-in live canvas (plan 2.2): the scope it counts against, and whether this hero is focused AND shown right
   * now. Without both, or without a grant from the budget, the identical still shows.
   */
  liveScope?: AvatarLiveScope
  liveActive?: boolean
  reduceMotion?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

/** The full-body avatar: the baked still first, cross-fading to a live 2.5D canvas when the live budget grants one. */
export const AvatarHero = memo(function AvatarHero(props: AvatarHeroProps) {
  const { loadout, hints, width, height, mirror = false, reduceMotion = false } = props
  const granted = useAvatarLiveSlot(props.liveScope, props.liveActive === true)
  const still = useMemo(() => resolveAvatarStillLayers(loadout, "full", { hints, mirror }), [hints, loadout, mirror])
  const layout = useMemo(
    () => layoutAvatarStill(still, avatarStillWindow(still, "full"), { width, height }, AVATAR_STILL_MANIFEST.bodies[still.rig]),
    [height, still, width]
  )
  const spec = useMemo(() => resolveAvatarDraw(AVATAR_RIG_DATA, { loadout, hints, direction: mirror ? "right" : "front" }), [hints, loadout, mirror])
  const instances = useMemo((): Avatar25Instance[] => {
    if (!layout.ground || !layout.figureHeight) return []
    // the still is mirrored by flipping its box: the ground point flips with it
    const groundX = mirror ? width - layout.ground.x : layout.ground.x
    return [{
      key: "hero",
      rig: spec.rig,
      view: "front",
      mirror: spec.mirror,
      itemIds: spec.itemIds,
      anchorX: groundX / width,
      anchorY: layout.ground.y / height,
      heightPx: layout.figureHeight,
      lifeSeed: 0.5
    }]
  }, [height, layout.figureHeight, layout.ground, mirror, spec, width])

  const liveOpacity = useSharedValue(0)
  const stillOpacity = useSharedValue(1)
  const [failed, setFailed] = useState(false)
  const onReady = useCallback(() => {
    liveOpacity.value = withTiming(1, { duration: CROSS_FADE_MS })
    stillOpacity.value = withDelay(CROSS_FADE_MS, withTiming(0, { duration: 0 }))
  }, [liveOpacity, stillOpacity])
  const onError = useCallback(() => setFailed(true), [])
  const showLive = granted && !failed && instances.length > 0
  const liveStyle = useAnimatedStyle(() => ({ opacity: liveOpacity.value }))
  const stillStyle = useAnimatedStyle(() => ({ opacity: showLive ? stillOpacity.value : 1 }), [showLive])
  useEffect(() => {
    // back to the still (grant lost, blur, error): the next live canvas fades in again
    if (showLive) return
    liveOpacity.value = 0
    stillOpacity.value = 1
  }, [liveOpacity, showLive, stillOpacity])

  return (
    <View
      accessible={props.accessibilityLabel !== undefined}
      accessibilityLabel={props.accessibilityLabel}
      pointerEvents="none"
      style={[{ width, height }, props.style]}
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, stillStyle]}>
        <AvatarStill loadout={loadout} hints={hints} crop="full" width={width} height={height} mirror={mirror} />
      </Reanimated.View>
      {showLive ? (
        <Reanimated.View style={[StyleSheet.absoluteFill, liveStyle]}>
          <HeroCanvas
            instances={instances}
            rig={spec.rig}
            reduceMotion={reduceMotion}
            maxPixelRatio={height > PIXEL_RATIO_CAP_ABOVE_PT ? PIXEL_RATIO_CAP : undefined}
            onReady={onReady}
            onError={onError}
          />
        </Reanimated.View>
      ) : null}
    </View>
  )
})

/** The live idle: standing, breathing in from 0 and blinking on a clock that starts at frame 0 (= the still). */
function HeroCanvas(props: {
  instances: Avatar25Instance[]
  rig: Avatar25Instance["rig"]
  reduceMotion: boolean
  maxPixelRatio?: number
  onReady: () => void
  onError: (error: Error) => void
}) {
  const pose = useSharedValue(POSE_STAND)
  const walkCycles = useSharedValue(0)
  const walkWeight = useSharedValue(0)
  const waveStartMs = useSharedValue(-1)
  const breathWeight = useSharedValue(0)
  const breath = AVATAR_RIG_DATA[props.rig ?? "female"].views.front.breath
  const breathes = !props.reduceMotion && (breath?.poses.includes("stand") ?? false)
  const fadeS = breath?.fadeS ?? 0
  useFrameCallback((info) => {
    "worklet"
    const next = stepBreathWeight(breathWeight.value, breathes, (info.timeSincePreviousFrame ?? 16.7) / 1000, fadeS)
    if (next !== breathWeight.value) breathWeight.value = next
  })
  return (
    <Avatar25Canvas
      instances={props.instances}
      driver={{ pose, walkCycles, walkWeight, waveStartMs, breathWeight }}
      reduceMotion={props.reduceMotion}
      clockStartsAtMount
      maxPixelRatio={props.maxPixelRatio}
      onReady={props.onReady}
      onError={props.onError}
    />
  )
}
