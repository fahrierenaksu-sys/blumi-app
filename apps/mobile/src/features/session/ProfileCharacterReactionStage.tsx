import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native"

import { PROFILE_CHARACTER_REACTION_ASSET_MODE } from "../../config/env"
import { useReducedMotionPreference } from "../../ui/animations"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import { AvatarPreview2D } from "../avatarV2/components/AvatarPreview2D"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import { shouldUseProfileCharacterReactionAssets } from "./profileCharacterReactionAssetGate"
import { getProfileCharacterReaction } from "./profileCharacterReactionModel"
import { getProfileCharacterReactionGeometry } from "./profileSetupVisualModel"

const FEMALE_TWIRL_ATLAS_V4 = require("./assets/profile-character-reaction-v4-candidate/blumi_profile_twirling_female_atlas_v4_final.png")
const MALE_COLLAR_ATLAS_V4 = require("./assets/profile-character-reaction-v4-candidate/blumi_profile_collar_male_atlas_v4_final.png")

interface ProfileCharacterReactionStageProps {
  avatar: UserAvatar
  compact: boolean
  displayName: string
  gender: "woman" | "man" | undefined
  motionActive: boolean
}

function GeneratedReactionSprite({
  compact,
  gender,
  motionActive
}: Pick<ProfileCharacterReactionStageProps, "compact" | "gender" | "motionActive">) {
  const {
    reduceMotion,
    isResolved: motionPreferenceResolved
  } = useReducedMotionPreference()
  const reaction = getProfileCharacterReaction(gender)
  const [frameIndex, setFrameIndex] = useState(0)
  const settleFloat = useRef(new Animated.Value(0)).current
  const timeline = reaction.timeline

  useEffect(() => {
    settleFloat.stopAnimation()
    if (!motionActive || !motionPreferenceResolved || reduceMotion || !gender || !timeline) {
      setFrameIndex(0)
      settleFloat.setValue(0)
      return undefined
    }

    setFrameIndex(0)
    settleFloat.setValue(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    let settleLoop: Animated.CompositeAnimation | null = null
    let elapsedMs = 0
    timeline.frameDurationsMs.forEach((durationMs, index) => {
      elapsedMs += durationMs
      timers.push(setTimeout(() => {
        setFrameIndex(index + 1)
        if (index + 1 === timeline.settleFrameIndex) {
          settleLoop = Animated.loop(
            Animated.sequence([
              Animated.timing(settleFloat, {
                toValue: 1,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
                isInteraction: false
              }),
              Animated.timing(settleFloat, {
                toValue: 0,
                duration: 1400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
                isInteraction: false
              })
            ])
          )
          settleLoop.start()
        }
      }, elapsedMs))
    })

    return () => {
      timers.forEach(clearTimeout)
      settleLoop?.stop()
      settleFloat.stopAnimation()
    }
  }, [gender, motionActive, motionPreferenceResolved, reduceMotion, settleFloat, timeline])

  if (!gender || !timeline) return null

  const source = gender === "woman" ? FEMALE_TWIRL_ATLAS_V4 : MALE_COLLAR_ATLAS_V4
  const cellWidth = compact ? 128 : 152
  const geometry = getProfileCharacterReactionGeometry(compact)
  const cellHeight = geometry.characterHeight
  const frameColumn = frameIndex % timeline.atlasColumns
  const frameRow = Math.floor(frameIndex / timeline.atlasColumns)
  const atlasWidth = cellWidth * timeline.atlasColumns
  const atlasHeight = cellHeight * timeline.atlasRows

  return (
    <Animated.View
      style={[
        styles.spriteFrame,
        {
          height: cellHeight,
          transform: [
            {
              translateY: settleFloat.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -2]
              })
            }
          ],
          width: cellWidth
        }
      ]}
    >
      <Image resizeMode="stretch" source={source} style={{ height: atlasHeight, left: -frameColumn * cellWidth, position: "absolute", top: -frameRow * cellHeight, width: atlasWidth }} />
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
  const entrance = useRef(new Animated.Value(1)).current
  const halo = useRef(new Animated.Value(0)).current
  const breath = useRef(new Animated.Value(0)).current

  useLayoutEffect(() => {
    entrance.stopAnimation()
    halo.stopAnimation()
    breath.stopAnimation()
    if (!motionActive || !motionPreferenceResolved || reduceMotion) {
      entrance.setValue(1)
      halo.setValue(0)
      breath.setValue(0)
      return undefined
    }

    entrance.setValue(1)
    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        })
      ])
    )
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        })
      ])
    )
    haloLoop.start()
    breathLoop.start()

    return () => {
      haloLoop.stop()
      breathLoop.stop()
      breath.stopAnimation()
    }
  }, [breath, entrance, gender, halo, motionActive, motionPreferenceResolved, reduceMotion])

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
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.45, 1]
            }),
            transform: [
              {
                scale: halo.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.035]
                })
              }
            ]
          }
        ]}
      />
      <View style={styles.frame} />
      <Animated.View
        style={{
          alignItems: "center",
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [10 + geometry.characterLift, geometry.characterLift]
              })
            },
            {
              scale: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1]
              })
            }
          ]
        }}
      >
        <Animated.View
          style={{
            transform: [
              {
                translateY: breath.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -1.5]
                })
              },
              {
                scale: breath.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.006]
                })
              }
            ]
          }}
        >
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
      </Animated.View>
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
