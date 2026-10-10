import { forwardRef, useImperativeHandle, useState } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated"
import { AvatarHero } from "../avatar/components/AvatarHero"
import { useReducedMotion } from "../../ui/animations"
import { PROFILE_AVATAR_ASPECT } from "./profileMotionModel"
import { useOwnAvatarLoadout } from "./useOwnAvatarLoadout"

export interface ProfileAvatarHeroHandle {
  /** A tap: the avatar waves once (a soft glow instead under Reduce Motion, or while the baked still shows). */
  cheer: () => void
}

/**
 * The viewer's own full-body 2.5D avatar on the You page. It is the page's one live canvas (`active` = the page is
 * focused): the baked still first, then the live idle (breathing, blinking). A tap plays one wave and a glow
 * behind her; Reduce Motion keeps the glow only.
 */
export const ProfileAvatarHero = forwardRef<ProfileAvatarHeroHandle, { width: number; active: boolean }>(
  function ProfileAvatarHero(props, ref) {
    const { width, active } = props
    const height = width * PROFILE_AVATAR_ASPECT
    const reduceMotion = useReducedMotion()
    const loadout = useOwnAvatarLoadout()
    const [waveSignal, setWaveSignal] = useState(0)
    const glow = useSharedValue(0)

    useImperativeHandle(ref, () => ({
      cheer: () => {
        glow.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 620 }))
        if (!reduceMotion) setWaveSignal((count) => count + 1)
      }
    }), [glow, reduceMotion])

    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }))

    return (
      <View style={[styles.stage, { width, height: height + 18 }]} pointerEvents="none">
        <Animated.View
          style={[
            styles.cheerGlow,
            { width: width * 1.1, height: width * 1.1, borderRadius: width * 0.55, top: height * 0.12 },
            glowStyle
          ]}
        />
        <AvatarHero
          loadout={loadout}
          width={width}
          height={height}
          liveScope="screen"
          liveActive={active}
          reduceMotion={reduceMotion}
          waveSignal={waveSignal}
        />
      </View>
    )
  }
)

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    justifyContent: "flex-start"
  },
  cheerGlow: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)"
  }
})
