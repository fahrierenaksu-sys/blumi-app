import { pickAvatarSwatch as pickSharedAvatarSwatch } from "@blumi/domain"

/**
 * The avatar circle colour for a person (seeded by their user id). The palette lives in @blumi/domain, so push
 * notification pictures drawn by the server use the same colour.
 */
export function pickAvatarSwatch(seed: string): { bg: string; fg: string } {
  return pickSharedAvatarSwatch(seed)
}
