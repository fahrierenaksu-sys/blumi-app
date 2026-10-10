import { useMemo } from "react"
import { userAvatarToLoadout } from "../avatarV2/avatarSelectionModel"
import { useAvatarV2 } from "../avatarV2/state/AvatarV2Provider"

/** The viewer's own loadout for the 2.5D avatar components: stable until the avatar actually changes. */
export function useOwnAvatarLoadout() {
  const { avatar } = useAvatarV2()
  return useMemo(() => userAvatarToLoadout(avatar), [avatar])
}
