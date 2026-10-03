import type {
  RoomV2AssetCrop,
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../roomV2/roomV2.types"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "./avatarRoomMotionContract"

export function getRoomAvatarLayerFrameAsset(
  layer: RoomV2AvatarRenderLayer,
  frameIndex: number
): RoomV2AssetRef {
  const frames = layer.animation?.frames
  if (!frames?.length) return layer.asset
  return frames[frameIndex % frames.length] ?? layer.asset
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

/** A semantic layer's stable identity across poses (the renderer's React key). */
export function getRoomAvatarLayerKey(layer: Pick<RoomV2AvatarRenderLayer, "id" | "type">): string {
  return `${layer.type}:${layer.id}`
}

/** One image of one layer: two keys are equal only when the drawn pixels are. */
export function getRoomAvatarImageKey(layerKey: string, asset: RoomV2AssetRef): string {
  const source = asset.source as unknown
  const sourceId = typeof source === "number"
    ? String(source)
    : (source as { uri?: unknown } | null)?.uri
  return `${layerKey}|${asset.key}|${typeof sourceId === "string" ? sourceId : ""}|${asset.integritySha256 ?? ""}`
}

export interface RoomAvatarTableImage {
  key: string
  layerKey: string
  asset: RoomV2AssetRef
}

/**
 * Every image an avatar shows, frame by frame. The avatar draws frame N only
 * when every layer's image for frame N has displayed, so body, hair and
 * clothes always change together (no tearing on a first walk or sit).
 */
export interface RoomAvatarFrameTable {
  /** Changes whenever any layer, or any layer's image at any frame, changes. */
  signature: string
  layerKeys: string[]
  /** frames[i][l]: the image key layer l shows at avatar frame i. */
  frames: string[][]
  /** The distinct images, in layer order. */
  images: RoomAvatarTableImage[]
}

export function getRoomAvatarFrameTable(
  layers: readonly RoomV2AvatarRenderLayer[],
  animated: boolean,
  frameCount: number
): RoomAvatarFrameTable {
  const layerKeys = layers.map(getRoomAvatarLayerKey)
  const images: RoomAvatarTableImage[] = []
  const seen = new Set<string>()
  const frames = Array.from({ length: animated ? Math.max(1, frameCount) : 1 }, (_, index) =>
    layers.map((layer, layerIndex) => {
      const layerKey = layerKeys[layerIndex]!
      const asset = getRoomAvatarLayerFrameAsset(layer, index)
      const key = getRoomAvatarImageKey(layerKey, asset)
      if (!seen.has(key)) {
        seen.add(key)
        images.push({ key, layerKey, asset })
      }
      return key
    })
  )
  return { signature: hashRoomAvatarKeys(frames), layerKeys, frames, images }
}

/** A short, stable signature (FNV-1a) so the UI thread compares a few bytes per frame. */
function hashRoomAvatarKeys(frames: readonly (readonly string[])[]): string {
  let hash = 0x811c9dc5
  let length = 0
  for (const frame of frames) {
    for (const key of frame) {
      for (let index = 0; index < key.length; index += 1) {
        hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193)
      }
      hash = Math.imul(hash ^ 0x1f, 0x01000193)
      length += key.length + 1
    }
    hash = Math.imul(hash ^ 0x1e, 0x01000193)
  }
  return `${(hash >>> 0).toString(36)}.${frames.length}.${length.toString(36)}`
}

/** True when every image of the frame has displayed (or failed, so it can never block). */
export function isRoomAvatarFrameDisplayed(
  frameKeys: readonly string[],
  displayed: Readonly<Record<string, boolean>>
): boolean {
  "worklet"
  for (let index = 0; index < frameKeys.length; index += 1) {
    if (!displayed[frameKeys[index]!]) return false
  }
  return true
}

/** Which image each layer shows for one frame. A layer absent here draws nothing. */
export function getRoomAvatarShownImages(
  layerKeys: readonly string[],
  frameKeys: readonly string[]
): Record<string, string> {
  "worklet"
  const shown: Record<string, string> = {}
  for (let index = 0; index < layerKeys.length; index += 1) {
    shown[layerKeys[index]!] = frameKeys[index]!
  }
  return shown
}

/** The frame the avatar shows now, tagged with the table it belongs to. */
export interface RoomAvatarAppliedFrame {
  signature: string
  index: number
}

/**
 * The frame to switch to: `targetIndex` once it is new and all its images have
 * displayed, otherwise -1 (hold the frame on screen, which may still belong to
 * the previous pose or outfit).
 */
export function getRoomAvatarFrameToApply(
  table: Pick<RoomAvatarFrameTable, "signature" | "frames">,
  targetIndex: number,
  displayed: Readonly<Record<string, boolean>>,
  applied: RoomAvatarAppliedFrame
): number {
  "worklet"
  const index = targetIndex % table.frames.length
  if (applied.signature === table.signature && applied.index === index) return -1
  return isRoomAvatarFrameDisplayed(table.frames[index]!, displayed) ? index : -1
}

/** The images one semantic layer keeps mounted. */
export interface RoomAvatarPoolLayer {
  key: string
  layer: RoomV2AvatarRenderLayer
  images: RoomAvatarTableImage[]
}

/**
 * Mount the table's images beside those already retained. A pose change keeps
 * the pose on screen (and a removed layer, such as the old top during an
 * outfit change) mounted until the new frame is ready to replace it. Returns
 * `pool` itself when nothing is new.
 */
export function addRoomAvatarTableToPool(
  pool: readonly RoomAvatarPoolLayer[],
  layers: readonly RoomV2AvatarRenderLayer[],
  table: RoomAvatarFrameTable
): readonly RoomAvatarPoolLayer[] {
  let next: RoomAvatarPoolLayer[] | null = null
  const layerByKey = new Map(layers.map((layer) => [getRoomAvatarLayerKey(layer), layer]))
  for (const image of table.images) {
    const working: readonly RoomAvatarPoolLayer[] = next ?? pool
    const index = working.findIndex((entry) => entry.key === image.layerKey)
    const entry = index >= 0 ? working[index] : undefined
    if (entry?.images.some((existing) => existing.key === image.key)) continue
    next ??= [...pool]
    if (entry) {
      next[index] = { ...entry, images: [...entry.images, image] }
    } else {
      next.push({ key: image.layerKey, layer: layerByKey.get(image.layerKey)!, images: [image] })
    }
  }
  if (!next) return pool
  // Stable by layer order; ties keep their mounting order.
  return next
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => a.entry.layer.layerOrder - b.entry.layer.layerOrder || a.order - b.order)
    .map(({ entry }) => entry)
}

/**
 * Unmount every image outside `keep` (the pose now on screen plus the idle
 * pose), so the pool never grows past the current motion and idle. Returns
 * `pool` itself when nothing is dropped.
 */
export function pruneRoomAvatarPool(
  pool: readonly RoomAvatarPoolLayer[],
  keep: ReadonlySet<string>
): readonly RoomAvatarPoolLayer[] {
  let changed = false
  const next: RoomAvatarPoolLayer[] = []
  for (const entry of pool) {
    const images = entry.images.filter((image) => keep.has(image.key))
    if (images.length !== entry.images.length) changed = true
    if (images.length) next.push(images.length === entry.images.length ? entry : { ...entry, images })
  }
  return changed ? next : pool
}

export interface RoomAvatarAtlasCropLayout {
  /** The clip view: its size, and where its top-left sits in the box. */
  crop: { left: number; top: number; width: number; height: number }
  /** The atlas image inside the clip view: its size and offset. */
  atlas: { left: number; top: number; width: number; height: number }
}

/**
 * Where an atlas crop goes so its pixels land exactly where the whole frame
 * would with contentFit "contain" in `box`: the frame's canvas is scaled by
 * min(box / canvas) and centred, the clip view covers the crop's rect on that
 * canvas, and the atlas is shifted so the crop's corner meets the clip's.
 * `roundSize` is the platform's pixel rounding of the atlas view size; the
 * shift uses the rounded scale so the crop's corner stays exact.
 */
export function getRoomAvatarAtlasCropLayout(
  crop: RoomV2AssetCrop,
  box: { width: number; height: number },
  roundSize: (value: number) => number = (value) => value
): RoomAvatarAtlasCropLayout | null {
  const scale = Math.min(box.width / crop.canvasWidth, box.height / crop.canvasHeight)
  if (!(scale > 0) || !Number.isFinite(scale)) return null
  const canvasLeft = (box.width - crop.canvasWidth * scale) / 2
  const canvasTop = (box.height - crop.canvasHeight * scale) / 2
  const atlasWidth = roundSize(crop.atlasWidth * scale)
  const atlasHeight = roundSize(crop.atlasHeight * scale)
  if (!(atlasWidth > 0) || !(atlasHeight > 0)) return null
  return {
    crop: {
      left: canvasLeft + crop.x * scale,
      top: canvasTop + crop.y * scale,
      width: crop.width * scale,
      height: crop.height * scale
    },
    atlas: {
      left: -crop.atlasX * (atlasWidth / crop.atlasWidth),
      top: -crop.atlasY * (atlasHeight / crop.atlasHeight),
      width: atlasWidth,
      height: atlasHeight
    }
  }
}
