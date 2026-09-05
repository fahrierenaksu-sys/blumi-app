import { memo, useEffect, useMemo, useRef } from "react"
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import { getMiniRoomAvatarRenderLayers } from "../miniRoomAvatarMotion"
import {
  MINI_ROOM_PARTNER_ARRIVAL_MS,
  type MiniRoomMotionPolicy
} from "./miniRoomReducedMotion"
import type {
  AvatarState,
  SpeechBubble
} from "./miniRoomSceneTypes"

interface AvatarLayerProps {
  avatars: Record<string, AvatarState>
  localUserId: string
  bubbles: SpeechBubble[]
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  partnerJustJoined: boolean
  motionPolicy: MiniRoomMotionPolicy
}

type BubblePlacement = "center" | "left" | "right"

export function AvatarLayer(props: AvatarLayerProps) {
  const {
    avatars,
    localUserId,
    bubbles,
    onDismissBubble,
    dismissBubbleLabel,
    partnerJustJoined,
    motionPolicy
  } = props
  const sortedAvatars = Object.values(avatars).sort((a, b) => a.y - b.y)
  const avatarsWithBubbles = sortedAvatars.filter((avatar) =>
    bubbles.some((entry) => entry.speakerUserId === avatar.userId)
  )
  const bubblesAreClose =
    avatarsWithBubbles.length > 1 &&
    Math.hypot(
      avatarsWithBubbles[0].x - avatarsWithBubbles[1].x,
      avatarsWithBubbles[0].y - avatarsWithBubbles[1].y
    ) < 0.3
  const leftBubbleUserId = bubblesAreClose
    ? [...avatarsWithBubbles].sort((a, b) => a.x - b.x)[0]?.userId
    : undefined

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {sortedAvatars.map((avatar) => {
        const bubble = bubbles.find((entry) => entry.speakerUserId === avatar.userId)
        const isLocal = avatar.userId === localUserId
        const showJoinPulse = !isLocal && partnerJustJoined
        let bubblePlacement: BubblePlacement = "center"
        if (avatar.x < 0.24) {
          bubblePlacement = "right"
        } else if (avatar.x > 0.76) {
          bubblePlacement = "left"
        } else if (bubblesAreClose) {
          bubblePlacement = avatar.userId === leftBubbleUserId ? "left" : "right"
        }
        const bubbleRaised =
          bubblesAreClose && avatar.userId !== leftBubbleUserId

        return (
          <AvatarFigure
            key={avatar.userId}
            avatar={avatar}
            bubble={bubble}
            bubblePlacement={bubblePlacement}
            bubbleRaised={bubbleRaised}
            onDismissBubble={onDismissBubble}
            dismissBubbleLabel={dismissBubbleLabel}
            isLocal={isLocal}
            showJoinPulse={showJoinPulse}
            motionPolicy={motionPolicy}
          />
        )
      })}
    </View>
  )
}

interface AvatarFigureProps {
  avatar: AvatarState
  bubble: SpeechBubble | undefined
  bubblePlacement: BubblePlacement
  bubbleRaised: boolean
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  isLocal: boolean
  showJoinPulse: boolean
  motionPolicy: MiniRoomMotionPolicy
}

const AvatarFigure = memo(function AvatarFigure(props: AvatarFigureProps) {
  const {
    avatar,
    bubble,
    bubblePlacement,
    bubbleRaised,
    onDismissBubble,
    dismissBubbleLabel,
    isLocal,
    showJoinPulse,
    motionPolicy
  } = props
  const breatheRef = useRef(new Animated.Value(0)).current
  const walkBobRef = useRef(new Animated.Value(0)).current
  const bubblePopRef = useRef(new Animated.Value(0)).current
  const joinPulseRef = useRef(new Animated.Value(0)).current
  const speakingRef = useRef(new Animated.Value(0)).current
  const roomAvatarLayers = useMemo(
    () => getMiniRoomAvatarRenderLayers({
      appearance: avatar.appearance,
      motion: avatar.motion,
      facing: avatar.facing
    }),
    [
      avatar.appearance,
      avatar.facing,
      avatar.motion
    ]
  )
  const usesAnimatedAvatarFrames = roomAvatarLayers.some(
    (layer) => (layer.animation?.frames.length ?? 0) > 1
  )
  const usesAnimatedWalkingFrames =
    avatar.motion === "walking" &&
    usesAnimatedAvatarFrames

  useEffect(() => {
    if (
      !motionPolicy.animateBreathe ||
      avatar.motion !== "idle" ||
      usesAnimatedAvatarFrames
    ) {
      breatheRef.stopAnimation()
      breatheRef.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheRef, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(breatheRef, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      breatheRef.setValue(0)
    }
  }, [
    avatar.motion,
    breatheRef,
    motionPolicy.animateBreathe,
    usesAnimatedAvatarFrames
  ])

  useEffect(() => {
    if (
      !motionPolicy.animateWalking ||
      avatar.motion !== "walking" ||
      usesAnimatedWalkingFrames
    ) {
      walkBobRef.stopAnimation()
      walkBobRef.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(walkBobRef, {
          toValue: 1,
          duration: 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(walkBobRef, {
          toValue: 0,
          duration: 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      walkBobRef.setValue(0)
    }
  }, [
    avatar.motion,
    motionPolicy.animateWalking,
    usesAnimatedWalkingFrames,
    walkBobRef
  ])

  useEffect(() => {
    if (!bubble) {
      bubblePopRef.stopAnimation()
      bubblePopRef.setValue(0)
      return
    }
    if (!motionPolicy.animateBubble) {
      bubblePopRef.stopAnimation()
      bubblePopRef.setValue(1)
      return
    }
    bubblePopRef.setValue(0)
    const animation = Animated.spring(bubblePopRef, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 140
    })
    animation.start()
    return () => animation.stop()
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [bubble?.id, bubblePopRef, motionPolicy.animateBubble])

  useEffect(() => {
    if (!motionPolicy.animateSpeaking || avatar.motion !== "speaking") {
      speakingRef.stopAnimation()
      speakingRef.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(speakingRef, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        }),
        Animated.timing(speakingRef, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true
        })
      ]),
      { iterations: 4 }
    )
    loop.start()
    return () => {
      loop.stop()
      speakingRef.setValue(0)
    }
  }, [avatar.motion, motionPolicy.animateSpeaking, speakingRef])

  useEffect(() => {
    if (!showJoinPulse || !motionPolicy.animateJoin) {
      joinPulseRef.stopAnimation()
      joinPulseRef.setValue(1)
      return
    }
    joinPulseRef.setValue(0)
    const animation = Animated.sequence([
      Animated.timing(joinPulseRef, {
        toValue: 0.72,
        duration: MINI_ROOM_PARTNER_ARRIVAL_MS * 0.47,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(joinPulseRef, {
        toValue: 1,
        duration: MINI_ROOM_PARTNER_ARRIVAL_MS * 0.53,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      })
    ])
    animation.start()
    return () => animation.stop()
  }, [joinPulseRef, motionPolicy.animateJoin, showJoinPulse])

  const depthScale = 0.9 + avatar.y * 0.2
  const facingSignX = avatar.facing === "left" ? -1 : 1
  const facingLean = avatar.facing === "left" || avatar.facing === "right" ? 1 : 0
  const facingBackDim = avatar.facing === "back" ? 0.82 : 1
  const isSitting = avatar.motion === "sitting"

  const breatheScaleY = breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018]
  })
  const breatheTranslateY = breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.2]
  })
  const walkTranslateY = walkBobRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3]
  })
  const speakingRotate = speakingRef.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "2deg"]
  })
  const leanRotate = `${facingLean * (avatar.facing === "right" ? 2 : -2)}deg`
  const bubbleScale = bubblePopRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1]
  })
  const bubbleOpacity = bubblePopRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  })
  const pulseScale = joinPulseRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.9]
  })
  const pulseOpacity = joinPulseRef.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.55, 0.1, 0]
  })

  const sourceLabel =
    !isLocal && avatar.appearance.snapshotSource === "partner_preview_fallback"
      ? "Blumi avatar"
      : undefined

  return (
    <View
      style={[
        styles.avatarAnchor,
        {
          left: `${avatar.x * 100}%`,
          top: `${avatar.y * 100}%`
        }
      ]}
    >
      {showJoinPulse ? (
        <Animated.View
          style={[
            styles.joinPulse,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }]
            }
          ]}
          pointerEvents="none"
        />
      ) : null}

      {bubble ? (
        <Animated.View
          style={[
            styles.bubbleAnchor,
            bubblePlacement === "left" ? styles.bubbleLeft : null,
            bubblePlacement === "right" ? styles.bubbleRight : null,
            bubbleRaised ? styles.bubbleRaised : null,
            {
              opacity: bubbleOpacity,
              transform: [{ scale: bubbleScale }]
            }
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dismissBubbleLabel}
            onPress={() => onDismissBubble(bubble.id)}
            hitSlop={8}
            style={styles.bubbleWrap}
          >
            <Text
              style={styles.bubbleText}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {bubble.body}
            </Text>
            <View
              pointerEvents="none"
              style={[
                styles.bubbleTail,
                bubblePlacement === "left" ? styles.bubbleTailLeft : null,
                bubblePlacement === "right" ? styles.bubbleTailRight : null,
              ]}
            />
          </Pressable>
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.avatarShadowOuter,
          avatar.motion === "walking" ? styles.avatarShadowOuterWalking : null,
          isSitting ? styles.avatarShadowOuterSitting : null
        ]}
      />
      <View
        style={[
          styles.avatarShadow,
          avatar.motion === "walking" ? styles.avatarShadowWalking : null,
          isSitting ? styles.avatarShadowSitting : null
        ]}
      />
      <Animated.View
        style={[
          styles.avatarImageWrap,
          avatar.motion === "walking" ? styles.avatarWalking : null,
          isSitting ? styles.avatarSitting : null,
          {
            opacity: facingBackDim,
            transform: [
              { translateY: Animated.add(walkTranslateY, breatheTranslateY) },
              { scaleX: facingSignX * depthScale },
              { scaleY: Animated.multiply(breatheScaleY, depthScale * (isSitting ? 0.86 : 1)) },
              { rotate: leanRotate },
              { rotate: speakingRotate }
            ]
          }
        ]}
      >
        {roomAvatarLayers.length ? (
          <RoomAvatarRenderer2D layers={roomAvatarLayers} />
        ) : avatar.appearance.fullBodyAsset ? (
          <Image
            source={avatar.appearance.fullBodyAsset}
            resizeMode="contain"
            style={styles.avatarImage}
          />
        ) : null}
      </Animated.View>
      <View style={[styles.namePlate, isLocal ? styles.namePlateLocal : null]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {isLocal ? "You" : avatar.displayName}
        </Text>
        {sourceLabel ? (
          <Text style={styles.sourceText} numberOfLines={1}>
            {sourceLabel}
          </Text>
        ) : null}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  avatarAnchor: {
    position: "absolute",
    width: 86,
    height: 142,
    marginLeft: -43,
    marginTop: -130,
    alignItems: "center"
  },
  avatarImageWrap: {
    position: "absolute",
    bottom: 22,
    width: 74,
    height: 108,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  avatarImage: {
    width: 74,
    height: 108
  },
  avatarWalking: {
    bottom: 24
  },
  avatarShadowOuter: {
    position: "absolute",
    bottom: 14,
    width: 76,
    height: 21,
    borderRadius: 999,
    backgroundColor: "rgba(52, 31, 17, 0.09)"
  },
  avatarShadowOuterWalking: {
    width: 54,
    opacity: 0.55
  },
  avatarShadowOuterSitting: {
    width: 64,
    height: 16
  },
  avatarShadow: {
    position: "absolute",
    bottom: 18,
    width: 54,
    height: 15,
    borderRadius: 999,
    backgroundColor: "rgba(52, 31, 17, 0.25)"
  },
  avatarShadowWalking: {
    width: 36,
    opacity: 0.7
  },
  avatarShadowSitting: {
    width: 46,
    height: 11,
    backgroundColor: "rgba(52, 31, 17, 0.28)"
  },
  avatarSitting: {
    bottom: 4
  },
  joinPulse: {
    position: "absolute",
    bottom: 16,
    width: 90,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255, 134, 181, 0.7)",
    backgroundColor: "rgba(255, 134, 181, 0.12)"
  },
  namePlate: {
    maxWidth: 86,
    minHeight: 20,
    position: "absolute",
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 213, 230, 0.9)"
  },
  namePlateLocal: {
    backgroundColor: "rgba(255, 79, 152, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.9)"
  },
  nameText: {
    color: "#3A2430",
    fontSize: 10,
    fontWeight: "800"
  },
  sourceText: {
    color: "rgba(58, 36, 48, 0.7)",
    fontSize: 8,
    fontWeight: "800"
  },
  bubbleAnchor: {
    position: "absolute",
    left: "50%",
    bottom: 130,
    width: 174,
    marginLeft: -87,
  },
  bubbleWrap: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)",
    shadowColor: "#5B263B",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  bubbleLeft: {
    marginLeft: -140
  },
  bubbleRight: {
    marginLeft: -34
  },
  bubbleRaised: {
    bottom: 168
  },
  bubbleText: {
    color: "#3A2430",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center"
  },
  bubbleTail: {
    position: "absolute",
    left: "50%",
    bottom: -5,
    width: 10,
    height: 10,
    marginLeft: -5,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)"
  },
  bubbleTailLeft: {
    left: "76%"
  },
  bubbleTailRight: {
    left: "24%"
  },
})
