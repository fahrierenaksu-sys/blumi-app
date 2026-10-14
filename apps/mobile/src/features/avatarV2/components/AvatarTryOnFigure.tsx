import { memo } from "react"
import { AvatarShowcase } from "../../avatar/components/AvatarShowcase"
import type { UserAvatar } from "../avatarV2.types"

export interface AvatarTryOnFigureProps {
  /** The look being tried on (a draft, never proof of ownership). */
  avatar?: Partial<UserAvatar>
  /** The box the figure fills. */
  width: number
  height: number
  accessibilityLabel: string
}

/**
 * The figure on a try-on surface (Wardrobe stage, Shop preview, avatar setup): a static stack of baked images, no
 * canvas, drawn as `AvatarShowcase` (front still, or the whole 3/4 still while the front art is missing). Every
 * listed piece has 2.5D art; a piece without it (a retired old item, which coercion already reads as the starter)
 * draws as the body's starter piece in that slot. The pre-2.5D drawing is retired, so a look never falls back to it.
 */
export const AvatarTryOnFigure = memo(function AvatarTryOnFigure(props: AvatarTryOnFigureProps) {
  return (
    <AvatarShowcase
      loadout={props.avatar}
      crop="card"
      fallbackCrop="full"
      width={props.width}
      height={props.height}
      accessibilityLabel={props.accessibilityLabel}
    />
  )
})
