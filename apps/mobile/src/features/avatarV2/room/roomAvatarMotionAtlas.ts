import type { RoomV2AssetCrop, RoomV2AssetRef } from "../../roomV2/roomV2.types"
import manifest from "./roomAvatarMotionAtlas.json"
import { ROOM_AVATAR_MOTION_ATLAS_SOURCES } from "./roomAvatarMotionAtlasSources"

/** A room motion frame stored as a crop of a sprite atlas. */
export interface RoomAvatarAtlasFrame {
  source: RoomV2AssetRef["source"]
  crop: RoomV2AssetCrop
}

/** What a motion asset module passes for one frame: a file or an atlas crop. */
export type RoomAvatarFrameSource = RoomV2AssetRef["source"] | RoomAvatarAtlasFrame

interface ManifestFrame {
  atlas: number
  atlasX: number
  atlasY: number
  x: number
  y: number
  width: number
  height: number
}
const frames: Record<string, ManifestFrame | undefined> = manifest.frames

/**
 * The atlas crop that replaces `assets/room/motion/<name>.png`. Frames are
 * packed by scripts/build-room-motion-atlases.mjs; an unknown name is a
 * build mistake, so it fails when the asset module loads.
 */
export function roomAvatarMotionAtlasFrame(name: string): RoomAvatarAtlasFrame {
  const frame = frames[name]
  const atlas = frame ? manifest.atlases[frame.atlas] : undefined
  const source = frame ? ROOM_AVATAR_MOTION_ATLAS_SOURCES[frame.atlas] : undefined
  if (!frame || !atlas || source === undefined) {
    throw new Error(`Room motion frame ${name} is not in the motion atlas. Run scripts/build-room-motion-atlases.mjs.`)
  }
  return {
    source,
    crop: {
      sourceName: name,
      canvasWidth: manifest.canvas.width,
      canvasHeight: manifest.canvas.height,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      atlasX: frame.atlasX,
      atlasY: frame.atlasY,
      atlasWidth: atlas.width,
      atlasHeight: atlas.height
    }
  }
}

export function isRoomAvatarAtlasFrame(value: RoomAvatarFrameSource): value is RoomAvatarAtlasFrame {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "crop" in value
}

/** One frame reference, keeping the atlas crop when the frame is packed. */
export function roomAvatarFrameAsset(key: string, input: RoomAvatarFrameSource): RoomV2AssetRef {
  return isRoomAvatarAtlasFrame(input)
    ? { key, source: input.source, crop: input.crop }
    : { key, source: input }
}
