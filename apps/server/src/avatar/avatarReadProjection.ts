import type { FastifyRequest } from "fastify"
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityMap,
  type CapabilityResolution,
  type CompleteAvatarSelection
} from "@blumi/contracts"
import {
  AVATAR_ITEM_RULES,
  cloneAvatarLoadout,
  findAvatarRuleItem,
  projectAvatarLoadoutV1,
  type AvatarItemRules
} from "@blumi/domain"
import type { CapabilityService } from "../capabilities/capabilityService"

export const CLIENT_CAPABILITIES_HEADER = "x-blumi-client-capabilities"

export function resolveRequestCapabilities(
  request: Pick<FastifyRequest, "headers">,
  userId: string,
  capabilityService: CapabilityService
): CapabilityResolution {
  const declared = readDeclaredCapabilities(
    request.headers[CLIENT_CAPABILITIES_HEADER]
  )
  return capabilityService.resolve(userId, declared)
}

export function projectAvatarSelectionForRead(
  selection: CompleteAvatarSelection,
  allowV2: boolean,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): CompleteAvatarSelection {
  return {
    presetId: selection.presetId,
    revision: selection.revision,
    loadout: allowV2
      ? cloneAvatarLoadout(selection.loadout)
      : projectAvatarLoadoutV1(selection.loadout, rules)
  }
}

/**
 * The caller's OWN avatar (profile read, save reply, conflict reply). A client that cannot write V2 also cannot keep a
 * one-piece dress in a save, and builds up to beta-3 throw on an unknown `dressId` when they project their read to V1,
 * so every save would fail after a capability rollback (review slots_1330 LOW-2). Such a client reads the separates
 * stored under the dress (`dressId: null`). Storage is untouched: the server's V1 write keeps the stored dress while
 * the separates stay unchanged and drops it when the client changes them (avatarSelectionPersistence). Other people's
 * avatars (threads) are only drawn, so they keep the plain read projection.
 */
export function projectOwnAvatarSelectionForRead(
  selection: CompleteAvatarSelection,
  capabilities: Pick<CapabilityMap, "avatar_loadout_v2_read" | "avatar_loadout_v2_write">,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): CompleteAvatarSelection {
  const read = projectAvatarSelectionForRead(selection, capabilities.avatar_loadout_v2_read, rules)
  const loadout = read.loadout
  if (capabilities.avatar_loadout_v2_write || loadout.schemaVersion !== 2 || loadout.dressId === null) return read
  if (findAvatarRuleItem(rules, loadout.dressId)?.slot !== "dress") return read
  return { ...read, loadout: { ...loadout, dressId: null } }
}

function readDeclaredCapabilities(value: unknown): CapabilityKey[] | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  const entries = value.split(",").map((entry) => entry.trim())
  if (
    entries.some((entry) => !CAPABILITY_KEYS.includes(entry as CapabilityKey)) ||
    new Set(entries).size !== entries.length
  ) {
    return undefined
  }
  return entries as CapabilityKey[]
}
