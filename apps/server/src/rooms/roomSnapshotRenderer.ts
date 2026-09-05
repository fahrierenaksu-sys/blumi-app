import { createHash } from "node:crypto"
import { access } from "node:fs/promises"
import { resolve } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import type { PersonalRoomDecor } from "./personalRoomDecorRepository"

export const ROOM_SNAPSHOT_RENDERER_VERSION = "room-snapshot-v1"
export const ROOM_SNAPSHOT_WIDTH = 600
export const ROOM_SNAPSHOT_HEIGHT = 342

interface RoomRenderAsset {
  path: string
  width: number
  height: number
  anchorX: number
  anchorY: number
  rotations?: Partial<Record<"front" | "back" | "left" | "right", string>>
}

export interface RoomSnapshotRenderResult {
  body: Buffer
  mimeType: "image/webp"
  rendererVersion: string
}

export interface RoomSnapshotRenderer {
  render(input: {
    decor: PersonalRoomDecor
    roomRevision: number
  }): Promise<RoomSnapshotRenderResult>
}

const mobileRoomAssetRoot = resolve(
  __dirname,
  "../../../mobile/src/features/roomV2/assets/runtime"
)

const renderAssets: Readonly<Record<string, RoomRenderAsset>> = {
  room_v2_chair_blush: {
    path: resolve(mobileRoomAssetRoot, "furniture_world_chair_v1.png"),
    width: 0.126,
    height: 0.244,
    anchorX: 0.5,
    anchorY: 1
  },
  room_v2_table_round: {
    path: resolve(mobileRoomAssetRoot, "furniture_world_table_v1.png"),
    width: 0.126,
    height: 0.168,
    anchorX: 0.5,
    anchorY: 1
  },
  room_v2_lamp_heart: {
    path: resolve(mobileRoomAssetRoot, "furniture_world_decor_v1.png"),
    width: 0.067,
    height: 0.235,
    anchorX: 0.5,
    anchorY: 1
  },
  room_v2_cozy_bed: {
    path: resolve(mobileRoomAssetRoot, "starter-pink-cloud-bed/pink_cloud_bed_front_v2.png"),
    width: 0.294,
    height: 0.196,
    anchorX: 0.5,
    anchorY: 1,
    rotations: {
      front: resolve(mobileRoomAssetRoot, "starter-pink-cloud-bed/pink_cloud_bed_front_v2.png"),
      right: resolve(mobileRoomAssetRoot, "starter-pink-cloud-bed/pink_cloud_bed_right_v2.png"),
      back: resolve(mobileRoomAssetRoot, "starter-pink-cloud-bed/pink_cloud_bed_back_v2.png"),
      left: resolve(mobileRoomAssetRoot, "starter-pink-cloud-bed/pink_cloud_bed_left_v2.png")
    }
  },
  room_v2_cute_bookshelf: {
    path: resolve(mobileRoomAssetRoot, "furniture_bookshelf_v1.webp"),
    width: 0.168,
    height: 0.252,
    anchorX: 0.5,
    anchorY: 0.88
  },
  room_v2_heart_rug: {
    path: resolve(mobileRoomAssetRoot, "furniture_heart_rug_v1.webp"),
    width: 0.21,
    height: 0.126,
    anchorX: 0.5,
    anchorY: 0.75
  },
  room_v2_side_table: {
    path: resolve(mobileRoomAssetRoot, "furniture_side_table_v1.png"),
    width: 0.126,
    height: 0.151,
    anchorX: 0.5,
    anchorY: 0.85
  }
}

export function createRoomSnapshotRenderer(): RoomSnapshotRenderer {
  return {
    async render({ decor }) {
      const shellPath = resolve(
        mobileRoomAssetRoot,
        "room_shell_blumi_world_v1.webp"
      )
      await access(shellPath)
      const shell = await sharp(shellPath)
        .resize(ROOM_SNAPSHOT_WIDTH, ROOM_SNAPSHOT_HEIGHT, { fit: "fill" })
        .ensureAlpha()
        .png()
        .toBuffer()

      const composites: OverlayOptions[] = []
      const placed = [...decor.placedItems]
        .map((item) => {
          const asset = renderAssets[item.itemId]
          if (!asset) {
            throw new Error(`Room snapshot asset is not promoted: ${item.itemId}`)
          }
          return { item, asset }
        })
        .sort((left, right) => left.item.y - right.item.y)

      for (const entry of placed) {
        const { item, asset } = entry
        const assetPath = asset.rotations?.[item.rotation] ?? asset.path
        await access(assetPath)
        const width = Math.max(1, Math.round(asset.width * ROOM_SNAPSHOT_WIDTH))
        const height = Math.max(1, Math.round(asset.height * ROOM_SNAPSHOT_HEIGHT))
        const left = Math.round(item.x * ROOM_SNAPSHOT_WIDTH - width * asset.anchorX)
        const top = Math.round(item.y * ROOM_SNAPSHOT_HEIGHT - height * asset.anchorY)
        composites.push({
          input: await sharp(assetPath).resize(width, height, { fit: "fill" }).png().toBuffer(),
          left,
          top
        })
      }

      return {
        body: await sharp(shell).composite(composites).webp({ quality: 86 }).toBuffer(),
        mimeType: "image/webp",
        rendererVersion: ROOM_SNAPSHOT_RENDERER_VERSION
      }
    }
  }
}

export function createRoomSnapshotAssetKey(
  userId: string,
  roomRevision: number,
  rendererVersion = ROOM_SNAPSHOT_RENDERER_VERSION
): string {
  return createHash("sha256")
    .update(`${rendererVersion}:${userId}:${roomRevision}`)
    .digest("hex")
}
