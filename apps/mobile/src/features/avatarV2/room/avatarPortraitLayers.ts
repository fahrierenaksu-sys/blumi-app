import type { AvatarLoadout } from "@blumi/contracts"
import type { RoomV2AssetCrop, RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import { loadoutToUserAvatar } from "../avatarSelectionModel"
import { ROOM_AVATAR_CATALOG } from "./avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "./avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "./avatarRoomSelectors"
import { getRoomAvatarLayerFrameAsset } from "./roomAvatarLayerRenderModel"
import { pickAvatarSwatch } from "../../../ui/avatarSwatch"

/**
 * The still, front-facing layers of a user's chibi as every portrait shows it
 * (chat rows, invite cards, push notification pictures). The server bundles
 * this module (apps/server/scripts/build-avatar-portrait-layers.mjs), so the
 * notification picture is drawn from exactly the layers and order the app uses.
 */
export function resolveAvatarPortraitRenderLayers(loadout: AvatarLoadout): RoomV2AvatarRenderLayer[] {
  const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
    avatar: loadoutToUserAvatar(loadout)
  })
  return getRoomAvatarRenderLayers({
    appearance,
    catalog: ROOM_AVATAR_CATALOG,
    state: "idle",
    direction: "front"
  })
}

/** One still layer, back to front: an image file, or a crop of a sprite atlas. */
export interface AvatarPortraitStillLayer {
  type: string
  /** Whatever the bundler made of the image import (a file path on the server). */
  source: unknown
  crop?: RoomV2AssetCrop
}

/** The circle colour behind a person's chibi in chat rows, seeded by their user id. */
export function resolveAvatarPortraitBackground(seed: string): string {
  return pickAvatarSwatch(seed).bg
}

export function resolveAvatarPortraitStillLayers(loadout: AvatarLoadout): AvatarPortraitStillLayer[] {
  return resolveAvatarPortraitRenderLayers(loadout).map((layer) => {
    const asset = getRoomAvatarLayerFrameAsset(layer, 0)
    return { type: layer.type, source: asset.source, ...(asset.crop ? { crop: asset.crop } : {}) }
  })
}
