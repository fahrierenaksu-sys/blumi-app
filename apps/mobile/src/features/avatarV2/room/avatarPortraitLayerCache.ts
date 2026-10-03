import type { AvatarLoadout } from "@blumi/contracts"
import type { RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import { resolveAvatarPortraitRenderLayers } from "./avatarPortraitLayers"

const MAX_CACHED_PORTRAITS = 64
const layersByLoadout = new Map<string, RoomV2AvatarRenderLayer[]>()

/** A loadout as text, so equal looks share one resolved layer list. */
export function getAvatarLoadoutKey(loadout: AvatarLoadout): string {
  return JSON.stringify(loadout)
}

/**
 * Portrait layers for a loadout, resolved once per distinct look. Chat rows and
 * headers rebuild their avatar objects often (every list or realtime update);
 * the same loadout always returns the same array.
 */
export function getCachedAvatarPortraitLayers(loadout: AvatarLoadout): RoomV2AvatarRenderLayer[] {
  const key = getAvatarLoadoutKey(loadout)
  const known = layersByLoadout.get(key)
  if (known) return known
  const layers = resolveAvatarPortraitRenderLayers(loadout)
  if (layersByLoadout.size >= MAX_CACHED_PORTRAITS) {
    const oldest = layersByLoadout.keys().next().value
    if (oldest !== undefined) layersByLoadout.delete(oldest)
  }
  layersByLoadout.set(key, layers)
  return layers
}
