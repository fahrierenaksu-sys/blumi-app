import {
  isAcceptedAvatarLoadout,
  type CompleteAvatarSelection
} from "@blumi/contracts"
import {
  AVATAR_ITEM_RULES,
  createAvatarSelection,
  keepWornRetiredAvatarItems,
  replaceRetiredAvatarItems,
  validateAvatarLoadout,
  type AvatarItemRules,
  type AvatarLoadoutValidationCode
} from "@blumi/domain"
import type { AuthService } from "../auth/authService"
import type { EconomyService } from "../economy/economyService"
import {
  normalizeStoredAvatarSelection,
  resolveSemanticAvatarWrite
} from "./avatarSelectionPersistence"

export type SaveAvatarResult =
  | { kind: "updated"; selection: CompleteAvatarSelection }
  | { kind: "unauthorized" }
  | {
      kind: "invalid"
      code: AvatarLoadoutValidationCode | "invalid_revision"
      message: string
    }
  | { kind: "conflict"; current: CompleteAvatarSelection }

export interface AvatarService {
  saveAvatar(
    sessionToken: string,
    input: { loadout: unknown; revision: unknown; allowV2Write?: boolean },
    now?: Date
  ): Promise<SaveAvatarResult>
}

export interface AvatarServiceOptions {
  authService: AuthService
  economyService: EconomyService
  /** Avatar item facts the save rules read. Defaults to the live catalog; tests pass the fixture rules. */
  avatarRules?: AvatarItemRules
}

export function createAvatarService(options: AvatarServiceOptions): AvatarService {
  const avatarRules = options.avatarRules ?? AVATAR_ITEM_RULES
  return {
    async saveAvatar(sessionToken, input, now = new Date()) {
      const expectedRevision = input.revision
      if (
        !Number.isSafeInteger(expectedRevision) ||
        (expectedRevision as number) < 0 ||
        (expectedRevision as number) >= Number.MAX_SAFE_INTEGER
      ) {
        return {
          kind: "invalid",
          code: "invalid_revision",
          message: "Refresh your avatar and try again."
        }
      }

      const resolved = await options.authService.getSession(sessionToken, now)
      if (!resolved) return { kind: "unauthorized" }

      const inventory = await options.economyService.getInventory(
        resolved.account.userId,
        now
      )
      const currentLoadout = resolved.account.profile.avatar.loadout
      // An older build can still send retired pieces: the strict rules check the starter piece every read draws in
      // their place, and a retired piece the user still wears is put back before storing (keepWornRetiredAvatarItems).
      const requestedLoadout = isAcceptedAvatarLoadout(input.loadout)
        ? replaceRetiredAvatarItems(input.loadout, avatarRules)
        : input.loadout
      const semanticLoadout = isAcceptedAvatarLoadout(requestedLoadout) &&
          isAcceptedAvatarLoadout(currentLoadout)
        ? resolveSemanticAvatarWrite(requestedLoadout, currentLoadout, avatarRules)
        : requestedLoadout
      const validation = validateAvatarLoadout(
        semanticLoadout,
        inventory.ownedAvatarItemIds,
        avatarRules
      )
      if (!validation.ok) {
        return {
          kind: "invalid",
          code: validation.code,
          message: validation.message
        }
      }

      const storedAvatar = await options.authService.repository.getStoredAvatarLoadout(
        resolved.account.accountId
      )
      // A stale revision conflicts below anyway; only the row this save replaces may keep its retired pieces.
      const loadoutToStore = storedAvatar?.revision === (expectedRevision as number) && isAcceptedAvatarLoadout(input.loadout)
        ? keepWornRetiredAvatarItems({
          saved: validation.loadout,
          requested: input.loadout,
          stored: storedAvatar.loadout,
          ownedItemIds: inventory.ownedAvatarItemIds
        }, avatarRules)
        : validation.loadout
      const selection = createAvatarSelection(
        loadoutToStore,
        (expectedRevision as number) + 1
      )
      const update = await options.authService.repository.updateAvatarSelection({
        accountId: resolved.account.accountId,
        expectedRevision: expectedRevision as number,
        selection,
        now
      })
      if (update.kind === "missing") return { kind: "unauthorized" }
      if (update.kind === "conflict") {
        return { kind: "conflict", current: update.current }
      }
      const canonicalSelection = normalizeStoredAvatarSelection({
        presetId: update.account.profile.avatar.presetId,
        loadout: update.account.profile.avatar.loadout,
        revision: update.account.profile.avatar.revision
      }, avatarRules)
      return {
        kind: "updated",
        selection: cloneSelection(canonicalSelection)
      }
    }
  }
}

function cloneSelection(
  selection: CompleteAvatarSelection
): CompleteAvatarSelection {
  return {
    presetId: selection.presetId,
    revision: selection.revision,
    loadout: {
      ...selection.loadout,
      accessoryIds: [...selection.loadout.accessoryIds]
    }
  }
}
