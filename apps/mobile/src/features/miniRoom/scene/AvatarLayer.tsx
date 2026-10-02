import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import Reanimated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import {
  getMiniRoomAvatarRenderLayers,
  getMiniRoomAvatarSittingScaleY
} from "../miniRoomAvatarMotion"
import type { MiniRoomAvatarPosition } from "./miniRoomAvatarPositions"
import {
  getMiniRoomAvatarZIndex,
  resolveMiniRoomAvatarAnchorOffset,
  resolveMiniRoomAvatarDepthOrder
} from "./miniRoomAvatarStageModel"
import {
  MINI_ROOM_PARTNER_ARRIVAL_MS,
  type MiniRoomMotionPolicy
} from "./miniRoomReducedMotion"
import type {
  AvatarState,
  SpeechBubble
} from "./miniRoomSceneTypes"
import { groupMiniRoomSpeechBySpeaker } from "./miniRoomSpeechStack"
import { RoomSpeechBubbleStack, type RoomSpeechBubblePlacement } from "./RoomSpeechBubbleStack"
import { RoomTypingBubble } from "./RoomTypingBubble"

const NO_BUBBLES: readonly SpeechBubble[] = []

interface AvatarLayerProps {
  avatars: Record<string, AvatarState>
  avatarPositions: Readonly<Record<string, MiniRoomAvatarPosition>>
  localUserId: string
  localUserLabel: string
  bubbles: SpeechBubble[]
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  partnerJustJoined: boolean
  motionPolicy: MiniRoomMotionPolicy
  /** Who is typing (the partner, from chat.typing_updated); dots over their chibi. */
  typingUserId?: string
}

type BubblePlacement = RoomSpeechBubblePlacement

export function AvatarLayer(props: AvatarLayerProps) {
  const {
    avatars,
    avatarPositions,
    localUserId,
    localUserLabel,
    bubbles,
    onDismissBubble,
    dismissBubbleLabel,
    partnerJustJoined,
    motionPolicy,
    typingUserId
  } = props
  const sortedAvatars = Object.values(avatars).sort((a, b) => a.y - b.y)
  // Stable per bubble list, so a figure re-renders only when its lines change.
  const bubblesBySpeaker = useMemo(() => groupMiniRoomSpeechBySpeaker(bubbles), [bubbles])
  const avatarsWithBubbles = sortedAvatars.filter((avatar) => bubblesBySpeaker[avatar.userId])
  const bubblesAreClose =
    avatarsWithBubbles.length > 1 &&
    Math.hypot(
      avatarsWithBubbles[0].x - avatarsWithBubbles[1].x,
      avatarsWithBubbles[0].y - avatarsWithBubbles[1].y
    ) < 0.3
  const leftBubbleUserId = bubblesAreClose
    ? [...avatarsWithBubbles].sort((a, b) => a.x - b.x)[0]?.userId
    : undefined

  // ROOM-06: avatars move by transform in room pixels (no per-frame layout).
  const stageWidth = useSharedValue(0)
  const stageHeight = useSharedValue(0)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    stageWidth.value = event.nativeEvent.layout.width
    stageHeight.value = event.nativeEvent.layout.height
  }, [stageHeight, stageWidth])

  // Draw order follows the live depth, but React hears only when one avatar
  // passes another (not every frame).
  const userIds = sortedAvatars.map((avatar) => avatar.userId).join("|")
  const [depthOrder, setDepthOrder] = useState(userIds)
  useAnimatedReaction(
    () => resolveMiniRoomAvatarDepthOrder(Object.keys(avatarPositions).map((id) => ({
      id,
      y: avatarPositions[id]!.y.value
    }))),
    (order, previous) => {
      if (order !== previous) scheduleOnRN(setDepthOrder, order)
    },
    [avatarPositions]
  )

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={handleLayout}>
      {sortedAvatars.map((avatar) => {
        const avatarBubbles = bubblesBySpeaker[avatar.userId] ?? NO_BUBBLES
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
        const position = avatarPositions[avatar.userId]
        if (!position) return null

        return (
          <AvatarFigure
            key={avatar.userId}
            avatar={avatar}
            position={position}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            zIndex={getMiniRoomAvatarZIndex(depthOrder, avatar.userId)}
            bubbles={avatarBubbles}
            bubblePlacement={bubblePlacement}
            bubbleRaised={bubbleRaised}
            onDismissBubble={onDismissBubble}
            dismissBubbleLabel={dismissBubbleLabel}
            isLocal={isLocal}
            localUserLabel={localUserLabel}
            showJoinPulse={showJoinPulse}
            motionPolicy={motionPolicy}
            typing={avatar.userId === typingUserId}
          />
        )
      })}
    </View>
  )
}

interface AvatarFigureProps {
  avatar: AvatarState
  position: MiniRoomAvatarPosition
  stageWidth: SharedValue<number>
  stageHeight: SharedValue<number>
  /** Changes only when the depth order flips. */
  zIndex: number
  /** This avatar's lines, oldest first. */
  bubbles: readonly SpeechBubble[]
  bubblePlacement: BubblePlacement
  bubbleRaised: boolean
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  isLocal: boolean
  localUserLabel: string
  showJoinPulse: boolean
  motionPolicy: MiniRoomMotionPolicy
  typing: boolean
}

const AvatarFigure = memo(function AvatarFigure(props: AvatarFigureProps) {
  const {
    avatar,
    position,
    stageWidth,
    stageHeight,
    zIndex,
    bubbles,
    bubblePlacement,
    bubbleRaised,
    onDismissBubble,
    dismissBubbleLabel,
    isLocal,
    localUserLabel,
    showJoinPulse,
    motionPolicy,
    typing
  } = props
  // Idle breath, walk bob, speaking sway and the join pulse all run on the
  // UI thread; React renders only on pose changes.
  const breathe = useSharedValue(0)
  const walkBob = useSharedValue(0)
  const joinPulse = useSharedValue(1)
  const speaking = useSharedValue(0)
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
  const sittingScaleY = useMemo(
    () => getMiniRoomAvatarSittingScaleY({
      appearance: avatar.appearance,
      motion: avatar.motion,
      facing: avatar.facing
    }),
    [avatar.appearance, avatar.facing, avatar.motion]
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
      breathe.value = 0
      return
    }
    const half = { duration: 1600, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }
    breathe.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1)
    return () => { breathe.value = 0 }
  }, [
    avatar.motion,
    breathe,
    motionPolicy.animateBreathe,
    usesAnimatedAvatarFrames
  ])

  useEffect(() => {
    if (
      !motionPolicy.animateWalking ||
      avatar.motion !== "walking" ||
      usesAnimatedWalkingFrames
    ) {
      walkBob.value = 0
      return
    }
    const half = { duration: 220, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }
    walkBob.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1)
    return () => { walkBob.value = 0 }
  }, [
    avatar.motion,
    motionPolicy.animateWalking,
    usesAnimatedWalkingFrames,
    walkBob
  ])

  useEffect(() => {
    if (!motionPolicy.animateSpeaking || avatar.motion !== "speaking") {
      speaking.value = 0
      return
    }
    const half = { duration: 180, reduceMotion: ReduceMotion.Never }
    speaking.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), 4)
    return () => { speaking.value = 0 }
  }, [avatar.motion, motionPolicy.animateSpeaking, speaking])

  useEffect(() => {
    if (!showJoinPulse || !motionPolicy.animateJoin) {
      joinPulse.value = 1
      return
    }
    joinPulse.value = withSequence(
      withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
      withTiming(0.72, {
        duration: MINI_ROOM_PARTNER_ARRIVAL_MS * 0.47,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never
      }),
      withTiming(1, {
        duration: MINI_ROOM_PARTNER_ARRIVAL_MS * 0.53,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never
      })
    )
  }, [joinPulse, motionPolicy.animateJoin, showJoinPulse])

  const facingSignX = avatar.facing === "left" ? -1 : 1
  const facingLean = avatar.facing === "left" || avatar.facing === "right" ? 1 : 0
  const isSitting = avatar.motion === "sitting"

  const leanRotate = `${facingLean * (avatar.facing === "right" ? 2 : -2)}deg`
  const joinPulseStyle = useAnimatedStyle(() => {
    const t = joinPulse.value
    return {
      opacity: t < 0.7 ? 0.55 - (0.45 * t) / 0.7 : 0.1 - (0.1 * (t - 0.7)) / 0.3,
      transform: [{ scale: 0.8 + 1.1 * t }]
    }
  })
  const figureMotionStyle = useAnimatedStyle(() => ({
    // ROOM-03: a back-facing avatar stays fully opaque (no ghost).
    transform: [
      { translateY: -3 * walkBob.value - 1.2 * breathe.value },
      { scaleX: facingSignX },
      // ROOM-04: squash only the standing idle fallback, never real sitting art.
      { scaleY: (1 + 0.018 * breathe.value) * sittingScaleY },
      { rotate: leanRotate },
      { rotate: `${2 * speaking.value}deg` }
    ]
  }))
  // Walking moves these on the UI thread as a transform (no layout per
  // frame); React renders only on pose changes and depth-order flips.
  const presentOpacity = avatar.present === false ? 0.35 : 1
  const anchorStyle = useAnimatedStyle(() => {
    const offset = resolveMiniRoomAvatarAnchorOffset(
      { x: position.x.value, y: position.y.value },
      { width: stageWidth.value, height: stageHeight.value }
    )
    return {
      // Hidden until the room is measured, so no frame shows it at the corner.
      opacity: stageWidth.value > 0 ? presentOpacity : 0,
      transform: [{ translateX: offset.translateX }, { translateY: offset.translateY }]
    }
  })
  const depthScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + position.y.value * 0.2 }]
  }))

  return (
    <Reanimated.View style={[styles.avatarAnchor, { zIndex }, anchorStyle]}>
      {showJoinPulse ? (
        <Reanimated.View style={[styles.joinPulse, joinPulseStyle]} pointerEvents="none" />
      ) : null}

      <RoomSpeechBubbleStack
        bubbles={bubbles}
        placement={bubblePlacement}
        raised={bubbleRaised}
        animate={motionPolicy.animateBubble}
        onDismissBubble={onDismissBubble}
        dismissBubbleLabel={dismissBubbleLabel}
      />
      {/* A spoken line wins over the dots; the art and its transforms are untouched. */}
      {typing && bubbles.length === 0 ? <RoomTypingBubble /> : null}

      {/* Depth scale (from the live y) wraps the same box so it scales about the same centre. */}
      <Reanimated.View
        style={[
          styles.avatarImageWrap,
          avatar.motion === "walking" ? styles.avatarWalking : null,
          isSitting ? styles.avatarSitting : null,
          depthScaleStyle
        ]}
      >
        <Reanimated.View style={[styles.avatarImageFill, figureMotionStyle]}>
          {roomAvatarLayers.length ? (
            <RoomAvatarRenderer2D layers={roomAvatarLayers} />
          ) : avatar.appearance.fullBodyAsset ? (
            <Image
              source={avatar.appearance.fullBodyAsset}
              resizeMode="contain"
              style={styles.avatarImage}
            />
          ) : null}
        </Reanimated.View>
      </Reanimated.View>
      <View style={[styles.namePlate, isLocal ? styles.namePlateLocal : null]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {isLocal ? localUserLabel : avatar.displayName}
        </Text>
      </View>
    </Reanimated.View>
  )
})

const styles = StyleSheet.create({
  avatarAnchor: {
    position: "absolute",
    left: 0,
    top: 0,
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
  avatarImageFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
})
