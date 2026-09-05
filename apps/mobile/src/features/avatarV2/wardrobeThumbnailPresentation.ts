import type { AvatarItemType } from "./avatarV2.types"

export type WardrobeThumbnailFrame = "square" | "rig" | "legacy"

export interface WardrobeThumbnailPresentation {
  frame: WardrobeThumbnailFrame
  scale: number
  translateY: number
}

export function getWardrobeThumbnailPresentation(input: {
  type: AvatarItemType
  isRigLayer: boolean
  isSquareAsset: boolean
}): WardrobeThumbnailPresentation {
  // Room rig layers share the canonical 256x384 canvas and keep their keyed
  // offsets. Shop thumbnails are already square, so they must stay inside a
  // square contain frame or garments will be clipped by the card viewport.
  if (input.isRigLayer) {
    return {
      frame: "rig",
      scale: 1,
      translateY: 0
    }
  }

  if (
    input.isSquareAsset &&
    ["top", "bottom", "shoes"].includes(input.type)
  ) {
    return {
      frame: "square",
      scale: 1,
      translateY: 0
    }
  }

  return {
    frame: "legacy",
    scale: 1,
    translateY: 0
  }
}
