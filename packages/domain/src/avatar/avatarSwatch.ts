/**
 * The avatar circle colours (a person's swatch, seeded by their user id). Shared so the app's portrait circles and
 * the server's push pictures always agree.
 */
export interface AvatarSwatch {
  readonly bg: string;
  readonly fg: string;
}

export const AVATAR_SWATCHES: readonly AvatarSwatch[] = [
  { bg: "#FFD9E8", fg: "#9E1F56" },
  { bg: "#E3DAF8", fg: "#5A3FB5" },
  { bg: "#D6EEFF", fg: "#1D5A8C" },
  { bg: "#FFE4CC", fg: "#9C4B16" },
  { bg: "#D9F0E0", fg: "#236C4D" },
  { bg: "#FFE8F0", fg: "#B93872" },
  { bg: "#E8E0F5", fg: "#4A2F87" },
  { bg: "#FEEBC8", fg: "#7A4B09" },
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function pickAvatarSwatch(seed: string): AvatarSwatch {
  return AVATAR_SWATCHES[hashSeed(seed) % AVATAR_SWATCHES.length]!;
}
