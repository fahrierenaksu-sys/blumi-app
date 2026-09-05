export interface AvatarSetupLayoutMetrics {
  avatarSize: number
  compact: boolean
  mirrorMaxHeight: number
  mirrorMinHeight: number
  stageHeight: number
  veryCompact: boolean
}

export const AVATAR_STUDIO_CATEGORY_SEQUENCE = Object.freeze([
  "hair",
  "top",
  "bottom",
  "shoes"
] as const)

export type AvatarStudioCategory =
  (typeof AVATAR_STUDIO_CATEGORY_SEQUENCE)[number]

export interface AvatarStudioStageMetrics {
  avatarBottomInset: number
  avatarSize: number
  genderRailWidth: number
  orbitPod: Readonly<Record<AvatarStudioCategory, AvatarStudioOrbitPodPosition>>
  orbitPodHeight: number
  orbitPodWidth: number
  stageHeight: number
  stageWidth: number
}

export interface AvatarStudioOrbitPodPosition {
  side: "left" | "right"
  top: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function getAvatarSetupImmersiveStageHeight(
  compact: boolean,
  viewportHeight: number,
  veryCompact = false
): number {
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : compact ? 852 : 956

  if (veryCompact) {
    return clamp(Math.round(safeViewportHeight * 0.53), 344, 360)
  }

  if (compact) {
    return clamp(Math.round(safeViewportHeight * 0.46), 376, 404)
  }

  return clamp(Math.round(safeViewportHeight * 0.49), 436, 500)
}

export function getAvatarSetupTaskCardMinHeight(
  compact: boolean,
  veryCompact = false,
  viewportHeight = compact ? 852 : 956
): number {
  if (veryCompact) return 104
  if (!compact) return 144
  return viewportHeight < 900 ? 116 : 128
}

export function getAvatarSetupLayoutMetrics(
  height: number,
  width: number,
  fontScale: number
): AvatarSetupLayoutMetrics {
  const veryCompact = height < 700 || fontScale > 1.3
  const compact = height < 920 || fontScale > 1.12

  return {
    avatarSize: Math.min(
      width * 0.72,
      veryCompact ? 176 : compact ? 218 : 258
    ),
    compact,
    mirrorMaxHeight: veryCompact ? 280 : compact ? 350 : 430,
    mirrorMinHeight: veryCompact ? 235 : compact ? 285 : 330,
    stageHeight: veryCompact ? 215 : compact ? 270 : 326,
    veryCompact
  }
}

export function getAvatarStudioStageMetrics(
  compact: boolean,
  viewportWidth = compact ? 375 : 393,
  measuredStageWidth?: number,
  viewportHeight = compact ? 852 : 956,
  veryCompact = false
): AvatarStudioStageMetrics {
  const stageHeight = getAvatarSetupImmersiveStageHeight(
    compact,
    viewportHeight,
    veryCompact || viewportHeight < 700
  )
  const shellInset = compact ? 16 : 20
  const stageWidth = Math.max(
    0,
    measuredStageWidth ?? viewportWidth - shellInset * 2
  )
  // The studio is character-led: the canonical rig gets a taller centre
  // silhouette, while the surrounding pod lanes stay deliberately compact.
  const preferredAvatarSize = compact ? 260 : 292
  const avatarSize = Math.min(
    preferredAvatarSize,
    Math.max(compact ? 210 : 240, stageWidth - (compact ? 52 : 56))
  )
  const avatarBottomInset = compact ? 14 : 18
  const orbitPodHeight = compact ? 44 : 46
  const orbitPodWidth = Math.min(
    compact ? 102 : 106,
    Math.max(96, Math.floor(stageWidth * 0.31))
  )

  // Each pod follows the real rendered rig, not a screen row. This keeps the
  // controls tied to hair, torso, lower outfit and shoes when the avatar size
  // changes between Pro Max and compact layouts.
  const avatarHeight = avatarSize * 1.5
  const avatarTop = stageHeight - avatarBottomInset - avatarHeight
  const podTopForRigZone = (zoneRatio: number) =>
    Math.round(avatarTop + avatarHeight * zoneRatio - orbitPodHeight / 2)
  const orbitPod: Readonly<Record<AvatarStudioCategory, AvatarStudioOrbitPodPosition>> = {
    hair: {
      side: "left",
      top: podTopForRigZone(0.26) + (compact ? 10 : 8)
    },
    top: { side: "right", top: podTopForRigZone(0.55) },
    bottom: { side: "left", top: podTopForRigZone(0.72) },
    shoes: { side: "right", top: podTopForRigZone(0.91) }
  }

  return {
    avatarBottomInset,
    // Keep the character prominent while reserving a real outer rail for the
    // floating category pods. The stage is rendered inside the shell's
    // horizontal inset, so the size follows the viewport instead of letting
    // the controls collapse onto the body on narrower phones.
    avatarSize,
    genderRailWidth: compact ? 256 : 288,
    orbitPod,
    orbitPodHeight,
    orbitPodWidth,
    stageHeight,
    stageWidth
  }
}

export function getAvatarStudioNextIndex(
  currentIndex: number,
  itemCount: number,
  direction: -1 | 1
): number {
  if (itemCount <= 0) return 0
  const normalizedIndex = ((currentIndex % itemCount) + itemCount) % itemCount
  return (normalizedIndex + direction + itemCount) % itemCount
}
