import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { AvatarLive } from "../../avatar/components/AvatarLive"
import { roomAvatar25d } from "../../avatar/roomAvatarSeam"
import { RoomRendererFurnitureSprite } from "../../roomV2/components/RoomRenderer2D"
import { RoomRendererLayeredFurnitureFront } from "../../roomV2/components/RoomRendererLayeredFurniture"
import { animateTo, useMotion } from "../../../ui/motion"
import { getMiniRoomAvatar25dSpec } from "../miniRoomAvatarMotion"
import type { MiniRoomAvatarPosition } from "./miniRoomAvatarPositions"
import {
  getMiniRoomAvatarLayeredSeat,
  NO_MINI_ROOM_LAYERED_SEATS,
  resolveMiniRoomAvatar25dSeatPlacement,
  resolveMiniRoomFigureZIndices,
  type MiniRoomLayeredSeat
} from "./miniRoomLayeredSeats"
import { resolveMiniRoomAvatarAnchorOffset, resolveMiniRoomSpeechBottomPx } from "./miniRoomAvatarStageModel"
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
import { MiniRoomEmoteBurst } from "./MiniRoomEmoteBurst"
import type { MiniRoomEmote, MiniRoomEmotes } from "../emotes/miniRoomEmoteModel"
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
  /** 2.5D avatars: their GPU surface loads but draws nothing while the stage is still fading in. */
  holdGpuSurfaces?: boolean
  /** The local 2.5D avatar is loaded and ready to draw (stable callback: the scene reveals the room with her). */
  onLocalAvatarReady?: () => void
  /** Chat emotes (EXPO_PUBLIC_BLUMI_CHAT_EMOTES): one per speaker, over their chibi. */
  emotes?: MiniRoomEmotes
}

type BubblePlacement = RoomSpeechBubblePlacement

export const AvatarLayer = memo(function AvatarLayer(props: AvatarLayerProps) {
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
    depthScene = EMPTY_MINI_ROOM_DEPTH_SCENE,
    emotes
  } = props
  const sortedAvatars = useMemo(() => Object.values(avatars).sort((a, b) => a.y - b.y), [avatars])
  const committedBubbleGroups = useRef<Readonly<Record<string, readonly SpeechBubble[]>>>({})
  const bubblesBySpeaker = useMemo(
    () => groupMiniRoomSpeechBySpeaker(bubbles, committedBubbleGroups.current),
    [bubbles]
  )
  useLayoutEffect(() => {
    committedBubbleGroups.current = bubblesBySpeaker
  }, [bubblesBySpeaker])
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
  // The same size for React: the calibrated 2.5D figure's height and seat offsets are px. The room
  // keeps one layout (the keyboard framing is a transform), so this changes only when the stage is laid out.
  const [stagePx, setStagePx] = useState({ width: 0, height: 0 })
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    stageWidth.value = width
    stageHeight.value = height
    setStagePx((current) => current.width === width && current.height === height ? current : { width, height })
  }, [stageHeight, stageWidth])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={handleLayout}>
      <AvatarBodyLayer
        avatars={sortedAvatars}
        avatarPositions={avatarPositions}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        stagePx={stagePx}
        depthScene={depthScene}
        localUserId={localUserId}
        partnerJustJoined={partnerJustJoined}
        motionPolicy={motionPolicy}
        holdGpuSurfaces={props.holdGpuSurfaces}
        onLocalAvatarReady={props.onLocalAvatarReady}
      />
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
        const speechBottomPx = resolveMiniRoomSpeechBottomPx({
          footFromBottomPx: MINI_ROOM_ANCHOR_POINT_FROM_BOTTOM,
          figureHeightPx: resolveMiniRoomFigureHeightPx(avatar, stagePx.height),
          raised: bubblesAreClose && avatar.userId !== leftBubbleUserId
        })
        return (
          <AvatarOverlay
            key={`${avatar.userId}:overlay`}
            avatar={avatar}
            position={position}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            bubbles={avatarBubbles}
            bubblePlacement={bubblePlacement}
            speechBottomPx={speechBottomPx}
            onDismissBubble={onDismissBubble}
            dismissBubbleLabel={dismissBubbleLabel}
            isLocal={isLocal}
            localUserLabel={localUserLabel}
            motionPolicy={motionPolicy}
            typing={avatar.userId === typingUserId}
            emote={emotes?.[avatar.userId]}
          />
        )
      })}
    </View>
  )
})

/** Speech changes leave furniture, depth worklets and unchanged figures behind this boundary. */
const AvatarBodyLayer = memo(function AvatarBodyLayer(props: {
  avatars: readonly AvatarState[]
  avatarPositions: AvatarLayerProps["avatarPositions"]
  stageWidth: SharedValue<number>
  stageHeight: SharedValue<number>
  stagePx: { width: number; height: number }
  depthScene: MiniRoomDepthScene
  localUserId: string
  partnerJustJoined: boolean
  motionPolicy: MiniRoomMotionPolicy
  holdGpuSurfaces?: boolean
  onLocalAvatarReady?: () => void
}) {
  const { avatars, avatarPositions, stageWidth, stageHeight, depthScene, localUserId, partnerJustJoined, motionPolicy } = props
  // A seated (or sitting-down / standing-up) avatar sorts at its seat's depth.
  const { neighbours, occluders, seatDepthByHotspotId } = depthScene
  const seatKey = avatars
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
    avatars.map((avatar) => ({ id: avatar.userId, depth: avatar.y, foot: { x: avatar.x, y: avatar.y } }))))
  useAnimatedReaction(
    () => resolveMiniRoomDepthOrder(neighbours, Object.keys(avatarPositions).map((id) => {
      const position = avatarPositions[id]!
      const pinned = pinnedDepths[id]
      return {
        id,
        depth: resolveMiniRoomAvatarSortDepth(position.y.value, pinned),
        foot: pinned === undefined ? { x: position.x.value, y: position.y.value } : undefined
      }
    })),
    (order, previous) => {
      if (order !== previous) scheduleOnRN(setDepthOrder, order)
    },
    [avatarPositions, neighbours, pinnedDepths]
  )
  // layered pieces (room calibration): a sitter is drawn between the piece's back layer (its
  // occluder sprite) and its front layer, cut at her own seat's cushion edge. No such piece exists in any other
  // bundle, so the z-indices there are exactly the depth model's.
  const layeredSeats = depthScene.layeredSeats ?? NO_MINI_ROOM_LAYERED_SEATS
  const layeredSitters = useMemo(() => {
    const sitters: { userId: string; seat: MiniRoomLayeredSeat }[] = []
    for (const avatar of avatars) {
      const seat = getMiniRoomAvatarLayeredSeat(avatar, layeredSeats)
      if (seat) sitters.push({ userId: avatar.userId, seat })
    }
    return sitters
  }, [avatars, layeredSeats])
  const zIndices = useMemo(() => {
    const base = resolveMiniRoomDepthZIndices(depthOrder, occluders.length)
    return layeredSeats === NO_MINI_ROOM_LAYERED_SEATS
      ? { ...base, fronts: {} as Readonly<Record<string, number>> }
      : resolveMiniRoomFigureZIndices(base, layeredSitters.map((sitter) => sitter.userId))
  }, [depthOrder, layeredSeats, layeredSitters, occluders.length])

  return (
    <>
      {occluders.map((item, index) => (
        <RoomRendererFurnitureSprite key={item.renderId} item={item} zIndex={zIndices.occluders[index] ?? 0} />
      ))}
      {layeredSitters.map(({ userId, seat }) => (
        <RoomRendererLayeredFurnitureFront
          key={`${userId}:front`}
          item={seat.piece}
          frontVisibleHeight={seat.art.frontVisibleHeight}
          zIndex={zIndices.fronts[userId] ?? 0}
          testID={`mini-room-front-${seat.hotspotId}`}
        />
      ))}
      {avatars.map((avatar) => {
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
            stagePx={props.stagePx}
            layeredSeat={getMiniRoomAvatarLayeredSeat(avatar, layeredSeats)}
            zIndex={zIndices.avatars[avatar.userId] ?? 0}
            // A walk in from the door is the arrival's one hero; the ring is for a plain
            // fade-in, so it stays off for a walk-in even after it lands.
            showJoinPulse={!isLocal && partnerJustJoined && !avatar.enteringFromDoor && !avatar.arrivedByWalk}
            motionPolicy={motionPolicy}
            holdGpuSurface={props.holdGpuSurfaces}
            onReady={isLocal ? props.onLocalAvatarReady : undefined}
          />
        )
      })}
    </>
  )
})

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
  stagePx: { width: number; height: number }
  /** Room calibration: the layered seat she sits on (her hip goes on its hip point). */
  layeredSeat?: MiniRoomLayeredSeat
  /** Changes only when the depth order flips. */
  zIndex: number
  showJoinPulse: boolean
  motionPolicy: MiniRoomMotionPolicy
  holdGpuSurface?: boolean
  /** Her GPU surface is loaded (fires once per build). */
  onReady?: () => void
}

/** The chibi body and its floor ring: sorted among the furniture by depth. */
/** avatarImageWrap's height: the box the avatar art is fitted into. */
const MINI_ROOM_AVATAR_BOX_HEIGHT = 108
/** The room calibration from the installed seam. */
const roomCalibration = roomAvatar25d.roomCalibration
/** Where the anchor's room point is, measured up from the anchor box's bottom (its height less marginTop). */
const MINI_ROOM_ANCHOR_POINT_FROM_BOTTOM = 142 - 130

/** A calibrated 2.5D figure's standing height on this stage (the same one AvatarFigure draws); else undefined. */
function resolveMiniRoomFigureHeightPx(avatar: AvatarState, stageHeightPx: number): number | undefined {
  if (!roomCalibration || stageHeightPx <= 0) return undefined
  const spec = getMiniRoomAvatar25dSpec({ appearance: avatar.appearance, motion: avatar.motion, facing: avatar.facing })
  return spec ? roomCalibration.avatarFigureHeightPx(stageHeightPx, spec.rig) : undefined
}

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
  const avatar25d = useMemo(
    () => getMiniRoomAvatar25dSpec({
      appearance: avatar.appearance,
      motion: avatar.motion,
      facing: avatar.facing
    }),
    [avatar.appearance, avatar.facing, avatar.motion]
  )
  const loops = useMiniRoomAvatarLoops(resolveMiniRoomAvatarLoops({
    motion: avatar.motion,
    policy: motionPolicy,
    // the 2.5D drawing animates itself; no procedural breathe or bob runs under it
    usesAnimatedFrames: avatar25d !== null,
    arriving: showJoinPulse
  }))

  const facingSignX = avatar.facing === "left" ? -1 : 1
  // room calibration with a 2.5D figure (My Room's rules): one world height everywhere (no depth
  // scale), her soles on the room point the walk, depth and taps use, and no procedural bob, squash or lean, since
  // the 2.5D drawing moves itself and a seated hip must stay on its seat.
  const calibrated = Boolean(avatar25d && roomCalibration)
  const facingLean = !calibrated && (avatar.facing === "left" || avatar.facing === "right") ? 1 : 0
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
  const bodyStyle = useAnimatedStyle(() => calibrated ? { transform: [{ scaleX: facingSignX }] } : ({
    transform: [
      { translateY: -3 * walkBob.value - 1.2 * breathe.value },
      { scaleX: facingSignX },
      { scaleY: 1 + 0.018 * breathe.value },
      { rotate: leanRotate },
      { rotate: `${2 * speaking.value}deg` }
    ]
  }))
  const depthScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: calibrated ? 1 : 0.9 + position.y.value * 0.2 }]
  }))
  const { stagePx, layeredSeat } = props
  const calibratedFigureHeightPx = calibrated && roomCalibration && stagePx.height > 0
    ? roomCalibration.avatarFigureHeightPx(stagePx.height, avatar25d?.rig)
    : undefined
  const seatPlacement = useMemo(() => calibrated ? resolveMiniRoomAvatar25dSeatPlacement({
    avatar: { x: avatar.x, y: avatar.y },
    seat: layeredSeat,
    stageWidthPx: stagePx.width,
    stageHeightPx: stagePx.height
  }) : undefined, [avatar.x, avatar.y, calibrated, layeredSeat, stagePx.height, stagePx.width])

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
          calibrated ? styles.avatarOnRoomPoint : avatar.motion === "walking" ? styles.avatarWalking : null,
          !calibrated && isSitting ? styles.avatarSitting : null,
          depthScaleStyle
        ]}
      >
        <Reanimated.View style={[styles.avatarImageFill, bodyStyle]}>
          {avatar25d ? (
            <AvatarLive
              liveScope="miniRoom"
              spec={avatar25d}
              live={position}
              stageWidthPx={stageWidth}
              stageHeightPx={stageHeight}
              outerMirrored={facingSignX < 0}
              reduceMotion={!motionPolicy.animateBreathe}
              boxHeightPx={MINI_ROOM_AVATAR_BOX_HEIGHT}
              calibratedFigureHeightPx={calibratedFigureHeightPx}
              seatPlacement={seatPlacement}
              holdCanvas={props.holdGpuSurface}
              onDrawn={props.onReady}
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
  /** Speech and typing dots, up from the anchor box's bottom (resolveMiniRoomSpeechBottomPx). */
  speechBottomPx: number
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
  isLocal: boolean
  localUserLabel: string
  motionPolicy: MiniRoomMotionPolicy
  typing: boolean
  emote?: MiniRoomEmote
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
    speechBottomPx,
    onDismissBubble,
    dismissBubbleLabel,
    isLocal,
    localUserLabel,
    motionPolicy,
    typing,
    emote
  } = props
  return (
    <AvatarAnchor avatar={avatar} position={position} stageWidth={stageWidth} stageHeight={stageHeight}
      zIndex={OVERLAY_Z_INDEX} pointerEvents="box-none">
      {/* Drawn under the speech lines, on the side away from them, so a line stays readable. */}
      {emote ? (
        <MiniRoomEmoteBurst key={emote.key} emote={emote.emote} side={bubblePlacement === "right" ? "left" : "right"}
          reduceMotion={!motionPolicy.animateBubble} />
      ) : null}
      <RoomSpeechBubbleStack
        bubbles={bubbles}
        placement={bubblePlacement}
        bottomPx={speechBottomPx}
        animate={motionPolicy.animateBubble}
        onDismissBubble={onDismissBubble}
        dismissBubbleLabel={dismissBubbleLabel}
      />
      {/* A spoken line wins over the dots; the art and its transforms are untouched. */}
      {typing && bubbles.length === 0 ? <RoomTypingBubble bottomPx={speechBottomPx} /> : null}
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
    height: MINI_ROOM_AVATAR_BOX_HEIGHT,
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
  avatarWalking: {
    bottom: 24
  },
  avatarSitting: {
    bottom: 4
  },
  avatarOnRoomPoint: {
    bottom: MINI_ROOM_ANCHOR_POINT_FROM_BOTTOM
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
