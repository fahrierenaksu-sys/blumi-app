import { Image as ExpoImage } from "expo-image"
import { PixelRatio, StyleSheet, View, type ImageStyle, type LayoutChangeEvent } from "react-native"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import type {
  RoomV2AssetCrop,
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../../roomV2/roomV2.types"
import type {
  RoomAvatarFitProfileId,
  RoomAvatarLayerType
} from "../avatarRoom.types"
import { useReducedMotion } from "../../../../ui/animations"
import { getRoomAvatarStrideFrameIndex } from "../../../roomV2/components/roomAvatarBodyMotionModel"
import {
  addRoomAvatarTableToPool,
  getRoomAvatarAtlasCropLayout,
  getRoomAvatarFrameIndex,
  getRoomAvatarFrameTable,
  getRoomAvatarFrameTick,
  getRoomAvatarFrameToApply,
  getRoomAvatarLayerAnimationState,
  getRoomAvatarShownImages,
  pruneRoomAvatarPool,
  type RoomAvatarAppliedFrame,
  type RoomAvatarFrameTable
} from "../roomAvatarLayerRenderModel"

interface RoomAvatarRenderer2DProps {
  layers: RoomV2AvatarRenderLayer[]
  imagePriority?: "low" | "normal" | "high"
  /** Keep original sprite pixels when a room camera scales the native image view. */
  allowDownscaling?: boolean
  /** A layer (`type:id`) is on screen: called for every layer once its look is first shown whole. */
  onLayerDisplay?: (id: string) => void
  /** Every layer of the current look is on screen together (once per new look or pose). */
  onAllLayersShown?: () => void
  onImageError?: () => void
  /**
   * Walk-cycle phase (0..1) driven by distance travelled. When set, a looping
   * motion shows the frame for this phase instead of following the clock, so
   * the feet plant while the avatar moves and hold still when it stops.
   */
  strideProgress?: SharedValue<number>
}

/** The frame the clock asks for, tagged with the motion it belongs to. */
interface RoomAvatarFrameState {
  signature: string
  index: number
}

const STATIC_FRAME_STATE: RoomAvatarFrameState = { signature: "static", index: 0 }
const NOTHING_APPLIED: RoomAvatarAppliedFrame = { signature: "", index: -1 }

/** The renderer's laid-out size; atlas frames need it to place their crop. */
interface RoomAvatarBoxSize {
  width: number
  height: number
}

/**
 * Layered avatar with frame-by-frame motion. Frame selection runs on the UI
 * thread: a frame callback reads the shared UI frame timestamp and advances
 * one frame per frame duration (every avatar changes on the same tick
 * boundary). The avatar is drawn whole or not at all: frame N replaces the
 * frame on screen only once every layer's image for frame N has displayed, so
 * body, hair and clothes never change at different times, and a new look or
 * avatar appears complete instead of layer by layer. Images stay mounted for
 * the pose on screen, the next pose and idle; React renders only when the
 * layers or that pool change, never per animation frame. Reduce Motion and
 * still avatars show frame 0 with the frame callback inactive.
 */
export const RoomAvatarRenderer2D = memo(function RoomAvatarRenderer2D(props: RoomAvatarRenderer2DProps) {
  const { layers, imagePriority = "high", allowDownscaling = true, strideProgress, onLayerDisplay, onAllLayersShown } = props
  const reduceMotion = useReducedMotion()
  const animation = useMemo(
    () => getRoomAvatarLayerAnimationState(layers, !reduceMotion),
    [layers, reduceMotion]
  )
  const { hasAnimation, frameCount, frameDurationMs, loops, signature } = animation
  const table = useMemo(
    () => getRoomAvatarFrameTable(layers, hasAnimation, frameCount),
    [frameCount, hasAnimation, layers]
  )
  const frameState = useSharedValue<RoomAvatarFrameState>(STATIC_FRAME_STATE)
  const baseTick = useSharedValue(0)
  // Images that have displayed (or failed, so they never block the avatar),
  // the image each layer shows, and the frame that choice came from.
  const displayed = useSharedValue<Record<string, boolean>>({})
  const shown = useSharedValue<Record<string, string>>({})
  const applied = useSharedValue<RoomAvatarAppliedFrame>(NOTHING_APPLIED)
  const displayedRef = useRef(new Set<string>())
  const appliedSignatureRef = useRef("")

  // The mounted images: the current table, plus the pose still on screen until
  // the current one replaces it, plus idle. Guarded render-time updates commit
  // a changed pool with this pose; they never happen on animation ticks.
  const [pool, setPool] = useState(() => addRoomAvatarTableToPool([], layers, table))
  const [idleTable, setIdleTable] = useState<RoomAvatarFrameTable | null>(hasAnimation ? null : table)
  if (!hasAnimation && idleTable?.signature !== table.signature) setIdleTable(table)
  const [shownSignature, setShownSignature] = useState("")
  const keepKeys = useMemo(
    () => new Set([...table.images, ...(idleTable?.images ?? [])].map((image) => image.key)),
    [idleTable, table]
  )
  let mountedPool = addRoomAvatarTableToPool(pool, layers, table)
  if (shownSignature === table.signature) mountedPool = pruneRoomAvatarPool(mountedPool, keepKeys)
  if (mountedPool !== pool) setPool(mountedPool)
  const mountedKeys = useMemo(
    () => new Set(mountedPool.flatMap((entry) => entry.images.map((image) => image.key))),
    [mountedPool]
  )
  useEffect(() => {
    // An unmounted image must display again before it can be shown again.
    const dropped = [...displayedRef.current].filter((key) => !mountedKeys.has(key))
    if (!dropped.length) return
    for (const key of dropped) displayedRef.current.delete(key)
    displayed.modify((value) => {
      "worklet"
      const remaining = { ...value }
      for (const key of dropped) delete remaining[key]
      return remaining
    })
  }, [displayed, mountedKeys])

  /** JS side of a new table reaching the screen: unmount what it replaced and report it. */
  const handleTableShown = useCallback((tableSignature: string) => {
    appliedSignatureRef.current = tableSignature
    setShownSignature(tableSignature)
    if (tableSignature !== table.signature) return
    for (const layerKey of table.layerKeys) onLayerDisplay?.(layerKey)
    onAllLayersShown?.()
  }, [onAllLayersShown, onLayerDisplay, table])

  // Only keys cross to the UI thread, never image sources.
  const frameTable = useMemo(
    () => ({ signature: table.signature, frames: table.frames, layerKeys: table.layerKeys }),
    [table]
  )
  const advanceFrame = useCallback((frameInfo: FrameInfo): void => {
    "worklet"
    const tick = getRoomAvatarFrameTick(frameInfo.timestamp, frameDurationMs)
    let target = frameState.value
    if (target.signature !== signature) {
      // A new motion starts at frame 0 on the current tick.
      baseTick.value = tick
      target = { signature, index: 0 }
      frameState.value = target
    } else {
      const index = strideProgress && loops
        ? getRoomAvatarStrideFrameIndex(strideProgress.value, frameCount)
        : getRoomAvatarFrameIndex(tick - baseTick.value, frameCount, loops)
      if (index !== target.index) {
        target = { signature, index }
        frameState.value = target
      }
    }
    const previous = applied.value
    const index = getRoomAvatarFrameToApply(frameTable, target.index, displayed.value, previous)
    if (index < 0) return
    shown.value = getRoomAvatarShownImages(frameTable.layerKeys, frameTable.frames[index]!)
    applied.value = { signature: frameTable.signature, index }
    if (previous.signature !== frameTable.signature) scheduleOnRN(handleTableShown, frameTable.signature)
  }, [applied, baseTick, displayed, frameCount, frameDurationMs, frameState, frameTable, handleTableShown, loops,
    shown, signature, strideProgress])
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

  // A still avatar has no frame clock: its single frame is shown from JS as
  // soon as all of its images have displayed (at once when they already have).
  const showStillFrameIfReady = useCallback(() => {
    if (hasAnimation || appliedSignatureRef.current === table.signature) return
    const frameKeys = table.frames[0]!
    if (!frameKeys.every((key) => displayedRef.current.has(key))) return
    appliedSignatureRef.current = table.signature
    shown.value = getRoomAvatarShownImages(table.layerKeys, frameKeys)
    applied.value = { signature: table.signature, index: 0 }
    handleTableShown(table.signature)
  }, [applied, handleTableShown, hasAnimation, shown, table])
  useEffect(() => {
    showStillFrameIfReady()
  }, [showStillFrameIfReady])

  const handleImageDisplay = useCallback((imageKey: string) => {
    if (displayedRef.current.has(imageKey)) return
    displayedRef.current.add(imageKey)
    displayed.modify((value) => {
      "worklet"
      return value[imageKey] ? value : { ...value, [imageKey]: true }
    })
    showStillFrameIfReady()
  }, [displayed, showStillFrameIfReady])
  const { onImageError } = props
  const handleImageError = useCallback((imageKey: string) => {
    // A broken image draws nothing; it must not hold the rest of the avatar back.
    handleImageDisplay(imageKey)
    onImageError?.()
  }, [handleImageDisplay, onImageError])

  // Atlas frames are placed from the laid-out size. Layout events arrive only
  // when the box changes size (avatars move with transforms), never per frame.
  const [boxSize, setBoxSize] = useState<RoomAvatarBoxSize | null>(null)
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setBoxSize((previous) =>
      previous && previous.width === width && previous.height === height ? previous : { width, height })
  }, [])

  return (
    <View pointerEvents="none" style={styles.root} onLayout={onLayout}>
      {mountedPool.flatMap((entry) => entry.images.map((image) => (
        <RoomAvatarLayerImage
          key={image.key}
          imageKey={image.key}
          layerKey={entry.key}
          asset={image.asset}
          layer={entry.layer}
          boxSize={boxSize}
          shown={shown}
          imagePriority={imagePriority}
          allowDownscaling={allowDownscaling}
          onImageDisplay={handleImageDisplay}
          onImageError={handleImageError}
        />
      )))}
    </View>
  )
})

interface RoomAvatarLayerImageProps {
  imageKey: string
  layerKey: string
  asset: RoomV2AssetRef
  layer: RoomV2AvatarRenderLayer
  boxSize: RoomAvatarBoxSize | null
  shown: SharedValue<Record<string, string>>
  imagePriority: "low" | "normal" | "high"
  allowDownscaling: boolean
  onImageDisplay: (imageKey: string) => void
  onImageError: (imageKey: string) => void
}

/** One mounted image; it is visible only while its layer shows it. */
const RoomAvatarLayerImage = memo(function RoomAvatarLayerImage(props: RoomAvatarLayerImageProps) {
  const { imageKey, layerKey, asset, layer, shown, imagePriority, boxSize, onImageDisplay, onImageError } = props
  const visibility = useAnimatedStyle(() => ({ opacity: shown.value[layerKey] === imageKey ? 1 : 0 }))
  const onDisplay = () => onImageDisplay(imageKey)
  const onError = () => onImageError(imageKey)
  if (asset.crop) {
    const placement = boxSize ? getRoomAvatarAtlasCropPlacement(asset.crop, boxSize) : null
    return (
      <Animated.View pointerEvents="none" style={[styles.layer, visibility]}>
        <View pointerEvents="none" style={[styles.layer, getLayerFitStyle(layer)]}>
          {placement ? (
            <View pointerEvents="none" style={[styles.atlasCrop, placement.crop]}>
              <ExpoImage
                source={asset.source}
                contentFit="fill"
                allowDownscaling={props.allowDownscaling}
                cachePolicy="memory-disk"
                priority={imagePriority}
                transition={0}
                onDisplay={onDisplay}
                onError={onError}
                style={[styles.atlasImage, placement.atlas]}
              />
            </View>
          ) : null}
        </View>
      </Animated.View>
    )
  }
  return (
    <Animated.View pointerEvents="none" style={[styles.layer, visibility]}>
      <ExpoImage
        source={asset.source}
        contentFit="contain"
        allowDownscaling={props.allowDownscaling}
        cachePolicy="memory-disk"
        priority={imagePriority}
        transition={0}
        onDisplay={onDisplay}
        onError={onError}
        style={[
          styles.layer,
          getLayerFitStyle(layer)
        ]}
      />
    </Animated.View>
  )
})

/**
 * Draws one atlas crop exactly where the whole frame would land with
 * contentFit "contain" (see getRoomAvatarAtlasCropLayout). Offsets are
 * transforms, so they keep sub-pixel precision instead of snapping to the
 * layout pixel grid; only the clip edges snap, and those sit in the frame's
 * transparent padding.
 */
function getRoomAvatarAtlasCropPlacement(crop: RoomV2AssetCrop, box: RoomAvatarBoxSize) {
  const layout = getRoomAvatarAtlasCropLayout(crop, box, PixelRatio.roundToNearestPixel)
  if (!layout) return null
  return {
    crop: {
      width: layout.crop.width,
      height: layout.crop.height,
      transform: [{ translateX: layout.crop.left }, { translateY: layout.crop.top }]
    },
    atlas: {
      width: layout.atlas.width,
      height: layout.atlas.height,
      transform: [{ translateX: layout.atlas.left }, { translateY: layout.atlas.top }]
    }
  }
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
  },
  atlasCrop: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden"
  },
  atlasImage: {
    position: "absolute",
    left: 0,
    top: 0
  }
})
