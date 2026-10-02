import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useRef } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { getProfileHeroStretch } from "../discovery/profilePreviewHeroModel"
import { useReducedMotion } from "../../ui/animations"
import { hapticLight } from "../../ui/haptics"
import { PageSafeArea } from "../../ui/layout/PageContainer"
import { LinearGradient } from "../../ui/linearGradient"
import { ActionButtonCircle } from "../../ui/primitives"
import { uiTheme } from "../../ui/theme"
import { ProfileChibi, type ProfileChibiHandle } from "./ProfileChibi"
import type { OwnProfileCopy } from "./profileCopy"
import { getProfileHeroParallax } from "./profileMotionModel"

export const OWN_PROFILE_HERO_HEIGHT = 430
const CHIBI_WIDTH = 196
const BLOB_DRIFT_PT = 12
const BLOB_DRIFT_MS = 5600

// Fixed sparkles on the backdrop: [left %, top, size, opacity].
const SPARKLES: readonly [number, number, number, number][] = [
  [12, 118, 16, 0.9],
  [82, 96, 12, 0.75],
  [74, 232, 18, 0.85],
  [18, 268, 11, 0.7]
]

/**
 * The own profile's stage: a soft Blumi backdrop with drifting colour blobs,
 * the user's live chibi standing on it, back on the left and Settings (gear)
 * on the right. The chibi trails the scroll (parallax) and the backdrop
 * stretches on pull. Every motion runs on the UI thread and stops under
 * Reduce Motion.
 */
export function OwnProfileHero(props: {
  displayName: string
  copy: OwnProfileCopy
  scrollY: SharedValue<number>
  onBack: () => void
  onOpenSettings: () => void
}) {
  const { copy, displayName, scrollY } = props
  const reduceMotion = useReducedMotion()
  const chibiRef = useRef<ProfileChibiHandle>(null)
  const drift = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(drift)
      drift.value = 0
      return undefined
    }
    drift.value = withRepeat(
      withTiming(1, { duration: BLOB_DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
    return () => cancelAnimation(drift)
  }, [drift, reduceMotion])

  const backdropStyle = useAnimatedStyle(() => {
    const stretch = getProfileHeroStretch(scrollY.value, reduceMotion)
    return { transform: [{ translateY: stretch.translateY }, { scale: stretch.scale }] }
  })
  const chibiStyle = useAnimatedStyle(() => {
    const parallax = getProfileHeroParallax(scrollY.value, reduceMotion)
    return { opacity: parallax.opacity, transform: [{ translateY: parallax.translateY }] }
  })
  const blobAStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * BLOB_DRIFT_PT }, { translateY: -drift.value * BLOB_DRIFT_PT }]
  }))
  const blobBStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -drift.value * BLOB_DRIFT_PT }, { translateY: drift.value * BLOB_DRIFT_PT * 0.6 }]
  }))

  const cheer = (): void => {
    hapticLight()
    chibiRef.current?.cheer()
  }

  return (
    <View style={styles.hero}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        <LinearGradient
          colors={["#EADCFB", "#FFE2EE", "#FFEADF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.blob, styles.blobPink, blobAStyle]} />
        <Animated.View style={[styles.blob, styles.blobLilac, blobBStyle]} />
        <Animated.View style={[styles.blob, styles.blobPeach, blobAStyle]} />
        <View style={styles.halo} />
        {SPARKLES.map(([left, top, size, opacity]) => (
          <Ionicons
            key={`${left}-${top}`}
            accessible={false}
            name="sparkles"
            size={size}
            color="#FFFFFF"
            style={[styles.sparkle, { left: `${left}%`, top, opacity }]}
          />
        ))}
        <View style={styles.floorGlow} />
      </Animated.View>

      <PageSafeArea contentGutter={false} edges={["top"]} style={styles.nav}>
        <ActionButtonCircle accessibilityLabel={copy.back} onPress={props.onBack} size={44} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={uiTheme.colors.textPrimary} />
        </ActionButtonCircle>
        <ActionButtonCircle accessibilityLabel={copy.settings} onPress={props.onOpenSettings} size={44} style={styles.navButton}>
          <Ionicons name="settings-outline" size={21} color={uiTheme.colors.textPrimary} />
        </ActionButtonCircle>
      </PageSafeArea>

      <Animated.View style={[styles.chibiSlot, chibiStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.heroAvatar(displayName)}
          accessibilityHint={copy.heroAvatarHint}
          onPress={cheer}
          hitSlop={8}
        >
          <ProfileChibi ref={chibiRef} width={CHIBI_WIDTH} />
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    height: OWN_PROFILE_HERO_HEIGHT,
    overflow: "hidden",
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    backgroundColor: uiTheme.colors.surfaceSoft
  },
  blob: {
    position: "absolute",
    borderRadius: 999
  },
  blobPink: {
    width: 300,
    height: 300,
    top: -70,
    left: -90,
    backgroundColor: "rgba(255, 200, 223, 0.72)"
  },
  blobLilac: {
    width: 260,
    height: 260,
    top: 60,
    right: -110,
    backgroundColor: "rgba(231, 213, 244, 0.85)"
  },
  blobPeach: {
    width: 220,
    height: 220,
    bottom: -60,
    left: 40,
    backgroundColor: "rgba(255, 224, 204, 0.7)"
  },
  halo: {
    position: "absolute",
    alignSelf: "center",
    top: 92,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.7)"
  },
  floorGlow: {
    position: "absolute",
    alignSelf: "center",
    bottom: 58,
    width: 230,
    height: 40,
    borderRadius: 115,
    backgroundColor: "rgba(255, 255, 255, 0.55)"
  },
  sparkle: {
    position: "absolute"
  },
  nav: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.xs,
    zIndex: 2
  },
  navButton: {
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)"
  },
  chibiSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 52,
    alignItems: "center"
  }
})
