import type { FastifyRequest } from "fastify"
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityResolution,
  type CompleteAvatarSelection
} from "@blumi/contracts"
import {
  cloneAvatarLoadout,
  projectAvatarLoadoutV1
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
  allowV2: boolean
): CompleteAvatarSelection {
  return {
    presetId: selection.presetId,
    revision: selection.revision,
    loadout: allowV2
      ? cloneAvatarLoadout(selection.loadout)
      : projectAvatarLoadoutV1(selection.loadout)
  }
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
