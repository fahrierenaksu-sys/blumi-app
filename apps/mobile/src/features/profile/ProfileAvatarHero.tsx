import { forwardRef, useImperativeHandle } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated"
import { AvatarShowcase } from "../avatar/components/AvatarShowcase"
import { PROFILE_AVATAR_ASPECT } from "./profileMotionModel"
import { useOwnAvatarLoadout } from "./useOwnAvatarLoadout"

export interface ProfileAvatarHeroHandle {
  /** A tap: a soft glow blooms behind the avatar. */
  cheer: () => void
}

/**
 * The viewer's own full-body avatar on the You page: the showcase still (lead decision 2026-10-11: a live avatar
 * exists only inside rooms), drawn as today's 3/4 still until the look has front art. A tap blooms a glow behind it.
 */
export const ProfileAvatarHero = forwardRef<ProfileAvatarHeroHandle, { width: number; accessibilityLabel: string }>(
  function ProfileAvatarHero(props, ref) {
    const { width } = props
    const height = width * PROFILE_AVATAR_ASPECT
    const loadout = useOwnAvatarLoadout()
    const glow = useSharedValue(0)

    useImperativeHandle(ref, () => ({
      cheer: () => {
        glow.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 620 }))
      }
    }), [glow])

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
        <AvatarShowcase
          loadout={loadout}
          crop="card"
          width={width}
          height={height}
          accessibilityLabel={props.accessibilityLabel}
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
