import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import { RoomRendererFurnitureSprite } from "../../roomV2/components/RoomRenderer2D"
import { animateTo, useMotion } from "../../../ui/motion"
import {
  getMiniRoomAvatarRenderLayers,
  getMiniRoomAvatarSittingScaleY
} from "../miniRoomAvatarMotion"
import type { MiniRoomAvatarPosition } from "./miniRoomAvatarPositions"
import { resolveMiniRoomAvatarAnchorOffset } from "./miniRoomAvatarStageModel"
import {
  EMPTY_MINI_ROOM_DEPTH_SCENE,
  resolveMiniRoomAvatarSortDepth,
  resolveMiniRoomDepthOrder,
  resolveMiniRoomDepthZIndices,
  type MiniRoomDepthScene
} from "./miniRoomDepthModel"
import {
  resolveMiniRoomAvatarLoops,
  type MiniRoomMotionPolicy
} from "./miniRoomReducedMotion"
import type {
  AvatarState,
  SpeechBubble
} from "./miniRoomSceneTypes"
import { groupMiniRoomSpeechBySpeaker } from "./miniRoomSpeechStack"
import { resolveMiniRoomAvatarOpacity } from "./miniRoomPresentation"
import { RoomSpeechBubbleStack, type RoomSpeechBubblePlacement } from "./RoomSpeechBubbleStack"
import { RoomTypingBubble } from "./RoomTypingBubble"
import { useMiniRoomAvatarLoops } from "./useMiniRoomAvatarLoops"

const NO_BUBBLES: readonly SpeechBubble[] = []
/** Speech, typing dots and name plates read above every body and piece of furniture. */
const OVERLAY_Z_INDEX = 10_000

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
  /** Furniture drawn among the avatars by floor depth (VIS-04). */
  depthScene?: MiniRoomDepthScene
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
    typingUserId,
    depthScene = EMPTY_MINI_ROOM_DEPTH_SCENE
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

  // A seated (or sitting-down / standing-up) avatar sorts at its seat's depth.
  const { neighbours, occluders, seatDepthByHotspotId } = depthScene
  const seatKey = sortedAvatars
    .map((avatar) => `${avatar.userId}:${avatar.seatedHotspotId ?? avatar.depthSeatHotspotId ?? ""}`)
    .join("|")
  const pinnedDepths = useMemo(() => {
    const pinned: Record<string, number> = {}
    for (const entry of seatKey.split("|")) {
      const split = entry.lastIndexOf(":")
      const seat = entry.slice(split + 1)
      const depth = seat ? seatDepthByHotspotId[seat] : undefined
      if (depth !== undefined) pinned[entry.slice(0, split)] = depth
    }
    return pinned
  }, [seatDepthByHotspotId, seatKey])

  // Draw order follows the live depth, but React hears only when an avatar
  // passes another avatar or a piece of furniture (not every frame).
  const [depthOrder, setDepthOrder] = useState(() => resolveMiniRoomDepthOrder(neighbours,
    sortedAvatars.map((avatar) => ({ id: avatar.userId, depth: avatar.y }))))
  useAnimatedReaction(
    () => resolveMiniRoomDepthOrder(neighbours, Object.keys(avatarPositions).map((id) => ({
      id,
      depth: resolveMiniRoomAvatarSortDepth(avatarPositions[id]!.y.value, pinnedDepths[id])
    }))),
    (order, previous) => {
      if (order !== previous) scheduleOnRN(setDepthOrder, order)
    },
    [avatarPositions, neighbours, pinnedDepths]
  )
  const zIndices = useMemo(
    () => resolveMiniRoomDepthZIndices(depthOrder, occluders.length),
    [depthOrder, occluders.length]
  )

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={handleLayout}>
      {occluders.map((item, index) => (
        <RoomRendererFurnitureSprite key={item.renderId} item={item} zIndex={zIndices.occluders[index] ?? 0} />
      ))}
      {sortedAvatars.map((avatar) => {
        const position = avatarPositions[avatar.userId]
        if (!position) return null
        const isLocal = avatar.userId === localUserId
        return (
          <AvatarFigure
            key={avatar.userId}
            avatar={avatar}
            position={position}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            zIndex={zIndices.avatars[avatar.userId] ?? 0}
            // A walk in from the door is the arrival's one hero; the ring is for a plain
            // fade-in, so it stays off for a walk-in even after it lands.
            showJoinPulse={!isLocal && partnerJustJoined && !avatar.enteringFromDoor && !avatar.arrivedByWalk}
            motionPolicy={motionPolicy}
          />
        )
      })}
      {sortedAvatars.map((avatar) => {
        const position = avatarPositions[avatar.userId]
        if (!position) return null
        const avatarBubbles = bubblesBySpeaker[avatar.userId] ?? NO_BUBBLES
        const isLocal = avatar.userId === localUserId
        let bubblePlacement: BubblePlacement = "center"
        if (avatar.x < 0.24) {
          bubblePlacement = "right"
        } else if (avatar.x > 0.76) {
          bubblePlacement = "left"
        } else if (bubblesAreClose) {
          bubblePlacement = avatar.userId === leftBubbleUserId ? "left" : "right"
        }
        return (
          <AvatarOverlay
            key={`${avatar.userId}:overlay`}
            avatar={avatar}
            position={position}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            bubbles={avatarBubbles}
            bubblePlacement={bubblePlacement}
            bubbleRaised={bubblesAreClose && avatar.userId !== leftBubbleUserId}
            onDismissBubble={onDismissBubble}
            dismissBubbleLabel={dismissBubbleLabel}
            isLocal={isLocal}
            localUserLabel={localUserLabel}
            motionPolicy={motionPolicy}
            typing={avatar.userId === typingUserId}
          />
        )
      })}
    </View>
  )
}

/**
 * One avatar's anchor at its live room position. Walking moves it on the UI
 * thread as a transform (no layout per frame); React renders only on pose
 * changes and depth-order flips. Body and overlay share it, so they never
 * drift apart.
 */
function AvatarAnchor(props: {
  avatar: AvatarState
  position: MiniRoomAvatarPosition
  stageWidth: SharedValue<number>
  stageHeight: SharedValue<number>
  zIndex: number
  /**
   * Only interactive children (speech bubbles) take touches; the rest of the
   * anchor's box is floor, so a tap beside an avatar walks there.
   */
  pointerEvents: "none" | "box-none"
  children: ReactNode
}) {
  const { avatar, position, stageWidth, stageHeight, zIndex, children } = props
  // Present: opaque. Stepped away: dimmed (the HUD says so). Not here yet:
  // not drawn. A change of presence fades; it never jumps.
  const motion = useMotion()
  const presenceOpacity = resolveMiniRoomAvatarOpacity(avatar)
  const presence = useSharedValue(presenceOpacity)
  useEffect(() => {
    presence.value = animateTo(presenceOpacity, motion.crossfade)
  }, [motion.crossfade, presence, presenceOpacity])
  // An arrival fades the avatar in (at the door, or in place under Reduce
  // Motion, where fadeIn resolves to the crossfade).
  const entrance = useSharedValue(1)
  const arrivalId = avatar.arrivalId
  useEffect(() => {
    if (arrivalId === undefined) return
    entrance.value = 0
    entrance.value = animateTo(1, motion.fadeIn)
  }, [arrivalId, entrance, motion.fadeIn])
  const anchorStyle = useAnimatedStyle(() => {
    const offset = resolveMiniRoomAvatarAnchorOffset(
      { x: position.x.value, y: position.y.value },
      { width: stageWidth.value, height: stageHeight.value }
    )
    return {
      // Hidden until the room is measured, so no frame shows it at the corner.
      opacity: stageWidth.value > 0 ? presence.value * entrance.value : 0,
      transform: [{ translateX: offset.translateX }, { translateY: offset.translateY }]
    }
  })
  return (
    <Reanimated.View pointerEvents={props.pointerEvents} style={[styles.avatarAnchor, { zIndex }, anchorStyle]}>
      {children}
    </Reanimated.View>
  )
}

interface AvatarFigureProps {
  avatar: AvatarState
  position: MiniRoomAvatarPosition
  stageWidth: SharedValue<number>
  stageHeight: SharedValue<number>
  /** Changes only when the depth order flips. */
  zIndex: number
  showJoinPulse: boolean
  motionPolicy: MiniRoomMotionPolicy
}

/** The chibi body and its floor ring: sorted among the furniture by depth. */
const AvatarFigure = memo(function AvatarFigure(props: AvatarFigureProps) {
  const {
    avatar,
    position,
    stageWidth,
    stageHeight,
    zIndex,
    showJoinPulse,
    motionPolicy
  } = props
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
  const loops = useMiniRoomAvatarLoops(resolveMiniRoomAvatarLoops({
    motion: avatar.motion,
    policy: motionPolicy,
    usesAnimatedFrames: usesAnimatedAvatarFrames,
    arriving: showJoinPulse
  }))

  const facingSignX = avatar.facing === "left" ? -1 : 1
  const facingLean = avatar.facing === "left" || avatar.facing === "right" ? 1 : 0
  const isSitting = avatar.motion === "sitting"

  const leanRotate = `${facingLean * (avatar.facing === "right" ? 2 : -2)}deg`
  const { breathe, walkBob, speaking, arrivalRing } = loops
  const ringStyle = useAnimatedStyle(() => {
    const ring = arrivalRing.value
    return {
      opacity: ring <= 0.7 ? 0.55 - (0.45 * ring) / 0.7 : 0.1 * (1 - (ring - 0.7) / 0.3),
      transform: [{ scale: 0.8 + 1.1 * ring }]
    }
  })
  // ROOM-03: a back-facing avatar stays fully opaque (no ghost).
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * walkBob.value - 1.2 * breathe.value },
      { scaleX: facingSignX },
      // ROOM-04: squash only the standing idle fallback, never real sitting art.
      { scaleY: (1 + 0.018 * breathe.value) * sittingScaleY },
      { rotate: leanRotate },
      { rotate: `${2 * speaking.value}deg` }
    ]
  }))
  const depthScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + position.y.value * 0.2 }]
  }))

  return (
    <AvatarAnchor avatar={avatar} position={position} stageWidth={stageWidth} stageHeight={stageHeight} zIndex={zIndex}
      pointerEvents="none">
      {showJoinPulse ? (
        <Reanimated.View style={[styles.joinPulse, ringStyle]} pointerEvents="none" />
      ) : null}
      {/* Depth scale (from the live y) wraps the same box so it scales about the same centre. */}
      <Reanimated.View
        style={[
          styles.avatarImageWrap,
          avatar.motion === "walking" ? styles.avatarWalking : null,
          isSitting ? styles.avatarSitting : null,
          depthScaleStyle
        ]}
      >
        <Reanimated.View style={[styles.avatarImageFill, bodyStyle]}>
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
    </AvatarAnchor>
  )
})

interface AvatarOverlayProps {
  avatar: AvatarState
  position: MiniRoomAvatarPosition
  stageWidth: SharedValue<number>
  stageHeight: SharedValue<number>
  /** This avatar's lines, oldest first. */
  bubbles: readonly SpeechBubble[]
  bubblePlacement: BubblePlacement
  bubbleRaised: boolean
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  isLocal: boolean
  localUserLabel: string
  motionPolicy: MiniRoomMotionPolicy
  typing: boolean
}

/** Speech, typing dots and the name plate: always readable, above any furniture. */
const AvatarOverlay = memo(function AvatarOverlay(props: AvatarOverlayProps) {
  const {
    avatar,
    position,
    stageWidth,
    stageHeight,
    bubbles,
    bubblePlacement,
    bubbleRaised,
    onDismissBubble,
    dismissBubbleLabel,
    isLocal,
    localUserLabel,
    motionPolicy,
    typing
  } = props
  return (
    <AvatarAnchor avatar={avatar} position={position} stageWidth={stageWidth} stageHeight={stageHeight}
      zIndex={OVERLAY_Z_INDEX} pointerEvents="box-none">
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
      <View pointerEvents="none" style={[styles.namePlate, isLocal ? styles.namePlateLocal : null]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {isLocal ? localUserLabel : avatar.displayName}
        </Text>
      </View>
    </AvatarAnchor>
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
