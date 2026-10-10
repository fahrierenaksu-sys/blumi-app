import type { ImageSourcePropType } from "react-native"
import { resolveAvatarStillLayers, type AvatarLoadoutCoercionHints, type AvatarStillProduct } from "@blumi/domain"

/**
 * The bundled still layers a screen is about to draw for one loadout, as sources the image cache can prefetch (plan
 * S54). Total like the resolver: an unknown or old item draws the body's starter piece, so its layers are warmed
 * instead. Layers with no bundled asset are skipped, never thrown on.
 */
export function avatarStillWarmupSources(
  loadout: unknown,
  product: AvatarStillProduct,
  assets: Readonly<Record<string, number>>,
  hints?: AvatarLoadoutCoercionHints
): ImageSourcePropType[] {
  const { layers } = resolveAvatarStillLayers(loadout, product, { hints })
  return layers.flatMap((layer) => {
    const source = assets[layer.asset]
    return source === undefined ? [] : [source]
  })
}
