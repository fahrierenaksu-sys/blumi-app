import { uiTheme } from "./theme"

function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

/**
 * The avatar circle colour for a person (seeded by their user id). Push
 * notification pictures use the same colour (the server bundles this module
 * through features/avatarV2/room/avatarPortraitLayers.ts).
 */
export function pickAvatarSwatch(seed: string): { bg: string; fg: string } {
  const palette = uiTheme.palette.avatar
  return palette[hashSeed(seed) % palette.length]
}
