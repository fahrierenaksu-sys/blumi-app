import type {
  AvatarLoadout,
  CapabilityMap,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  normalizeCompleteAvatarSelection,
  projectAvatarLoadoutV1
} from "./avatarSelectionModel"
import { requestJson } from "../network/apiClient"
import { AVATAR_ITEM_RULES, type AvatarItemRules } from "@blumi/domain"
import { lostRequestedDress, ONE_PIECE_DRESS_NOT_SAVED_MESSAGE } from "./avatarDressWriteGate"

export type SaveProductionAvatarResult =
  | { kind: "updated"; selection: CompleteAvatarSelection }
  | {
    kind: "conflict"
    current: CompleteAvatarSelection
    /** Why the server look differs, when it is not another device (shown to the user as is). */
    message?: string
  }

const AVATAR_SAVE_ABORTED_ERROR = "The operation was aborted"

export async function saveProductionAvatar(
  baseHttpUrl: string,
  sessionToken: string,
  input: { loadout: AvatarLoadout; revision: number },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  resolvedCapabilities?: Partial<CapabilityMap>,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): Promise<SaveProductionAvatarResult> {
  if (signal?.aborted) throw new Error(AVATAR_SAVE_ABORTED_ERROR)
  const canWriteV2 = resolvedCapabilities?.avatar_loadout_v2_write === true
  const declaredCapabilities = [
    ...(resolvedCapabilities?.avatar_loadout_v2_read
      ? ["avatar_loadout_v2_read"]
      : []),
    ...(canWriteV2 ? ["avatar_loadout_v2_write"] : [])
  ].join(",") || undefined
  const wireLoadout = canWriteV2
    ? input.loadout
    : projectAvatarLoadoutV1(input.loadout, rules)
  let result: Awaited<ReturnType<typeof requestJson>>
  try {
    result = await requestJson(baseHttpUrl, "/v1/users/me/avatar", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
        ...(declaredCapabilities
          ? { "x-blumi-client-capabilities": declaredCapabilities }
          : {})
      },
      body: JSON.stringify({ loadout: wireLoadout, revision: input.revision }),
      signal
    }, fetcher)
  } catch (error) {
    // Keep the established avatar-save cancellation error for callers.
    if (signal?.aborted) throw new Error(AVATAR_SAVE_ABORTED_ERROR)
    throw error
  }
  const { response, payload } = result
  if (
    response.status === 409 &&
    isRecord(payload) &&
    payload.code === "AVATAR_REVISION_CONFLICT"
  ) {
    const current = normalizeCompleteAvatarSelection(
      payload.current
    )
    if (!current) {
      throw new Error("Blumi could not resolve the latest avatar safely.")
    }
    return { kind: "conflict", current }
  }
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload))
  }
  const selection = normalizeCompleteAvatarSelection(
    isRecord(payload) ? payload.avatar : null
  )
  if (!selection) {
    throw new Error("Blumi could not confirm your saved avatar.")
  }
  // V1 cannot carry a one-piece dress: a look that lost it is the server's look plus a notice, never a silent success
  if (!canWriteV2 && lostRequestedDress(input.loadout, selection.loadout)) {
    return { kind: "conflict", current: selection, message: ONE_PIECE_DRESS_NOT_SAVED_MESSAGE }
  }
  return { kind: "updated", selection }
}

function getApiErrorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : "We could not save your avatar yet."
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
