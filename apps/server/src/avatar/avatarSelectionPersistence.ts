import type {
  AvatarLoadout,
  AvatarLoadoutV2,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  isAvatarLoadoutV1,
  isAvatarLoadoutV2
} from "@blumi/contracts"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  cloneAvatarLoadout,
  isRetiredAvatarItemId,
  toAvatarLoadoutV2,
  validateAvatarLoadout
} from "@blumi/domain"

const MAX_PRESET_ID_LENGTH = 120
const catalogItemIds = AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)

export interface StoredAvatarSelectionInput {
  presetId: unknown
  loadout: unknown
  revision: unknown
}

export function normalizeStoredAvatarSelection(
  input: StoredAvatarSelectionInput
): CompleteAvatarSelection {
  if (!isStoredPresetId(input.presetId) || !isAvatarRevision(input.revision)) {
    throw invalidStoredAvatarSelection()
  }
  const loadoutResult = validateAvatarLoadout(
    sanitizeStoredAvatarLoadout(input.loadout),
    catalogItemIds
  )
  if (!loadoutResult.ok) {
    throw invalidStoredAvatarSelection()
  }
  if (input.presetId !== loadoutResult.loadout.bodyId) {
    throw invalidStoredAvatarSelection()
  }
  return {
    presetId: input.presetId,
    loadout: loadoutResult.loadout,
    revision: input.revision
  }
}

function sanitizeStoredAvatarLoadout(value: unknown): unknown {
  if (!isAvatarLoadoutV1(value) && !isAvatarLoadoutV2(value)) return value
  const retiredTop = isRetiredAvatarItemId(value.topId)
  const retiredBottom = isRetiredAvatarItemId(value.bottomId)
  const retiredHair = isRetiredAvatarItemId(value.hairId)
  const unsupportedOuterwear = value.schemaVersion === 2 && value.outerwearId !== null
  if (!retiredTop && !retiredBottom && !retiredHair && !unsupportedOuterwear) return value
  const starter = value.bodyId === DEFAULT_MALE_AVATAR_LOADOUT.bodyId
    ? DEFAULT_MALE_AVATAR_LOADOUT
    : DEFAULT_FEMALE_AVATAR_LOADOUT
  return {
    ...value,
    topId: retiredTop ? starter.topId : value.topId,
    bottomId: retiredBottom ? starter.bottomId : value.bottomId,
    hairId: retiredHair ? starter.hairId : value.hairId,
    ...(value.schemaVersion === 2 ? { outerwearId: null } : {})
  }
}

export function cloneCompleteAvatarSelection(
  selection: CompleteAvatarSelection
): CompleteAvatarSelection {
  return normalizeStoredAvatarSelection(selection)
}

/**
 * Interprets a legacy write as a semantic edit of the current avatar. A V1
 * client cannot express outerwear, so it must not accidentally clear a layer
 * that a V2 client already equipped. Legacy paired top/bottom dresses are
 * promoted to the canonical V2 dress slot.
 */
export function resolveSemanticAvatarWrite(
  requested: AvatarLoadout,
  current: AvatarLoadout
): AvatarLoadout {
  if (!isAvatarLoadoutV1(requested)) return cloneAvatarLoadout(requested)

  const converted = toAvatarLoadoutV2(requested)
  if (!isAvatarLoadoutV2(current) && converted.dressId === null) {
    return cloneAvatarLoadout(requested)
  }
  return {
    ...converted,
    outerwearId: isAvatarLoadoutV2(current) ? current.outerwearId : null,
    accessoryIds: [...converted.accessoryIds]
  } satisfies AvatarLoadoutV2
}

function isStoredPresetId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PRESET_ID_LENGTH &&
    value.trim() === value
}

function isAvatarRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function invalidStoredAvatarSelection(): Error {
  return new Error("Stored avatar selection is invalid.")
}
