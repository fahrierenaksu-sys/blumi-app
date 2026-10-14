import type {
  AvatarLoadout,
  AvatarLoadoutV1,
  AvatarLoadoutV2,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  isAvatarLoadoutV1,
  isAvatarLoadoutV2
} from "@blumi/contracts"
import {
  AVATAR_ITEM_RULES,
  cloneAvatarLoadout,
  coerceAvatarLoadout,
  findAvatarRuleItem,
  toAvatarLoadoutV2,
  type AvatarItemRules
} from "@blumi/domain"

export interface StoredAvatarSelectionInput {
  presetId: unknown
  loadout: unknown
  revision: unknown
  /**
   * The profile's gender (`identity_gender`, else `gender`) when the caller
   * has it. It only picks the body for a legacy preset such as `dusk`.
   */
  genderHint?: unknown
}

/**
 * Tolerant read of a stored avatar (plan §2.4). It throws only for a broken
 * envelope: a loadout that is not an object, or a bad revision. Any item ID,
 * unknown, retired or for the other body, is drawn as that body's starter
 * piece, and the preset becomes the body. It never writes: the user's next
 * save stores a loadout that `validateAvatarLoadout` checks strictly.
 */
export function normalizeStoredAvatarSelection(
  input: StoredAvatarSelectionInput,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): CompleteAvatarSelection {
  if (!isRecord(input.loadout) || !isAvatarRevision(input.revision)) {
    throw invalidStoredAvatarSelection()
  }
  const loadout = coerceAvatarLoadout(input.loadout, {
    presetId: input.presetId,
    gender: input.genderHint
  }, rules)
  return {
    presetId: loadout.bodyId,
    loadout,
    revision: input.revision
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
  current: AvatarLoadout,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadout {
  if (!isAvatarLoadoutV1(requested)) return cloneAvatarLoadout(requested)

  const converted = toAvatarLoadoutV2(requested, rules)
  if (!isAvatarLoadoutV2(current) && converted.dressId === null) {
    return cloneAvatarLoadout(requested)
  }
  return {
    ...converted,
    dressId: converted.dressId ?? keptOnePieceDress(requested, current, rules),
    outerwearId: isAvatarLoadoutV2(current) ? current.outerwearId : null,
    accessoryIds: [...converted.accessoryIds]
  } satisfies AvatarLoadoutV2
}

/**
 * A V1 client sees a worn one-piece dress as the separates stored under it (`projectAvatarLoadoutV1`). Its write keeps
 * the dress while it leaves those separates as they are, and takes it off when it changes the top or the bottom.
 */
function keptOnePieceDress(
  requested: AvatarLoadoutV1,
  current: AvatarLoadout,
  rules: AvatarItemRules
): string | null {
  if (!isAvatarLoadoutV2(current) || current.dressId === null) return null
  if (findAvatarRuleItem(rules, current.dressId)?.slot !== "dress") return null
  const untouched = requested.bodyId === current.bodyId &&
    requested.topId === current.topId && requested.bottomId === current.bottomId
  return untouched ? current.dressId : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAvatarRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function invalidStoredAvatarSelection(): Error {
  return new Error("Stored avatar selection is invalid.")
}
