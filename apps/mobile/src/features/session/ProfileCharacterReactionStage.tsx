import { useEffect, useLayoutEffect, useMemo } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"

import { useReducedMotionPreference } from "../../ui/animations"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import { AvatarPreview2D } from "../avatarV2/components/AvatarPreview2D"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import {
  PROFILE_CHARACTER_REACTION_ASSET_MODE,
  shouldUseProfileCharacterReactionAssets
} from "./profileCharacterReactionAssetGate"
import {
  getProfileCharacterReaction,
  getProfileCharacterReactionAtlasOffset,
  getProfileCharacterReactionFrameSteps,
  getProfileCharacterReactionSettleDelayMs
} from "./profileCharacterReactionModel"
import { getProfileCharacterReactionGeometry } from "./profileSetupVisualModel"

const FEMALE_TWIRL_ATLAS_V4 = require("./assets/profile-character-reaction-v4-runtime/blumi_profile_twirling_female_atlas_v4_final.png")
const MALE_COLLAR_ATLAS_V4 = require("./assets/profile-character-reaction-v4-runtime/blumi_profile_collar_male_atlas_v4_final.png")

/** Crossfade when a gender reaction (re)starts (ONB-15). */
const REACTION_CROSSFADE_MS = 160

/** A 0 → 1 → 0 sine loop on the UI thread. */
function sineLoop(halfMs: number) {
  const half = { duration: halfMs, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }
  return withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1)
}

/**
 * Keeps both reaction atlases decoded while the profile step is on screen.
 * Without it the first gender tap showed an empty frame while the 1024x1536
 * atlas decoded (ONB-15). A 1-pt, near-transparent clip renders nothing
 * visible but still makes the image views load and decode their atlas.
 */
function ReactionAtlasPreload({ compact }: { compact: boolean }) {
  // Same display size as the sprite below, so the decode is reused (iOS
  // decodes bundled images at the size they are drawn).
  const size = (gender: "woman" | "man") => {
    const timeline = getProfileCharacterReaction(gender).timeline
    const cellWidth = compact ? 128 : 152
    const cellHeight = getProfileCharacterReactionGeometry(compact).characterHeight
    return timeline
      ? { width: cellWidth * timeline.atlasColumns, height: cellHeight * timeline.atlasRows }
      : { width: cellWidth, height: cellHeight }
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.atlasPreload}
    >
      <Image resizeMode="stretch" source={FEMALE_TWIRL_ATLAS_V4} style={[styles.atlasPreloadImage, size("woman")]} />
      <Image resizeMode="stretch" source={MALE_COLLAR_ATLAS_V4} style={[styles.atlasPreloadImage, size("man")]} />
    </View>
  )
}

interface ProfileCharacterReactionStageProps {
  avatar: UserAvatar
  compact: boolean
  displayName: string
  gender: "woman" | "man" | undefined
  motionActive: boolean
}

export function GeneratedReactionSprite({
  compact,
  gender,
  motionActive
}: Pick<ProfileCharacterReactionStageProps, "compact" | "gender" | "motionActive">) {
  const {
    reduceMotion,
    isResolved: motionPreferenceResolved
  } = useReducedMotionPreference()
  const reaction = getProfileCharacterReaction(gender)
  // The atlas frame lives on the UI thread: the reaction plays without a
  // React render per frame.
  const frame = useSharedValue(0)
  const settleFloat = useSharedValue(0)
  const reveal = useSharedValue(1)
  const timeline = reaction.timeline

  useLayoutEffect(() => {
    if (!gender || reduceMotion || !motionPreferenceResolved) {
      reveal.value = 1
      return
    }
    reveal.value = withSequence(
      withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
      withTiming(1, { duration: REACTION_CROSSFADE_MS, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })
    )
  }, [gender, motionPreferenceResolved, reduceMotion, reveal])

  useEffect(() => {
    if (!motionActive || !motionPreferenceResolved || reduceMotion || !gender || !timeline) {
      frame.value = 0
      settleFloat.value = 0
      return
    }

    frame.value = 0
    settleFloat.value = 0
    // Each authored hold, then an instant cut to the next frame.
    const cut = { duration: 0, reduceMotion: ReduceMotion.Never }
    frame.value = withSequence(
      ReduceMotion.Never,
      ...getProfileCharacterReactionFrameSteps(timeline).map((step) =>
        withDelay(step.holdMs, withTiming(step.frameIndex, cut), ReduceMotion.Never)
      )
    )
    settleFloat.value = withDelay(
      getProfileCharacterReactionSettleDelayMs(timeline),
      sineLoop(1400),
      ReduceMotion.Never
    )

    return () => {
      cancelAnimation(frame)
      frame.value = 0
      settleFloat.value = 0
    }
  }, [frame, gender, motionActive, motionPreferenceResolved, reduceMotion, settleFloat, timeline])

  const cellWidth = compact ? 128 : 152
  const cellHeight = getProfileCharacterReactionGeometry(compact).characterHeight
  const atlasColumns = timeline?.atlasColumns ?? 1
  const frameCount = timeline?.frameCount ?? 1

  const spriteMotionStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: -2 * settleFloat.value }]
  }))
  const atlasFrameStyle = useAnimatedStyle(() => {
    const offset = getProfileCharacterReactionAtlasOffset(
      frame.value,
      { atlasColumns, frameCount },
      cellWidth,
      cellHeight
    )
    return { transform: [{ translateX: offset.x }, { translateY: offset.y }] }
  })

  if (!gender || !timeline) return null

  const source = gender === "woman" ? FEMALE_TWIRL_ATLAS_V4 : MALE_COLLAR_ATLAS_V4
  const atlasWidth = cellWidth * timeline.atlasColumns
  const atlasHeight = cellHeight * timeline.atlasRows

  return (
    <Animated.View style={[styles.spriteFrame, { height: cellHeight, width: cellWidth }, spriteMotionStyle]}>
      <Animated.Image
        resizeMode="stretch"
        source={source}
        style={[styles.atlasImage, { height: atlasHeight, width: atlasWidth }, atlasFrameStyle]}
      />
    </Animated.View>
  )
}

export function ProfileCharacterReactionStage({
  avatar,
  compact,
  displayName,
  gender,
  motionActive
}: ProfileCharacterReactionStageProps) {
  const {
    reduceMotion,
    isResolved: motionPreferenceResolved
  } = useReducedMotionPreference()
  const reaction = getProfileCharacterReaction(gender)
  const useGeneratedReaction =
    Boolean(gender) &&
    shouldUseProfileCharacterReactionAssets(PROFILE_CHARACTER_REACTION_ASSET_MODE)
  // The character stands in place; only the halo and a soft breath loop.
  const halo = useSharedValue(0)
  const breath = useSharedValue(0)

  useLayoutEffect(() => {
    if (!motionActive || !motionPreferenceResolved || reduceMotion) {
      halo.value = 0
      breath.value = 0
      return
    }
    halo.value = sineLoop(1800)
    breath.value = sineLoop(1400)
    return () => {
      halo.value = 0
      breath.value = 0
    }
  }, [breath, gender, halo, motionActive, motionPreferenceResolved, reduceMotion])

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.035 * halo.value }]
  }))
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * breath.value }, { scale: 1 + 0.006 * breath.value }]
  }))

  const characterName = useMemo(
    () => displayName.trim(),
    [displayName]
  )
  const geometry = getProfileCharacterReactionGeometry(compact)

  return (
    <View
      accessibilityLabel={reaction.interactionLabel}
      style={[styles.root, { height: geometry.stageHeight }]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, haloStyle]} />
      <View style={styles.frame} />
      {shouldUseProfileCharacterReactionAssets(PROFILE_CHARACTER_REACTION_ASSET_MODE)
        ? <ReactionAtlasPreload compact={compact} />
        : null}
      <View style={{ alignItems: "center", transform: [{ translateY: geometry.characterLift }] }}>
        <Animated.View style={breathStyle}>
          {useGeneratedReaction ? (
            <GeneratedReactionSprite
              compact={compact}
              gender={gender}
              motionActive={motionActive}
            />
          ) : (
            <AvatarPreview2D
              animationState="idle_front"
              avatar={avatar}
              showGlow={false}
              size={compact ? 132 : 164}
              stageHeight={compact ? 184 : 220}
              style={styles.avatarPreview}
              themeTone="entry"
            />
          )}
        </Animated.View>
      </View>
      {characterName ? (
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.metaText}>
            {characterName}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  atlasPreload: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0.01
  },
  atlasPreloadImage: {
    position: "absolute"
  },
  root: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    position: "relative",
    width: "100%"
  },
  glow: {
    backgroundColor: "rgba(252, 227, 232, 0.76)",
    borderRadius: 94,
    height: 176,
    position: "absolute",
    top: 28,
    width: 224
  },
  frame: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: 100,
    borderWidth: 1,
    height: 190,
    position: "absolute",
    top: 18,
    width: 232,
    ...uiTheme.shadow.soft
  },
  spriteFrame: {
    overflow: "hidden"
  },
  atlasImage: {
    left: 0,
    position: "absolute",
    top: 0
  },
  avatarPreview: {
    borderRadius: uiTheme.radius.xl,
    overflow: "hidden"
  },
  meta: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(255,255,255,0.98)",
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    // Keep the identity label on the stage's lower rail; never cover the
    // avatar's feet/ankle anchor while the reaction sprite settles.
    bottom: 0,
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 6,
    position: "absolute",
    ...uiTheme.shadow.soft
  },
  metaText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep
  }
})
