import type {
  RoomV2AssetRef,
  RoomV2AvatarRenderLayer
} from "../../roomV2/roomV2.types"

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
