import { memo, useMemo } from "react"
import { AvatarShowcase } from "../../avatar/components/AvatarShowcase"
import { avatarTryOnRenderer } from "../../avatar/model/avatarTryOnModel"
import { AVATAR_V2_CATALOG } from "../avatarV2Catalog"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import { ROOM_AVATAR_CATALOG } from "../room/avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "../room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../room/components/RoomAvatarRenderer2D"

export interface AvatarTryOnFigureProps {
  /** The look being tried on (a draft, never proof of ownership). */
  avatar?: Partial<UserAvatar>
  /** Catalog for the old drawing; defaults to the avatar V2 catalog. */
  catalog?: AvatarCatalogItem[]
  /** The box the figure fills (the old 256x384 canvas box of the surface). */
  width: number
  height: number
  accessibilityLabel: string
}

/**
 * The figure on a try-on surface (Wardrobe stage, Shop preview, avatar setup): a static stack of baked images, no
 * canvas. A look the 2.5D art fully covers draws as `AvatarShowcase` (front still, or the whole 3/4 still while the
 * front art is missing); a look with any piece the 2.5D art lacks keeps the old drawing for the whole figure, so the
 * person always sees what they try on. Swapping a piece is just a new layer list.
 */
export const AvatarTryOnFigure = memo(function AvatarTryOnFigure(props: AvatarTryOnFigureProps) {
  const { avatar, catalog = AVATAR_V2_CATALOG, width, height } = props
  const renderer = useMemo(() => avatarTryOnRenderer(avatar), [avatar])
  if (renderer === "showcase") {
    return (
      <AvatarShowcase
        loadout={avatar}
        crop="card"
        fallbackCrop="full"
        width={width}
        height={height}
        accessibilityLabel={props.accessibilityLabel}
      />
    )
  }
  return <LegacyTryOnFigure avatar={avatar} catalog={catalog} />
})

/** The old layered drawing, front idle, for looks the 2.5D art does not cover yet (until X15). */
const LegacyTryOnFigure = memo(function LegacyTryOnFigure(props: {
  avatar?: Partial<UserAvatar>
  catalog: AvatarCatalogItem[]
}) {
  const layers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar: props.avatar,
      avatarCatalog: props.catalog,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    })
    return getRoomAvatarRenderLayers({ appearance, catalog: ROOM_AVATAR_CATALOG, direction: "front", state: "idle" })
  }, [props.avatar, props.catalog])
  return <RoomAvatarRenderer2D layers={layers} />
})
