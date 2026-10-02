import type {
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../roomV2/roomV2.types"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "./avatarRoomMotionContract"

interface LayerFrame {
  layer: RoomV2AvatarRenderLayer
  frameIndex: number
}

export function getRoomAvatarLayerFrameAsset(
  layer: RoomV2AvatarRenderLayer,
  frameIndex: number
): RoomV2AssetRef {
  const frames = layer.animation?.frames
  if (!frames?.length) return layer.asset
  return frames[frameIndex % frames.length] ?? layer.asset
}

/** Motion may replace layer objects every frame without changing the image. */
export function shouldRerenderRoomAvatarLayer(
  previous: LayerFrame,
  next: LayerFrame
): boolean {
  if (
    previous.layer.id !== next.layer.id ||
    previous.layer.type !== next.layer.type ||
    previous.layer.fitProfileId !== next.layer.fitProfileId
  ) return true

  const previousAsset = getRoomAvatarLayerFrameAsset(previous.layer, previous.frameIndex)
  const nextAsset = getRoomAvatarLayerFrameAsset(next.layer, next.frameIndex)
  return previousAsset.key !== nextAsset.key ||
    previousAsset.source !== nextAsset.source ||
    previousAsset.integritySha256 !== nextAsset.integritySha256
}

function hasAnimatedLayerFrames(layer: RoomV2AvatarRenderLayer): boolean {
  return (layer.animation?.frames.length ?? 0) > 1
}

export interface RoomAvatarLayerAnimationState {
  hasAnimation: boolean
  frameCount: number
  frameDurationMs: number
  loops: boolean
  signature: string
}

/** One clock per avatar: the fastest layer sets the rate (never below 80 ms). */
export function getRoomAvatarLayerAnimationState(
  layers: readonly RoomV2AvatarRenderLayer[],
  animate: boolean
): RoomAvatarLayerAnimationState {
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

/**
 * The shared frame clock: tick N covers [N, N + 1) frame durations of the UI
 * frame timestamp, so every avatar changes frames on the same boundary.
 */
export function getRoomAvatarFrameTick(timestampMs: number, frameDurationMs: number): number {
  "worklet"
  return Math.floor(timestampMs / frameDurationMs)
}

/** Frame shown `offset` ticks after the motion started: loop, or hold the last frame. */
export function getRoomAvatarFrameIndex(offset: number, frameCount: number, loops: boolean): number {
  "worklet"
  const ticks = Math.max(0, offset)
  return loops ? ticks % frameCount : Math.min(ticks, frameCount - 1)
}

function isSameRoomAvatarAsset(a: RoomV2AssetRef, b: RoomV2AssetRef): boolean {
  return a.key === b.key && a.source === b.source && a.integritySha256 === b.integritySha256
}

/**
 * The distinct images a layer shows and which one each animation frame uses,
 * so each image mounts once and a frame change only flips visibility.
 */
export function getRoomAvatarLayerFrameSlots(layer: RoomV2AvatarRenderLayer): {
  assets: RoomV2AssetRef[]
  slotByFrame: number[]
} {
  const frames = layer.animation?.frames.length ? layer.animation.frames : [layer.asset]
  const assets: RoomV2AssetRef[] = []
  const slotByFrame = frames.map((frame) => {
    const existing = assets.findIndex((asset) => isSameRoomAvatarAsset(asset, frame))
    if (existing >= 0) return existing
    assets.push(frame)
    return assets.length - 1
  })
  return { assets, slotByFrame }
}

/** Keep decoded idle and motion images mounted for the lifetime of this layer. */
export function retainRoomAvatarFrameSlots(
  retained: RoomV2AssetRef[],
  frames: readonly RoomV2AssetRef[]
): { assets: RoomV2AssetRef[]; slotByFrame: number[] } {
  let assets = retained
  const slotByFrame = frames.map((frame) => {
    const existing = assets.findIndex((asset) => isSameRoomAvatarAsset(asset, frame))
    if (existing >= 0) return existing
    if (assets === retained) assets = [...retained]
    assets.push(frame)
    return assets.length - 1
  })
  return { assets, slotByFrame }
}

/** The image slot a layer shows at an avatar frame index (`getRoomAvatarLayerFrameAsset` order). */
export function getRoomAvatarLayerFrameSlot(slotByFrame: readonly number[], frameIndex: number): number {
  "worklet"
  return slotByFrame[frameIndex % slotByFrame.length] ?? 0
}

/** Hold the visible pose until the requested image has actually displayed. */
export function getRoomAvatarReadyFrameSlot(
  slotByFrame: readonly number[],
  frameIndex: number,
  displayedSlots: readonly number[],
  previousSlot = 0
): number {
  "worklet"
  const slot = getRoomAvatarLayerFrameSlot(slotByFrame, frameIndex)
  return displayedSlots.includes(slot) ? slot : previousSlot
}
