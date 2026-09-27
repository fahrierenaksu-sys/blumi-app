import type { AvatarSelection } from "@blumi/contracts"
import type { UserAvatar } from "./avatarV2.types"
import {
  loadoutToUserAvatar,
  normalizeCompleteAvatarSelection
} from "./avatarSelectionModel"
import { resolveInitialAvatarV2 } from "./avatarV2Persistence"

/** Production surfaces use the same saved selection as discovery and profile. */
export function resolveMyRoomAvatarSource(
  localAvatar: UserAvatar,
  savedSelection: AvatarSelection | undefined,
  serverAuthoritative: boolean
): UserAvatar {
  if (!serverAuthoritative) return localAvatar
  const saved = normalizeCompleteAvatarSelection(savedSelection)
  if (saved) return loadoutToUserAvatar(saved.loadout)
  return savedSelection?.presetId
    ? resolveInitialAvatarV2(savedSelection.presetId)
    : localAvatar
}
