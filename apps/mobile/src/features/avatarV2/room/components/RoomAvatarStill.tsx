import { Image as ExpoImage } from "expo-image"
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from "react-native"
import { memo, useCallback, useState } from "react"
import type { RoomV2AssetRef, RoomV2AvatarRenderLayer } from "../../../roomV2/roomV2.types"
import {
  getRoomAvatarAtlasCropLayout,
  getRoomAvatarLayerFrameAsset
} from "../roomAvatarLayerRenderModel"

interface RoomAvatarStillProps {
  layers: readonly RoomV2AvatarRenderLayer[]
  imagePriority?: "low" | "normal" | "high"
  /**
   * Portraits are small, so by default the native image keeps the full sprite
   * and the GPU scales it. That avoids expo-image resizing every layer on the
   * main thread each time the view is shown.
   */
  allowDownscaling?: boolean
  onImageError?: () => void
}

/** One still layer: the frame-0 image the animated renderer shows when idle. */
export interface RoomAvatarStillLayer {
  key: string
  asset: RoomV2AssetRef
}

const MAX_CACHED_STILLS = 128
const stillsByContent = new Map<string, readonly RoomAvatarStillLayer[]>()
const contentKeyByLayers = new WeakMap<readonly RoomV2AvatarRenderLayer[], string>()

function describeSource(asset: RoomV2AssetRef): string {
  const { source } = asset
  if (typeof source === "number" || typeof source === "string") return String(source)
  if (source && typeof source === "object" && "uri" in source) return String((source as { uri?: unknown }).uri)
  return asset.key
}

function describeAsset(asset: RoomV2AssetRef): string {
  const { crop } = asset
  const cropPart = crop
    ? `${crop.x},${crop.y},${crop.width},${crop.height}@${crop.atlasX},${crop.atlasY}`
    : ""
  return `${asset.key}|${describeSource(asset)}|${asset.integritySha256 ?? ""}|${cropPart}`
}

/**
 * What the portrait draws, as text: layer identity, order and frame-0 image.
 * Two layer arrays with the same key draw the same pixels, whatever their
 * object identity.
 */
export function getRoomAvatarStillKey(layers: readonly RoomV2AvatarRenderLayer[]): string {
  const cached = contentKeyByLayers.get(layers)
  if (cached !== undefined) return cached
  const key = layers
    .map((layer) => `${layer.type}:${layer.id}:${layer.fitProfileId ?? ""}:${describeAsset(getRoomAvatarLayerFrameAsset(layer, 0))}`)
    .join("\n")
  contentKeyByLayers.set(layers, key)
  return key
}

/** The still layers, back to front, shared by every portrait of the same look. */
export function getRoomAvatarStillLayers(layers: readonly RoomV2AvatarRenderLayer[]): readonly RoomAvatarStillLayer[] {
  const key = getRoomAvatarStillKey(layers)
  const known = stillsByContent.get(key)
  if (known) return known
  const stills = layers.map((layer): RoomAvatarStillLayer => ({
    key: `${layer.type}:${layer.id}`,
    asset: getRoomAvatarLayerFrameAsset(layer, 0)
  }))
  if (stillsByContent.size >= MAX_CACHED_STILLS) {
    const oldest = stillsByContent.keys().next().value
    if (oldest !== undefined) stillsByContent.delete(oldest)
  }
  stillsByContent.set(key, stills)
  return stills
}

interface BoxSize {
  width: number
  height: number
}

/**
 * Still portrait of a layered avatar: a plain View and one native image per
 * layer, in the renderer's order and at the renderer's frame-0 position. No
 * shared values, animated styles or frame clock, so a list of portraits mounts
 * and scrolls without Reanimated work. Use RoomAvatarRenderer2D for anything
 * that moves.
 */
export const RoomAvatarStill = memo(
  function RoomAvatarStill(props: RoomAvatarStillProps) {
    const { layers, imagePriority = "normal", allowDownscaling = false, onImageError } = props
    const stills = getRoomAvatarStillLayers(layers)
    const hasAtlasCrop = stills.some((still) => still.asset.crop)
    // Atlas crops are placed from the laid-out size; plain images need no layout.
    const [boxSize, setBoxSize] = useState<BoxSize | null>(null)
    const onLayout = useCallback((event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout
      setBoxSize((previous) =>
        previous && previous.width === width && previous.height === height ? previous : { width, height })
    }, [])
    return (
      <View pointerEvents="none" style={styles.root} onLayout={hasAtlasCrop ? onLayout : undefined}>
        {stills.map(({ key, asset }) => {
          if (!asset.crop) {
            return (
              <ExpoImage
                key={key}
                source={asset.source}
                contentFit="contain"
                allowDownscaling={allowDownscaling}
                cachePolicy="memory-disk"
                priority={imagePriority}
                recyclingKey={asset.key}
                transition={0}
                onError={onImageError}
                style={styles.layer}
              />
            )
          }
          const layout = boxSize
            ? getRoomAvatarAtlasCropLayout(asset.crop, boxSize, PixelRatio.roundToNearestPixel)
            : null
          return (
            <View key={key} pointerEvents="none" style={styles.layer}>
              {layout ? (
                <View
                  pointerEvents="none"
                  style={[styles.atlasCrop, {
                    width: layout.crop.width,
                    height: layout.crop.height,
                    transform: [{ translateX: layout.crop.left }, { translateY: layout.crop.top }]
                  }]}
                >
                  <ExpoImage
                    source={asset.source}
                    contentFit="fill"
                    allowDownscaling={allowDownscaling}
                    cachePolicy="memory-disk"
                    priority={imagePriority}
                    recyclingKey={asset.key}
                    transition={0}
                    onError={onImageError}
                    style={[styles.atlasImage, {
                      width: layout.atlas.width,
                      height: layout.atlas.height,
                      transform: [{ translateX: layout.atlas.left }, { translateY: layout.atlas.top }]
                    }]}
                  />
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    )
  },
  (previous, next) =>
    previous.imagePriority === next.imagePriority &&
    previous.allowDownscaling === next.allowDownscaling &&
    previous.onImageError === next.onImageError &&
    (previous.layers === next.layers || getRoomAvatarStillKey(previous.layers) === getRoomAvatarStillKey(next.layers))
)

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
