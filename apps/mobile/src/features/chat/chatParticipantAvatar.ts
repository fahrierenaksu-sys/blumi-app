import type {
  AvatarSelection,
  CompleteAvatarSelection
} from "@blumi/contracts"
import { normalizeCompleteAvatarSelection } from "../avatarV2/avatarSelectionModel"

/**
 * Chat can render a layered avatar only when the server supplied a complete,
 * canonical selection. Legacy and malformed records retain the monogram path.
 */
export function getCanonicalChatParticipantAvatar(
  participant: ({ avatar?: unknown } & Record<string, unknown>) | null | undefined
): CompleteAvatarSelection | null {
  const complete = normalizeCompleteAvatarSelection(participant?.avatar)
  if (!complete) return null
  return {
    presetId: complete.presetId,
    revision: complete.revision,
    loadout: {
      ...complete.loadout,
      accessoryIds: [...complete.loadout.accessoryIds]
    }
  }
}

/**
 * Keeps memoized chat rows fresh when a server-authoritative avatar changes,
 * while treating missing and malformed legacy data as the same monogram view.
 */
export function areChatParticipantAvatarsEquivalent(
  first: AvatarSelection | undefined,
  second: AvatarSelection | undefined
): boolean {
  if (first === second) return true

  const firstCanonical = getCanonicalChatParticipantAvatar(
    first ? { avatar: first } : null
  )
  const secondCanonical = getCanonicalChatParticipantAvatar(
    second ? { avatar: second } : null
  )
  if (!firstCanonical || !secondCanonical) {
    return firstCanonical === secondCanonical
  }

  const firstDressId =
    firstCanonical.loadout.schemaVersion === 2 ? firstCanonical.loadout.dressId : null
  const secondDressId =
    secondCanonical.loadout.schemaVersion === 2 ? secondCanonical.loadout.dressId : null
  const firstOuterwearId =
    firstCanonical.loadout.schemaVersion === 2 ? firstCanonical.loadout.outerwearId : null
  const secondOuterwearId =
    secondCanonical.loadout.schemaVersion === 2 ? secondCanonical.loadout.outerwearId : null

  return (
    firstCanonical.presetId === secondCanonical.presetId &&
    firstCanonical.revision === secondCanonical.revision &&
    firstCanonical.loadout.schemaVersion === secondCanonical.loadout.schemaVersion &&
    firstCanonical.loadout.bodyId === secondCanonical.loadout.bodyId &&
    firstCanonical.loadout.faceId === secondCanonical.loadout.faceId &&
    firstCanonical.loadout.eyesId === secondCanonical.loadout.eyesId &&
    firstCanonical.loadout.noseId === secondCanonical.loadout.noseId &&
    firstCanonical.loadout.mouthId === secondCanonical.loadout.mouthId &&
    firstCanonical.loadout.hairId === secondCanonical.loadout.hairId &&
    firstCanonical.loadout.topId === secondCanonical.loadout.topId &&
    firstCanonical.loadout.bottomId === secondCanonical.loadout.bottomId &&
    firstDressId === secondDressId &&
    firstOuterwearId === secondOuterwearId &&
    firstCanonical.loadout.shoesId === secondCanonical.loadout.shoesId &&
    firstCanonical.loadout.accessoryIds.length ===
      secondCanonical.loadout.accessoryIds.length &&
    firstCanonical.loadout.accessoryIds.every(
      (accessoryId, index) =>
        accessoryId === secondCanonical.loadout.accessoryIds[index]
    )
  )
}
