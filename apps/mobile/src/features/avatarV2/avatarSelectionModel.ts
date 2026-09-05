import type {
  AvatarLoadout,
  AvatarLoadoutV1,
  AvatarLoadoutV2,
  AvatarSelection,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  projectAvatarLoadoutV1 as projectDomainAvatarLoadoutV1,
  toAvatarLoadoutV2
} from "@blumi/domain"
import {
  isAvatarLoadoutV1,
  isAvatarLoadoutV2
} from "@blumi/contracts"
import type { UserAvatar } from "./avatarV2.types"

export type CanonicalAvatarLoadout = AvatarLoadoutV2
export type CanonicalCompleteAvatarSelection = Omit<
  CompleteAvatarSelection,
  "loadout"
> & { loadout: CanonicalAvatarLoadout }

export function normalizeAvatarSelection(value: unknown): AvatarSelection | null {
  if (!isRecord(value) || !isItemId(value.presetId)) return null
  if (value.loadout === undefined && value.revision === undefined) {
    return { presetId: value.presetId }
  }
  return normalizeCompleteAvatarSelection(value)
}

export function normalizeCompleteAvatarSelection(
  value: unknown
): CanonicalCompleteAvatarSelection | null {
  if (!isRecord(value) || !isItemId(value.presetId)) return null
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    return null
  }
  const loadout = normalizeAvatarLoadout(value.loadout)
  if (!loadout || value.presetId !== loadout.bodyId) return null
  return {
    presetId: value.presetId,
    revision: value.revision as number,
    loadout
  }
}

export function normalizeAvatarLoadout(
  value: unknown
): CanonicalAvatarLoadout | null {
  if (!isRecord(value)) return null
  if (
    (!isAvatarLoadoutV1(value) && !isAvatarLoadoutV2(value)) ||
    value.accessoryIds.length > 6 ||
    new Set(value.accessoryIds).size !== value.accessoryIds.length
  ) return null
  return toAvatarLoadoutV2(value)
}

export function userAvatarToLoadout(avatar: UserAvatar): CanonicalAvatarLoadout {
  return {
    schemaVersion: 2,
    bodyId: avatar.bodyId,
    faceId: avatar.faceId,
    eyesId: avatar.eyesId,
    noseId: avatar.noseId,
    mouthId: avatar.mouthId,
    hairId: avatar.hairId,
    topId: avatar.topId,
    bottomId: avatar.bottomId,
    shoesId: avatar.shoesId,
    dressId: avatar.dressId ?? null,
    outerwearId: avatar.outerwearId ?? null,
    accessoryIds: [...avatar.accessoryIds]
  }
}

export function loadoutToUserAvatar(loadout: AvatarLoadout): UserAvatar {
  const canonical = normalizeAvatarLoadout(loadout)
  if (!canonical) {
    throw new Error("Avatar loadout is invalid.")
  }
  return {
    bodyId: canonical.bodyId,
    faceId: canonical.faceId,
    eyesId: canonical.eyesId,
    noseId: canonical.noseId,
    mouthId: canonical.mouthId,
    hairId: canonical.hairId,
    topId: canonical.topId,
    bottomId: canonical.bottomId,
    shoesId: canonical.shoesId,
    dressId: canonical.dressId,
    outerwearId: canonical.outerwearId,
    accessoryIds: [...canonical.accessoryIds]
  }
}

export function projectAvatarLoadoutV1(
  loadout: AvatarLoadout
): AvatarLoadoutV1 {
  const canonical = normalizeAvatarLoadout(loadout)
  if (!canonical) {
    throw new Error("Avatar loadout is invalid.")
  }
  return projectDomainAvatarLoadoutV1(canonical)
}

export function cloneAvatarSelection(selection: AvatarSelection): AvatarSelection {
  const complete = normalizeCompleteAvatarSelection(selection)
  return complete ?? { presetId: selection.presetId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isItemId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120 &&
    value.trim() === value
}
