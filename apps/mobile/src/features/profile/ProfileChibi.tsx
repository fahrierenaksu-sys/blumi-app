import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../avatarV2/room/components/RoomAvatarRenderer2D"
import { useAvatarV2 } from "../avatarV2/state/AvatarV2Provider"
import { useReducedMotion } from "../../ui/animations"
import {
  PROFILE_CHIBI_ASPECT,
  PROFILE_CHIBI_BOB_MS,
  PROFILE_CHIBI_BOB_PT,
  PROFILE_CHIBI_HOP_PT
} from "./profileMotionModel"

export interface ProfileChibiHandle {
  /** A happy hop (or, under Reduce Motion, a still glow) on tap. */
  cheer: () => void
}

/**
 * The viewer's own full-body chibi, drawn by the shared RoomAvatarRenderer2D
 * with the approved layers, unchanged. It is alive on the page: a slow idle
 * bob and a hop when tapped, both on the UI thread. The character is only
 * translated, never scaled or skewed. Reduce Motion keeps it still; a tap
 * then only fades a glow behind it.
 */
export const ProfileChibi = forwardRef<ProfileChibiHandle, { width: number }>(
  function ProfileChibi(props, ref) {
    const { width } = props
    const height = width * PROFILE_CHIBI_ASPECT
    const reduceMotion = useReducedMotion()
    const { avatar, catalog } = useAvatarV2()
    const layers = useMemo(() => {
      const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
        avatar,
        avatarCatalog: catalog,
        roomAvatarCatalog: ROOM_AVATAR_CATALOG
      })
      return getRoomAvatarRenderLayers({ appearance, catalog: ROOM_AVATAR_CATALOG })
    }, [avatar, catalog])

    const bob = useSharedValue(0)
    const hop = useSharedValue(0)
    const glow = useSharedValue(0)

    useEffect(() => {
      if (reduceMotion) {
        cancelAnimation(bob)
        cancelAnimation(hop)
        bob.value = 0
        hop.value = 0
        return undefined
      }
      bob.value = withRepeat(
        withTiming(1, { duration: PROFILE_CHIBI_BOB_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
      return () => cancelAnimation(bob)
    }, [bob, hop, reduceMotion])

    useImperativeHandle(ref, () => ({
      cheer: () => {
        glow.value = withSequence(
          withTiming(1, { duration: 140 }),
          withTiming(0, { duration: 620 })
        )
        if (reduceMotion) return
        hop.value = withSequence(
          withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
          withSpring(0, { damping: 9, stiffness: 220, mass: 0.7 })
        )
      }
    }), [glow, hop, reduceMotion])

    const bodyStyle = useAnimatedStyle(() => ({
      transform: [
        { translateY: -bob.value * PROFILE_CHIBI_BOB_PT - hop.value * PROFILE_CHIBI_HOP_PT }
      ]
    }))
    // The floor shadow narrows as the character rises, so the hop reads as height.
    const shadowStyle = useAnimatedStyle(() => ({
      opacity: 0.5 - hop.value * 0.22 - bob.value * 0.06,
      transform: [{ scaleX: 1 - hop.value * 0.24 - bob.value * 0.04 }]
    }))
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
        <Animated.View
          style={[
            styles.floorShadow,
            { width: width * 0.62, height: 16, borderRadius: 8, left: width * 0.19 },
            shadowStyle
          ]}
        />
        <Animated.View style={[{ width, height }, bodyStyle]}>
          <RoomAvatarRenderer2D layers={layers} imagePriority="high" />
        </Animated.View>
      </View>
    )
  }
)

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    justifyContent: "flex-start"
  },
  floorShadow: {
    position: "absolute",
    bottom: 6,
    backgroundColor: "rgba(120, 48, 96, 0.32)"
  },
  cheerGlow: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)"
  }
})
