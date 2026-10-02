import { Image as ExpoImage } from "expo-image"
import { StyleSheet, View, type ImageStyle } from "react-native"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue
} from "react-native-reanimated"
import type {
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../../roomV2/roomV2.types"
import type {
  RoomAvatarFitProfileId,
  RoomAvatarLayerType
} from "../avatarRoom.types"
import { useReducedMotion } from "../../../../ui/animations"
import {
  getRoomAvatarFrameIndex,
  getRoomAvatarFrameTick,
  getRoomAvatarLayerAnimationState,
  getRoomAvatarLayerFrameAsset,
  getRoomAvatarReadyFrameSlot,
  getRoomAvatarLayerFrameSlots,
  retainRoomAvatarFrameSlots,
  shouldRerenderRoomAvatarLayer
} from "../roomAvatarLayerRenderModel"

interface RoomAvatarRenderer2DProps {
  layers: RoomV2AvatarRenderLayer[]
  imagePriority?: "low" | "normal" | "high"
  onLayerDisplay?: (id: string) => void
  onImageError?: () => void
}

/** The frame the UI thread shows, tagged with the motion it belongs to. */
interface RoomAvatarFrameState {
  signature: string
  index: number
}

const STATIC_FRAME_STATE: RoomAvatarFrameState = { signature: "static", index: 0 }

/**
 * Layered avatar with frame-by-frame motion. Frame selection runs on the UI
 * thread: a frame callback reads the shared UI frame timestamp, advances one
 * frame per frame duration (every avatar changes on the same tick boundary)
 * and each frame image's opacity follows it. React renders only when the
 * layers or the motion change, never per animation frame. Reduce Motion and
 * still avatars show frame 0 with the frame callback inactive.
 */
export const RoomAvatarRenderer2D = memo(function RoomAvatarRenderer2D(props: RoomAvatarRenderer2DProps) {
  const { layers, imagePriority = "high" } = props
  const reduceMotion = useReducedMotion()
  const animation = useMemo(
    () => getRoomAvatarLayerAnimationState(layers, !reduceMotion),
    [layers, reduceMotion]
  )
  const { hasAnimation, frameCount, frameDurationMs, loops, signature } = animation
  const frameState = useSharedValue<RoomAvatarFrameState>(STATIC_FRAME_STATE)
  const baseTick = useSharedValue(0)

  const advanceFrame = useCallback((frameInfo: FrameInfo): void => {
    "worklet"
    const tick = getRoomAvatarFrameTick(frameInfo.timestamp, frameDurationMs)
    const current = frameState.value
    if (current.signature !== signature) {
      // A new motion starts at frame 0 on the current tick.
      baseTick.value = tick
      frameState.value = { signature, index: 0 }
      return
    }
    const index = getRoomAvatarFrameIndex(tick - baseTick.value, frameCount, loops)
    if (index !== current.index) frameState.value = { signature, index }
  }, [baseTick, frameCount, frameDurationMs, frameState, loops, signature])
  // useFrameCallback reads `autostart` only on its first render, and the
  // shared Reduce Motion store starts reduced until the OS answers, so the
  // clock is switched on and off explicitly whenever `hasAnimation` changes.
  const frameClock = useFrameCallback(advanceFrame, false)
  useEffect(() => {
    frameClock.setActive(hasAnimation)
  }, [advanceFrame, frameClock, hasAnimation])

  useEffect(() => {
    // Returning to a motion after a still pose restarts it from frame 0.
    if (!hasAnimation) frameState.value = STATIC_FRAME_STATE
  }, [frameState, hasAnimation])

  return (
    <View pointerEvents="none" style={styles.root}>
      {layers.map((layer) => (
        <RoomAvatarLayer
          key={`${layer.type}:${layer.id}`}
          layer={layer}
          animated={hasAnimation}
          signature={signature}
          frameState={frameState}
          imagePriority={imagePriority}
          onLayerDisplay={props.onLayerDisplay}
          onImageError={props.onImageError}
        />
      ))}
    </View>
  )
})

interface RoomAvatarLayerProps {
  layer: RoomV2AvatarRenderLayer
  animated: boolean
  signature: string
  frameState: SharedValue<RoomAvatarFrameState>
  imagePriority: "low" | "normal" | "high"
  onLayerDisplay?: (id: string) => void
  onImageError?: () => void
}

/**
 * Retain each visited pose image until this semantic layer unmounts. Walking
 * and idle exchange visibility on the UI thread without replacing sources or
 * removing the currently visible native image during the React commit.
 */
const RoomAvatarLayer = memo(
  function RoomAvatarLayer(props: RoomAvatarLayerProps) {
    const { layer, animated, signature, frameState, imagePriority } = props
    const displayedSlots = useSharedValue<number[]>([])
    const selectedSlot = useSharedValue(0)
    const current = useMemo(
      () => animated
        ? getRoomAvatarLayerFrameSlots(layer)
        : { assets: [getRoomAvatarLayerFrameAsset(layer, 0)], slotByFrame: [0] },
      [animated, layer]
    )
    const [retainedAssets, setRetainedAssets] = useState<RoomV2AssetRef[]>(current.assets)
    const { assets, slotByFrame } = useMemo(
      () => retainRoomAvatarFrameSlots(
        retainedAssets, current.slotByFrame.map((slot) => current.assets[slot]!)
      ),
      [current, retainedAssets]
    )
    // A guarded render-time update commits the enlarged pool with this pose.
    // This happens only when a new asset is visited, never on animation ticks.
    if (assets !== retainedAssets) setRetainedAssets(assets)
    useAnimatedReaction(
      () => {
        const state = frameState.value
        const frameIndex = state.signature === signature ? state.index : 0
        return getRoomAvatarReadyFrameSlot(slotByFrame, frameIndex, displayedSlots.value, -1)
      },
      (readySlot) => {
        if (readySlot >= 0) selectedSlot.value = readySlot
      },
      [signature, slotByFrame]
    )
    return (
      <>
        {assets.map((asset, slot) => (
          <RoomAvatarLayerImage
            key={slot}
            asset={asset}
            layer={layer}
            slot={slot}
            displayedSlots={displayedSlots}
            selectedSlot={selectedSlot}
            imagePriority={imagePriority}
            onLayerDisplay={slot === slotByFrame[0] ? props.onLayerDisplay : undefined}
            onImageError={props.onImageError}
          />
        ))}
      </>
    )
  },
  (previous, next) =>
    previous.animated === next.animated &&
    (!next.animated || previous.signature === next.signature) &&
    previous.frameState === next.frameState &&
    previous.imagePriority === next.imagePriority &&
    previous.onLayerDisplay === next.onLayerDisplay &&
    previous.onImageError === next.onImageError &&
    !shouldRerenderRoomAvatarLayer(
      { layer: previous.layer, frameIndex: 0 },
      { layer: next.layer, frameIndex: 0 }
    )
)

function RoomAvatarLayerImage(props: {
  asset: RoomV2AssetRef
  layer: RoomV2AvatarRenderLayer
  slot: number
  displayedSlots: SharedValue<number[]>
  selectedSlot: SharedValue<number>
  imagePriority: "low" | "normal" | "high"
  onLayerDisplay?: (id: string) => void
  onImageError?: () => void
}) {
  const { asset, layer, slot, selectedSlot, imagePriority, displayedSlots } = props
  const visibility = useAnimatedStyle(() => ({ opacity: selectedSlot.value === slot ? 1 : 0 }))
  return (
    <Animated.View pointerEvents="none" style={[styles.layer, visibility]}>
      <ExpoImage
        source={asset.source}
        contentFit="contain"
        cachePolicy="memory-disk"
        priority={imagePriority}
        transition={0}
        onDisplay={() => {
          displayedSlots.modify((slots) => {
            "worklet"
            return slots.includes(slot) ? slots : [...slots, slot]
          })
          props.onLayerDisplay?.(`${layer.type}:${layer.id}`)
        }}
        onError={props.onImageError}
        style={[
          styles.layer,
          getLayerFitStyle(layer)
        ]}
      />
    </Animated.View>
  )
}

const ROOM_AVATAR_LAYER_FIT: Record<
  RoomAvatarFitProfileId,
  Partial<Record<RoomAvatarLayerType, ImageStyle>>
> = {
  // Female Motion v1 layers share the same approved 256x384 front rig.
  // Per-layer transforms break the pixel alignment established by asset QA.
  blumi_female_room_avatar_v1: {},
  // Male starter layers are authored on their own shared 256x384 fit profile.
  // They must render pixel-aligned without per-layer transforms as well.
  blumi_male_room_avatar_v1: {}
}

function getLayerFitStyle(layer: RoomV2AvatarRenderLayer): ImageStyle | undefined {
  if (
    !isRoomAvatarFitProfileId(layer.fitProfileId) ||
    !isRoomAvatarLayerType(layer.type)
  ) {
    return undefined
  }
  return ROOM_AVATAR_LAYER_FIT[layer.fitProfileId]?.[layer.type]
}

function isRoomAvatarFitProfileId(
  value: string | undefined
): value is RoomAvatarFitProfileId {
  return (
    value === "blumi_female_room_avatar_v1" ||
    value === "blumi_male_room_avatar_v1"
  )
}

function isRoomAvatarLayerType(
  value: string
): value is RoomAvatarLayerType {
  return (
    value === "hairBack" ||
    value === "base" ||
    value === "face" ||
    value === "eyes" ||
    value === "nose" ||
    value === "mouth" ||
    value === "hair" ||
    value === "bottom" ||
    value === "shoes" ||
    value === "topInner" ||
    value === "top" ||
    value === "topOuter" ||
    value === "accessory" ||
    value === "hairFront"
  )
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "visible"
  },
  layer: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%"
  }
})
