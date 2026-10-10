import { Image as ExpoImage } from "expo-image"
import { memo, useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateSegment } from "../../../ui/motion"
import type { RoomV2FurnitureRenderItem } from "../roomV2.types"
import { getRoomEditorDragGhostFrame, getRoomEditorDrawPoint } from "./roomEditorDragModel"
import {
  easeInOutQuad,
  easeOutQuad,
  getRoomEditorSparkleFrame,
  getRoomEditorTurnFrame,
  getRoomEditorTurnMs,
  getRoomEditorTurnOffset,
  ROOM_EDITOR_SPARKLE_COUNT,
  ROOM_EDITOR_SPARKLE_MS
} from "./roomEditorPlaceMotion"
import type { RoomEditorStageEffect } from "./useRoomEditorStageEffects"

interface StageSize {
  width: number
  height: number
}

const SPARKLE_INDICES = Array.from({ length: ROOM_EDITOR_SPARKLE_COUNT }, (_, index) => index)

/**
 * The stage's reward beats, drawn above the room in stage pixels (so they follow the stage's zoom) and never
 * touchable: a sparkle burst where a drop landed, and a soft turn. One UI-thread clock per beat; transform and
 * opacity only; nothing re-renders while a beat plays.
 */
export const RoomEditorStageEffects = memo(function RoomEditorStageEffects(props: {
  effect: RoomEditorStageEffect | undefined
  stageSize: StageSize
  onDone: (key: number) => void
}) {
  const { effect, stageSize, onDone } = props
  if (!effect || stageSize.width <= 0 || stageSize.height <= 0) return null
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {effect.kind === "sparkle" ? (
        <SparkleBurst key={effect.key} effectKey={effect.key} item={effect.item} stageSize={stageSize} onDone={onDone} />
      ) : (
        <SoftTurn
          key={effect.key}
          effectKey={effect.key}
          from={effect.from}
          to={effect.to}
          durationMs={getRoomEditorTurnMs(effect.nudged)}
          stageSize={stageSize}
          onDone={onDone}
        />
      )}
    </View>
  )
})

/** Where the stars gather: the middle of the piece's floor cells, and how wide those cells are (px). */
function getSparkleOrigin(item: RoomV2FurnitureRenderItem, stageSize: StageSize) {
  const points = item.footprintCells?.flat() ?? []
  if (points.length === 0) {
    const draw = getRoomEditorDrawPoint(item)
    const frame = getRoomEditorDragGhostFrame(item, stageSize)
    return { x: draw.x * stageSize.width, y: draw.y * stageSize.height, width: frame.width * 0.8 }
  }
  const xs = points.map((point) => point.x * stageSize.width)
  const ys = points.map((point) => point.y * stageSize.height)
  return {
    x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
    y: ys.reduce((sum, value) => sum + value, 0) / ys.length,
    width: Math.max(...xs) - Math.min(...xs)
  }
}

function SparkleBurst(props: {
  effectKey: number
  item: RoomV2FurnitureRenderItem
  stageSize: StageSize
  onDone: (key: number) => void
}) {
  const { effectKey, item, stageSize, onDone } = props
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = animateSegment(1, { durationMs: ROOM_EDITOR_SPARKLE_MS, easing: easeOutQuad }, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(onDone, effectKey)
    })
  }, [effectKey, onDone, progress])
  const origin = getSparkleOrigin(item, stageSize)
  return (
    <View style={[effectStyles.origin, { left: origin.x, top: origin.y }]}>
      {SPARKLE_INDICES.map((index) => (
        <Sparkle key={index} index={index} width={origin.width} progress={progress} />
      ))}
    </View>
  )
}

function Sparkle(props: { index: number; width: number; progress: { value: number } }) {
  const { index, width, progress } = props
  const style = useAnimatedStyle(() => {
    const frame = getRoomEditorSparkleFrame(index, progress.value, width)
    return {
      opacity: frame.opacity,
      transform: [
        { translateX: frame.translateX },
        { translateY: frame.translateY },
        { rotate: `${frame.rotateDeg}deg` },
        { scale: frame.scale }
      ]
    }
  })
  return (
    <Animated.View style={[effectStyles.sparkle, style]}>
      <View style={effectStyles.sparkleRayVertical} />
      <View style={effectStyles.sparkleRayHorizontal} />
      <View style={effectStyles.sparkleCore} />
    </Animated.View>
  )
}

function SoftTurn(props: {
  effectKey: number
  from: RoomV2FurnitureRenderItem
  to: RoomV2FurnitureRenderItem
  durationMs: number
  stageSize: StageSize
  onDone: (key: number) => void
}) {
  const { effectKey, from, to, durationMs, stageSize, onDone } = props
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = animateSegment(1, { durationMs, easing: easeInOutQuad }, (finished) => {
      "worklet"
      // The room hid the piece while it turned; it now draws it again under the last frame (useRoomEditorStageEffects).
      if (finished) scheduleOnRN(onDone, effectKey)
    })
  }, [durationMs, effectKey, onDone, progress])
  const fromDraw = getRoomEditorDrawPoint(from)
  const toDraw = getRoomEditorDrawPoint(to)
  const delta = {
    x: (toDraw.x - fromDraw.x) * stageSize.width,
    y: (toDraw.y - fromDraw.y) * stageSize.height
  }
  return (
    <>
      <TurnSprite item={to} stageSize={stageSize} progress={progress} role="incoming" delta={delta} />
      <TurnSprite item={from} stageSize={stageSize} progress={progress} role="outgoing" delta={delta} />
    </>
  )
}

function TurnSprite(props: {
  item: RoomV2FurnitureRenderItem
  stageSize: StageSize
  progress: { value: number }
  role: "incoming" | "outgoing"
  /** New drawn spot minus old drawn spot (px): both drawings travel it together. */
  delta: { x: number; y: number }
}) {
  const { item, stageSize, progress, role, delta } = props
  const frame = getRoomEditorDragGhostFrame(item, stageSize)
  const draw = getRoomEditorDrawPoint(item)
  const isIncoming = role === "incoming"
  const deltaX = delta.x
  const deltaY = delta.y
  const style = useAnimatedStyle(() => {
    const turn = getRoomEditorTurnFrame(progress.value)
    const offset = getRoomEditorTurnOffset(role, turn.slide, { x: deltaX, y: deltaY })
    return {
      opacity: isIncoming ? turn.incomingOpacity : turn.outgoingOpacity,
      transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: turn.scale }]
    }
  })
  return (
    <Animated.View
      style={[
        effectStyles.sprite,
        {
          left: draw.x * stageSize.width + frame.offsetX,
          top: draw.y * stageSize.height + frame.offsetY,
          width: frame.width,
          height: frame.height,
          // the pulse grows from the piece's floor contact, so it never lifts off its cells
          transformOrigin: [-frame.offsetX, -frame.offsetY, 0]
        },
        style
      ]}
    >
      <ExpoImage
        source={item.asset.source}
        contentFit="contain"
        cachePolicy="memory-disk"
        allowDownscaling={false}
        transition={0}
        style={[StyleSheet.absoluteFill, { transform: [{ scaleX: item.usesMirroredRotation ? -1 : 1 }] }]}
      />
    </Animated.View>
  )
}

const SPARKLE_SIZE = 14

const effectStyles = StyleSheet.create({
  origin: {
    position: "absolute",
    width: 0,
    height: 0
  },
  sparkle: {
    position: "absolute",
    left: -SPARKLE_SIZE / 2,
    top: -SPARKLE_SIZE / 2,
    width: SPARKLE_SIZE,
    height: SPARKLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF9EC4",
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 }
  },
  sparkleRayVertical: {
    position: "absolute",
    width: 3,
    height: SPARKLE_SIZE,
    borderRadius: 2,
    backgroundColor: "#FFF6DC"
  },
  sparkleRayHorizontal: {
    position: "absolute",
    width: SPARKLE_SIZE,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFF6DC"
  },
  sparkleCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF"
  },
  sprite: {
    position: "absolute"
  }
})
