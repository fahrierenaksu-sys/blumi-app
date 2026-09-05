import type {
  AvatarLoadout,
  CapabilityMap,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  normalizeCompleteAvatarSelection,
  projectAvatarLoadoutV1
} from "./avatarSelectionModel"

export type SaveProductionAvatarResult =
  | { kind: "updated"; selection: CompleteAvatarSelection }
  | { kind: "conflict"; current: CompleteAvatarSelection }

const AVATAR_SAVE_ABORTED_ERROR = "The operation was aborted"

export async function saveProductionAvatar(
  baseHttpUrl: string,
  sessionToken: string,
  input: { loadout: AvatarLoadout; revision: number },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  resolvedCapabilities?: Partial<CapabilityMap>
): Promise<SaveProductionAvatarResult> {
  if (signal?.aborted) throw new Error(AVATAR_SAVE_ABORTED_ERROR)
  const baseUrl = baseHttpUrl.endsWith("/")
    ? baseHttpUrl.slice(0, -1)
    : baseHttpUrl
  const canWriteV2 = resolvedCapabilities?.avatar_loadout_v2_write === true
  const declaredCapabilities = [
    ...(resolvedCapabilities?.avatar_loadout_v2_read
      ? ["avatar_loadout_v2_read"]
      : []),
    ...(canWriteV2 ? ["avatar_loadout_v2_write"] : [])
  ].join(",") || undefined
  const wireLoadout = canWriteV2
    ? input.loadout
    : projectAvatarLoadoutV1(input.loadout)
  const response = await awaitAvatarSaveResponse(
    fetcher(`${baseUrl}/v1/users/me/avatar`, {
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
    }),
    signal
  )
  const payload = await readJsonPayload(response)
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
  return { kind: "updated", selection }
}

function awaitAvatarSaveResponse(
  responsePromise: Promise<Response>,
  signal?: AbortSignal
): Promise<Response> {
  if (!signal) return responsePromise
  if (signal.aborted) return Promise.reject(new Error(AVATAR_SAVE_ABORTED_ERROR))

  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(new Error(AVATAR_SAVE_ABORTED_ERROR))
    const removeAbortListener = (): void => signal.removeEventListener("abort", onAbort)

    signal.addEventListener("abort", onAbort, { once: true })
    void responsePromise.then(
      (response) => {
        removeAbortListener()
        resolve(response)
      },
      (error: unknown) => {
        removeAbortListener()
        reject(error)
      }
    )
  })
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getApiErrorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : "We could not save your avatar yet."
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
