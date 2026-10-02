/**
 * How the avatar answers a try-on (wardrobe equip, shop preview): the old
 * look crossfades out over the new one, and the body gives a small hop
 * (0.97 → 1 on the bouncy spring). Reduce Motion keeps the crossfade (fading
 * is not movement) and drops the hop. The first look on mount and a render
 * with the same look do nothing.
 */
export const AVATAR_TRY_ON_HOP_FROM_SCALE = 0.97

export interface AvatarTryOnSwap {
  crossfade: boolean
  hop: boolean
}

const NO_SWAP: AvatarTryOnSwap = { crossfade: false, hop: false }

export function resolveAvatarTryOnSwap(input: {
  previousKey: string | null
  nextKey: string
  reduceMotion: boolean
}): AvatarTryOnSwap {
  if (input.previousKey === null || input.previousKey === input.nextKey) return NO_SWAP
  return { crossfade: true, hop: !input.reduceMotion }
}

/**
 * A stable key for what an avatar wears: equal keys draw the same look, so
 * a re-render with a new object of the same outfit never replays the swap.
 */
export function getAvatarTryOnKey(avatar: object): string {
  return JSON.stringify(avatar, Object.keys(flattenKeys(avatar)).sort())
}

function flattenKeys(value: unknown, keys: Record<string, true> = {}): Record<string, true> {
  if (Array.isArray(value)) {
    for (const entry of value) flattenKeys(entry, keys)
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys[key] = true
      flattenKeys(entry, keys)
    }
  }
  return keys
}
