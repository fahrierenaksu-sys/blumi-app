import { Image, StyleSheet, View, type ImageStyle } from "react-native"
import {
  memo,
  useCallback,
  useMemo,
  useSyncExternalStore
} from "react"
import type {
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../../roomV2/roomV2.types"
import type {
  RoomAvatarFitProfileId,
  RoomAvatarLayerType
} from "../avatarRoom.types"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "../avatarRoomMotionContract"
import { useReducedMotion } from "../../../../ui/animations"

interface RoomAvatarRenderer2DProps {
  layers: RoomV2AvatarRenderLayer[]
}

interface RoomAvatarFrameTickerStore {
  frame: number
  intervalId: ReturnType<typeof setInterval> | null
  listeners: Set<() => void>
}

const roomAvatarFrameTickerStores = new Map<number, RoomAvatarFrameTickerStore>()

export function RoomAvatarRenderer2D(props: RoomAvatarRenderer2DProps) {
  const { layers } = props
  const reduceMotion = useReducedMotion()
  const animation = useMemo(
    () => getLayerAnimationState(layers, !reduceMotion),
    [layers, reduceMotion]
  )
  const subscribeToFrameTicker = useCallback(
    (listener: () => void) =>
      animation.hasAnimation
        ? subscribeRoomAvatarFrameTicker(animation.frameDurationMs, listener)
        : () => undefined,
    [animation.frameDurationMs, animation.hasAnimation]
  )
  const getFrameTickerSnapshot = useCallback(
    () =>
      animation.hasAnimation
        ? getRoomAvatarFrameTickerSnapshot(animation.frameDurationMs)
        : 0,
    [animation.frameDurationMs, animation.hasAnimation]
  )
  const frameBaseline = useMemo(
    () =>
      animation.hasAnimation
        ? getRoomAvatarFrameTickerSnapshot(animation.frameDurationMs)
        : 0,
// eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional external-store invalidation; dependency shape is covered by runtime contracts.
    [
      animation.frameDurationMs,
      animation.hasAnimation,
      animation.signature
    ]
  )
  const frameTick = useSyncExternalStore(
    subscribeToFrameTicker,
    getFrameTickerSnapshot,
    () => 0
  )

  const frameOffset = Math.max(0, frameTick - frameBaseline)
  const frameIndex = !animation.hasAnimation
    ? 0
    : animation.loops
      ? frameOffset % animation.frameCount
      : Math.min(frameOffset, animation.frameCount - 1)

  return (
    <View pointerEvents="none" style={styles.root}>
      {layers.map((layer) => (
        <RoomAvatarLayerImage
          key={`${layer.type}:${layer.id}`}
          layer={layer}
          frameIndex={frameIndex}
        />
      ))}
    </View>
  )
}

interface RoomAvatarLayerImageProps {
  layer: RoomV2AvatarRenderLayer
  frameIndex: number
}

const RoomAvatarLayerImage = memo(
  function RoomAvatarLayerImage(props: RoomAvatarLayerImageProps) {
    const { layer, frameIndex } = props
    const asset = getLayerFrameAsset(layer, frameIndex)

    return (
      <Image
        source={asset.source}
        resizeMode="contain"
        fadeDuration={0}
        style={[
          styles.layer,
          getLayerFitStyle(layer)
        ]}
      />
    )
  },
  (previous, next) =>
    previous.layer === next.layer &&
    (
      !hasAnimatedLayerFrames(next.layer) ||
      previous.frameIndex === next.frameIndex
    )
)

function hasAnimatedLayerFrames(layer: RoomV2AvatarRenderLayer): boolean {
  return (layer.animation?.frames.length ?? 0) > 1
}

function getLayerFrameAsset(
  layer: RoomV2AvatarRenderLayer,
  frameIndex: number
): RoomV2AssetRef {
  const frames = layer.animation?.frames
  if (!frames?.length) return layer.asset
  return frames[frameIndex % frames.length] ?? layer.asset
}

function getLayerAnimationState(layers: RoomV2AvatarRenderLayer[], animate: boolean): {
  hasAnimation: boolean
  frameCount: number
  frameDurationMs: number
  loops: boolean
  signature: string
} {
  const animatedLayers = animate ? layers.filter(hasAnimatedLayerFrames) : []
  if (!animatedLayers.length) {
    return {
      hasAnimation: false,
      frameCount: 1,
      frameDurationMs: ROOM_AVATAR_FRAME_DURATION_MS,
      loops: false,
      signature: "static"
    }
  }
  const frameCount = Math.max(
    ...animatedLayers.map((layer) => layer.animation?.frames.length ?? 1)
  )
  const frameDurationMs = Math.max(
    80,
    Math.min(
      ...animatedLayers.map(
        (layer) => layer.animation?.frameDurationMs ?? ROOM_AVATAR_FRAME_DURATION_MS
      )
    )
  )
  return {
    hasAnimation: true,
    frameCount,
    frameDurationMs,
    loops: animatedLayers.some((layer) => layer.animation?.loop !== false),
    signature: animatedLayers
      .map((layer) => `${layer.id}:${layer.animation?.frames.map((frame) => frame.key).join("|")}`)
      .join(";")
  }
}

function getRoomAvatarFrameTickerStore(frameDurationMs: number): RoomAvatarFrameTickerStore {
  const existing = roomAvatarFrameTickerStores.get(frameDurationMs)
  if (existing) return existing
  const created: RoomAvatarFrameTickerStore = {
    frame: 0,
    intervalId: null,
    listeners: new Set()
  }
  roomAvatarFrameTickerStores.set(frameDurationMs, created)
  return created
}

function subscribeRoomAvatarFrameTicker(
  frameDurationMs: number,
  listener: () => void
): () => void {
  const store = getRoomAvatarFrameTickerStore(frameDurationMs)
  store.listeners.add(listener)
  if (store.intervalId === null) {
    store.intervalId = setInterval(() => {
      store.frame += 1
      for (const currentListener of store.listeners) currentListener()
    }, frameDurationMs)
  }
  return () => {
    const activeStore = getRoomAvatarFrameTickerStore(frameDurationMs)
    activeStore.listeners.delete(listener)
    if (activeStore.listeners.size === 0 && activeStore.intervalId !== null) {
      clearInterval(activeStore.intervalId)
      activeStore.intervalId = null
    }
  }
}

function getRoomAvatarFrameTickerSnapshot(frameDurationMs: number): number {
  return getRoomAvatarFrameTickerStore(frameDurationMs).frame
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
